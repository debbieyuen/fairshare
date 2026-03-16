let currentMeetUrl = null;
let meetScanTimer = null;
let meetStream = null;
let meetChannel = null;
let meetHandled = false; // prevent duplicate scans

async function openMeetScreen() {
    if (!currentUser) return;

    meetHandled = false;

    // 1. Request camera FIRST — iOS Safari requires getUserMedia to be called
    //    in the direct user-gesture call stack (before any await to network).
    //    Use ideal facingMode so it falls back gracefully on all devices.
    let cameraOk = false;
    try {
        meetStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }
        });
        cameraOk = true;
    } catch (camErr) {
        console.warn('[meet] Camera access denied or unavailable:', camErr);
    }

    // 2. Show the overlay immediately (camera preview + loading QR)
    document.getElementById('meetOverlay').classList.remove('hidden');
    document.getElementById('meetScanHint').textContent = cameraOk
        ? 'Point at the other person\'s QR code'
        : 'Camera unavailable — ask the other person to scan your code';
    document.getElementById('meetQrBox').innerHTML =
        '<div style="color:var(--dark-gray);font-size:0.85rem;padding:1rem;">Loading…</div>';

    // 3. Attach camera to video element if available
    if (cameraOk) {
        const video = document.getElementById('meetVideo');
        video.srcObject = meetStream;
        try { await video.play(); } catch (_) { /* iOS sometimes ignores this */ }
    }

    // 4. Create a meet request in the database (network call after camera)
    const { data, error } = await db
        .from('meet_requests')
        .insert({ user_id: currentUser.id })
        .select('token')
        .single();

    if (error) {
        showToast('Could not start meet: ' + error.message, 'error');
        closeMeetScreen();
        return;
    }

    const token = data.token;

    // 5. Generate QR code encoding a navigable URL so non-members
    //    scanning with their phone camera land on the signup page.
    const qr = qrcode(0, 'M');
    const meetUrl = `${window.location.origin}${window.location.pathname}?meet=${token}`;
    currentMeetUrl = meetUrl;
    qr.addData(meetUrl);
    qr.make();
    const qrBox = document.getElementById('meetQrBox');
    if (qrBox) qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4 });
    const copyBtn = document.getElementById('meetCopyBtn');
    if (copyBtn) copyBtn.style.display = '';

    // 6. Subscribe to Realtime on contacts table for this user
    // (so if the OTHER person scans first, we still get notified)
    // Listen for INSERT *and* UPDATE so re-meeting an existing contact still triggers
    const meetRealtimeHandler = (payload) => {
        if (meetHandled) return;
        meetHandled = true;
        const contactId = payload.new.contact_id;
        // Look up the contact's name
        db.from('profiles').select('display_name').eq('id', contactId).single()
            .then(({ data: profile }) => {
                const name = profile?.display_name || 'someone';
                meetSuccess(name);
            });
    };
    meetChannel = db.channel('meet-contacts')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'contacts',
            filter: 'user_id=eq.' + currentUser.id
        }, meetRealtimeHandler)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'contacts',
            filter: 'user_id=eq.' + currentUser.id
        }, meetRealtimeHandler)
        .subscribe();

    // 7. Begin scanning loop if camera is active
    if (cameraOk) {
        meetScanLoop();
    }
}

function meetScanLoop() {
    if (meetHandled) return;

    const video = document.getElementById('meetVideo');
    const canvas = document.getElementById('meetCanvas');

    if (video.readyState < video.HAVE_ENOUGH_DATA) {
        meetScanTimer = requestAnimationFrame(meetScanLoop);
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
        let scannedToken = null;
        // New format: full URL with ?meet= parameter
        try {
            const scannedUrl = new URL(code.data);
            scannedToken = scannedUrl.searchParams.get('meet');
        } catch {}
        // Legacy format: fairshare-meet:TOKEN
        if (!scannedToken && code.data.startsWith('fairshare-meet:')) {
            scannedToken = code.data.replace('fairshare-meet:', '');
        }
        if (scannedToken && !meetHandled) {
            meetHandled = true;
            handleMeetScan(scannedToken);
            return;
        }
    }

    // Continue scanning
    meetScanTimer = requestAnimationFrame(meetScanLoop);
}

async function handleMeetScan(token) {
    document.getElementById('meetScanHint').textContent = 'Connecting...';

    try {
        const { data, error } = await db.rpc('complete_meet', { p_token: token });

        if (error) {
            showToast('Meet failed: ' + error.message, 'error');
            meetHandled = false; // allow retry
            meetScanLoop();
            return;
        }

        const contactName = data?.contact_name || 'New contact';
        meetSuccess(contactName);
    } catch (e) {
        showToast('Meet error: ' + e.message, 'error');
        meetHandled = false;
        meetScanLoop();
    }
}

function meetSuccess(contactName) {
    // Vibrate the phone
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }

    // Flash the whole screen blue/grey to make the connection unmistakable
    const flash = document.getElementById('handshakeFlash');
    flash.classList.remove('active');
    // Force reflow so re-adding the class restarts the animation
    void flash.offsetWidth;
    flash.classList.add('active');
    flash.addEventListener('animationend', () => flash.classList.remove('active'), { once: true });

    // Show success in the overlay
    document.getElementById('meetScanHint').textContent = '';
    const qrBox = document.getElementById('meetQrBox');
    qrBox.outerHTML = `<div class="meet-success">✓ Connected with ${esc(contactName)}!</div>`;

    showToast('Contact added: ' + contactName, 'success');

    // Auto-close after a short delay, then open contact list so user sees new contact at top
    setTimeout(() => {
        closeMeetScreen();
        openContactListScreen();
    }, 2500);
}

function copyMeetLink() {
    if (!currentMeetUrl) return;
    navigator.clipboard.writeText(currentMeetUrl).then(() => {
        showToast('Meet link copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Could not copy link', 'error');
    });
}

function closeMeetScreen() {
    currentMeetUrl = null;
    const copyBtn = document.getElementById('meetCopyBtn');
    if (copyBtn) copyBtn.style.display = 'none';

    // Stop camera
    if (meetStream) {
        meetStream.getTracks().forEach(t => t.stop());
        meetStream = null;
    }
    const video = document.getElementById('meetVideo');
    if (video) video.srcObject = null;

    // Stop scanning
    if (meetScanTimer) {
        cancelAnimationFrame(meetScanTimer);
        meetScanTimer = null;
    }

    // Unsubscribe from Realtime
    if (meetChannel) {
        db.removeChannel(meetChannel);
        meetChannel = null;
    }

    meetHandled = false;

    // Reset QR area (in case meetSuccess replaced it)
    const overlay = document.getElementById('meetOverlay');
    const qrSection = overlay.querySelector('.meet-qr-section');
    if (qrSection && !document.getElementById('meetQrBox')) {
        // Restore the QR box element if it was replaced by success message
        const successEl = qrSection.querySelector('.meet-success');
        if (successEl) {
            successEl.outerHTML = '<div class="meet-qr-box" id="meetQrBox"></div>';
        }
    }

    // Hide overlay
    overlay.classList.add('hidden');
}
