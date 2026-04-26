// Synchronous peek: does Supabase have a cached session in localStorage?
function hasStoredSession() {
    try {
        const ref = SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1];
        if (!ref) return false;
        const raw = localStorage.getItem('sb-' + ref + '-auth-token');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed?.access_token || parsed?.currentSession?.access_token);
    } catch { return false; }
}

async function init() {
    document.title = APP_NAME;
    const authHeading = document.querySelector('#authScreen h2');
    if (authHeading) authHeading.textContent = APP_NAME;
    const authSubtitle = document.querySelector('#authScreen .subtitle');
    if (authSubtitle) authSubtitle.textContent = APP_TAG_LINE;

    console.log('[init] Starting…');
    if (!db) {
        showToast('Could not connect to database. Check Supabase config.', 'error');
        showAuth();
        return;
    }

    // Optimistic startup: if we have a cached session, show the app shell
    // immediately so the user never sees the login screen flash.
    const likelyLoggedIn = hasStoredSession();
    if (likelyLoggedIn) {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
    }

    // Check for invite token in URL
    // NOTE: We use localStorage (not sessionStorage) so the token survives
    // the cross-tab redirect that happens when a new user confirms their
    // email — the confirmation link opens in a new tab where sessionStorage
    // would be empty, causing the sponsorship claim to silently fail.
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    const meetToken = urlParams.get('meet');
    if (inviteToken) {
        localStorage.setItem('fairshare_invite', JSON.stringify({
            token: inviteToken,
            savedAt: Date.now()
        }));
        // Clean the invite param from the URL immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        await showInviteBanner(inviteToken);
    } else if (meetToken) {
        localStorage.setItem('fairshare_meet', JSON.stringify({
            token: meetToken,
            savedAt: Date.now()
        }));
        window.history.replaceState({}, document.title, window.location.pathname);
        await showMeetBanner(meetToken);
    }

    const notifGroupId = urlParams.get('group');
    if (notifGroupId) {
        localStorage.setItem('fairshare_notification_nav', JSON.stringify({
            groupId: notifGroupId,
            tab: urlParams.get('tab') || null
        }));
        if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // Cold-start deep link from a "profile picture updated" (or similar) push
    // notification. Survives a sign-in round-trip via pendingOpenContactId,
    // which showApp()'s openPendingContactDetailsIfAny() consumes once the
    // contacts list is ready.
    if (urlParams.get('action') === 'view_contact') {
        const notifContactId = urlParams.get('contact');
        if (notifContactId) {
            pendingOpenContactId = notifContactId;
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    try {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            currentUser = session.user;
            await loadProfile();
            const claimedGroup = await handlePendingInvite();
            const claimedGroupFromMeet = await handlePendingMeet();
            // Either claim may have just updated profiles.sponsor_id (and
            // inserted contacts / pending memberships) server-side. Refresh
            // currentProfile so the UI renders with the post-claim state
            // instead of the stale snapshot from before the RPC ran.
            if (claimedGroup || claimedGroupFromMeet) {
                await loadProfile();
            }
            showApp(claimedGroup || claimedGroupFromMeet);
        } else {
            showAuth();
        }

        // Listen for auth changes
        // IMPORTANT: The callback must NOT await Supabase calls inline.
        // Doing so can corrupt the client's internal lock state, especially
        // after a tab-switch triggers TOKEN_REFRESHED.  We defer heavy work
        // via setTimeout so the auth callback returns synchronously.
        db.auth.onAuthStateChange((event, session) => {
            console.log('[auth] onAuthStateChange:', event);
            if (event === 'SIGNED_IN' && session) {
                currentUser = session.user;
                // Defer async Supabase work outside the callback
                setTimeout(async () => {
                    try {
                        await loadProfile();
                        const claimedGroup = await handlePendingInvite();
                        const claimedGroupFromMeet = await handlePendingMeet();
                        // Refresh currentProfile if a claim ran — complete_meet /
                        // claim_sponsorship set sponsor_id server-side, so the
                        // snapshot we loaded above is stale. Without this, the
                        // Preferences screen shows "Root user (no sponsor)"
                        // until the user logs out and back in.
                        if (claimedGroup || claimedGroupFromMeet) {
                            await loadProfile();
                        }
                        showApp(claimedGroup || claimedGroupFromMeet);
                    } catch (e) {
                        console.error('[auth] post-SIGNED_IN error:', e);
                    }
                }, 0);
            } else if (event === 'SIGNED_OUT') {
                try { stopLocationSharingUpdates(); } catch (_) { /* best effort */ }
                currentUser = null;
                currentProfile = null;
                showAuth();
            } else if (event === 'TOKEN_REFRESHED' && session) {
                // Session refreshed successfully — update user reference
                console.log('[auth] Token refreshed OK');
                currentUser = session.user;
                if (typeof refreshNativeLocationSharingAuth === 'function') {
                    refreshNativeLocationSharingAuth();
                }
            }
        });
    } catch (e) {
        console.error('Init error:', e);
        showToast('Connection error: ' + e.message, 'error');
        showAuth();
    }
}

// Show invite banner on the auth screen
async function showInviteBanner(token) {
    try {
        const { data, error } = await db.rpc('get_sponsorship_by_token', { p_token: token });
        if (error || data?.error) {
            const msg = data?.error || error?.message || 'Invalid invitation';
            document.getElementById('inviteBannerText').innerHTML =
                `<strong>Invitation issue:</strong> ${esc(msg)}`;
            document.getElementById('inviteBanner').classList.remove('hidden');
            localStorage.removeItem('fairshare_invite');
            return;
        }

        const sponsorName = data?.sponsor_name || 'A Union member';
        const sponsorInitial = sponsorName.charAt(0).toUpperCase() || 'U';
        const sponsorAvatar = data?.profile_image_url
            ? `<img class="invite-sponsor-avatar" src="${esc(data.profile_image_url)}" alt="${esc(sponsorName)}">`
            : `<span class="invite-sponsor-avatar invite-sponsor-avatar-fallback">${esc(sponsorInitial)}</span>`;

        document.getElementById('inviteBannerText').innerHTML =
            `<div class="invite-sponsor-row">${sponsorAvatar}<div class="invite-sponsor-message"><strong class="invite-sponsor-name">${esc(sponsorName)}</strong> wants to sponsor you as a member of the <strong>${esc(data.group_name)}</strong> group!</div></div>` +
            (data.message ? `<div class="invite-sponsor-note"><em>"${esc(data.message)}"</em></div>` : '') +
            `<div class="invite-sponsor-subtext">If you haven't yet created an account, start by making one.</div>`;
        document.getElementById('inviteBanner').classList.remove('hidden');

        // Default to sign-up tab for new users arriving via invite
        switchAuthTab('signup');
    } catch (e) {
        console.error('Failed to load invite details:', e);
    }
}

// Claim a pending invite after the user has signed in
// Returns the group_id if successfully claimed, so the caller can navigate there
async function handlePendingInvite() {
    const stored = localStorage.getItem('fairshare_invite');
    if (!stored) return null;

    let token = null;
    try {
        const parsed = JSON.parse(stored);
        // Discard tokens older than 7 days (matches server-side expiry)
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (parsed.token && (Date.now() - parsed.savedAt) < SEVEN_DAYS_MS) {
            token = parsed.token;
        }
    } catch {
        // Legacy format (plain string) — treat as valid token
        token = stored;
    }

    if (!token) {
        localStorage.removeItem('fairshare_invite');
        return null;
    }

    // Remove immediately so a concurrent call cannot claim the same token.
    localStorage.removeItem('fairshare_invite');

    let claimedGroupId = null;
    try {
        const { data, error } = await db.rpc('claim_sponsorship', { p_token: token });
        if (error) {
            showToast('Invite: ' + error.message, 'error');
        } else if (data?.success) {
            claimedGroupId = data.group_id;
            pendingOpenNewestContact = true;
            if (data.admitted) {
                showToast(`Welcome to "${data.group_name}"! You've been admitted as a member.`, 'success');
            } else {
                showToast(`You've been sponsored to join "${data.group_name}"! Awaiting group endorsement.`, 'success');
            }
        }
    } catch (e) {
        console.error('Failed to claim sponsorship:', e);
    }

    // Clean the URL
    if (window.location.search.includes('invite=')) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Hide the invite banner
    document.getElementById('inviteBanner').classList.add('hidden');
    return claimedGroupId;
}

// Show meet banner on the auth screen when arriving via ?meet=TOKEN
async function showMeetBanner(token) {
    try {
        const { data, error } = await db.rpc('get_meet_by_token', { p_token: token });
        if (error || data?.error) {
            const msg = data?.error || error?.message || 'Invalid meet link';
            document.getElementById('inviteBannerText').innerHTML =
                `<strong>Meet link issue:</strong> ${esc(msg)}`;
            document.getElementById('inviteBanner').classList.remove('hidden');
            localStorage.removeItem('fairshare_meet');
            return;
        }

        const authHeading = document.querySelector('#authScreen h2');
        if (authHeading) authHeading.style.display = 'none';

        const name = data?.user_name || 'A Union member';
        const photoUrl = data?.profile_image_url;
        const phone = data?.phone;
        const email = data?.email;
        const groupName = data?.group_name;
        const message = data?.message;

        let html = '<div class="meet-landing-card">';
        if (photoUrl) {
            html += `<img class="meet-landing-photo" src="${esc(photoUrl)}" alt="${esc(name)}">`;
        }
        html += `<div class="meet-landing-name">${esc(name)}</div>`;
        if (phone) html += `<div class="meet-landing-detail">\u260E\uFE0F ${esc(phone)}</div>`;
        if (email) html += `<div class="meet-landing-detail">\u2709\uFE0F ${esc(email)}</div>`;
        if (groupName) {
            html += `<div class="meet-landing-group">wants to sponsor you as a member of <strong>${esc(groupName)}</strong></div>`;
            if (message) html += `<div class="invite-sponsor-note"><em>"${esc(message)}"</em></div>`;
            html += `<div class="meet-landing-subtext">Sign up to join the group, or <a href="#" id="meetAddContact">add as contact</a>.</div>`;
        } else {
            html += `<div class="meet-landing-subtext">Sign up to connect on ${esc(APP_NAME)}, or <a href="#" id="meetAddContact">add as contact</a>.</div>`;
        }
        html += '</div>';

        document.getElementById('inviteBannerText').innerHTML = html;
        document.getElementById('inviteBanner').classList.remove('hidden');

        const meetUrl = publicAppUrl(`?meet=${encodeURIComponent(token)}`);
        const addContactLink = document.getElementById('meetAddContact');
        if (addContactLink) {
            prepareMeetVcfLink(addContactLink, name, phone, email, meetUrl, photoUrl);
        }

        switchAuthTab('signup');
    } catch (e) {
        console.error('Failed to load meet details:', e);
    }
}

async function prepareMeetVcfLink(linkEl, name, phone, email, meetUrl, photoUrl) {
    let vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
    vcf += `FN:${name}\r\n`;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        vcf += `N:${parts.slice(1).join(' ')};${parts[0]};;;\r\n`;
    } else {
        vcf += `N:${name};;;;\r\n`;
    }
    if (phone) vcf += `TEL;TYPE=CELL:${phone}\r\n`;
    if (email) vcf += `EMAIL:${email}\r\n`;
    if (meetUrl) vcf += `URL:${meetUrl}\r\n`;
    if (photoUrl) {
        try {
            const resp = await fetch(photoUrl);
            const blob = await resp.blob();
            const mime = blob.type || 'image/jpeg';
            const ext = mime.split('/')[1]?.toUpperCase() || 'JPEG';
            const buf = await blob.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            vcf += `PHOTO;ENCODING=b;TYPE=${ext}:${b64}\r\n`;
        } catch {
            // CORS or network issue — skip embedded photo
        }
    }
    vcf += `NOTE:Met via ${APP_NAME}\r\n`;
    vcf += 'END:VCARD';

    const blob = new Blob([vcf], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    linkEl.href = url;
    if (!isMobile) {
        linkEl.download = `${name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.vcf`;
    }
}

// Claim a pending meet token after the user has signed in
// Returns group_id if the meet carried group context (sponsorship)
async function handlePendingMeet() {
    const stored = localStorage.getItem('fairshare_meet');
    if (!stored) return null;

    let token = null;
    try {
        const parsed = JSON.parse(stored);
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (parsed.token && (Date.now() - parsed.savedAt) < ONE_DAY_MS) {
            token = parsed.token;
        }
    } catch {
        token = stored;
    }

    if (!token) {
        localStorage.removeItem('fairshare_meet');
        return null;
    }

    // Remove immediately so a concurrent call (e.g. from onAuthStateChange
    // racing with getSession) cannot claim the same token a second time.
    localStorage.removeItem('fairshare_meet');

    let claimedGroupId = null;
    try {
        const { data, error } = await db.rpc('complete_meet', { p_token: token });
        if (error) {
            showToast('Meet: ' + error.message, 'error');
        } else {
            const contactName = data?.contact_name || 'New contact';
            if (data?.contact_id) pendingOpenContactId = data.contact_id;

            if (data?.group_id) {
                claimedGroupId = data.group_id;
                pendingOpenNewestContact = true;
                if (data.admitted) {
                    showToast(`Welcome to "${data.group_name}"! You've been admitted as a member.`, 'success');
                } else {
                    showToast(`You've been sponsored to join "${data.group_name}"! Awaiting group endorsement.`, 'success');
                }
            } else {
                showToast(`Connected with ${contactName}!`, 'success');
            }
        }
    } catch (e) {
        console.error('Failed to complete meet:', e);
    }

    if (window.location.search.includes('meet=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    document.getElementById('inviteBanner').classList.add('hidden');
    return claimedGroupId;
}
