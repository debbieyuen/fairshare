function showModal(type) {
    const overlay = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    overlay.classList.remove('hidden');

    switch (type) {
        case 'createGroup':
            body.innerHTML = `
                <h3>Create a Group</h3>
                <form id="createGroupForm">
                    <div class="form-group">
                        <label>Group Name</label>
                        <input type="text" id="newGroupName" required placeholder="e.g. My Community">
                    </div>
                    <div class="form-group">
                        <label>Currency Name (plural if desired, e.g. "dollars")</label>
                        <input type="text" id="newCurrencyName" required placeholder="e.g. dollars, coins, credits">
                    </div>
                    <div class="form-group">
                        <label>Currency Symbol</label>
                        <input type="text" id="newCurrencySymbol" required placeholder="e.g. $, FC, ¢" maxlength="5" value="$">
                    </div>
                    <p style="font-size:0.8rem;color:var(--dark-gray);margin-top:0.5rem;">
                        Balances display as: <strong>$ 100.00 dollars</strong>
                    </p>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create</button>
                    </div>
                </form>
            `;
            document.getElementById('createGroupForm').addEventListener('submit', (e) => createGroup(e));
            break;

        case 'send':
            loadSendModal();
            break;

        case 'shareChoice':
            body.innerHTML = `
                <h3>Share with ${esc(shareWithContactName || 'contact')}</h3>
                <p style="font-size:0.9rem;color:var(--dark-gray);margin-bottom:1rem;">Choose one item to share now.</p>
                <div class="choice-list" style="min-width:0;overflow-wrap:break-word;">
                    <div class="choice-item">
                        <button type="button" class="btn btn-outline choice-button" ${(currentProfile?.phone) ? '' : 'disabled'} onclick="shareWithContactChoice('phone')">Phone Number</button>
                    </div>
                    ${!(currentProfile?.phone) ? '<p style="font-size:0.8rem;color:var(--dark-gray);">Add your phone in Profile first.</p>' : ''}
                    <div class="choice-item">
                        <button type="button" class="btn btn-outline choice-button" ${(currentProfile?.email) ? '' : 'disabled'} onclick="shareWithContactChoice('email')">Email</button>
                    </div>
                    ${!(currentProfile?.email) ? '<p style="font-size:0.8rem;color:var(--dark-gray);">Add your email in Profile first.</p>' : ''}
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    </div>
                </div>
            `;
            break;

        case 'vouchChoice':
            body.innerHTML = `
                <h3>Vouch for ${esc(vouchWithContactName || 'contact')}</h3>
                <p style="font-size:0.9rem;color:var(--dark-gray);margin-bottom:1rem;">Choose one statement.</p>
                <div class="choice-list">
                    <div class="choice-item"><button type="button" class="btn btn-outline choice-button" onclick="vouchWithContactChoice('profile_picture_accurate')">Profile picture is accurate</button></div>
                    <div class="choice-item"><button type="button" class="btn btn-outline choice-button" onclick="vouchWithContactChoice('respect')">I respect you</button></div>
                    <div class="choice-item"><button type="button" class="btn btn-outline choice-button" onclick="vouchWithContactChoice('trust')">I trust you</button></div>
                    <div class="choice-item"><button type="button" class="btn btn-outline choice-button" onclick="vouchWithContactChoice('love')">I love you</button></div>
                    <div class="choice-item"><button type="button" class="btn btn-outline choice-button" onclick="vouchWithContactChoice('help')">I will help you</button></div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    </div>
                </div>
            `;
            break;

        case 'contactSelfie':
            body.innerHTML = `
                <h3>Take a selfie</h3>
                <p style="font-size:0.9rem;color:var(--dark-gray);margin-bottom:0.75rem;">Position both of you in frame, then capture.</p>
                <div style="background:#000;border-radius:8px;overflow:hidden;margin-bottom:1rem;aspect-ratio:1;max-height:320px;">
                    <video id="contactSelfieVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeContactSelfieModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="contactSelfieCaptureBtn">Capture</button>
                </div>
            `;
            document.getElementById('contactSelfieCaptureBtn').addEventListener('click', captureContactSelfie);
            startContactSelfieStream();
            break;

        case 'suggestPicture':
            body.innerHTML = `
                <h3>Suggest new picture</h3>
                <div id="suggestPicCameraWrap" style="display:none;background:#000;border-radius:8px;overflow:hidden;margin-bottom:1rem;aspect-ratio:1;max-height:320px;">
                    <video id="suggestPicVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
                </div>
                <div id="suggestPicPreviewWrap" style="display:none;margin-bottom:1rem;text-align:center;">
                    <img id="suggestPicPreviewImg" class="suggest-pic-preview" alt="Preview">
                </div>
                <div id="suggestPicOptions" class="suggest-pic-options">
                    <button type="button" class="btn btn-outline choice-button" onclick="suggestPicFromFile()">Choose from files</button>
                    <button type="button" class="btn btn-outline choice-button" onclick="suggestPicFromCamera()">Take a picture</button>
                </div>
                <input type="file" id="suggestPicFileInput" accept="image/*" style="display:none;">
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeSuggestPicModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="suggestPicSendBtn" style="display:none;" onclick="suggestPicSend()">Send</button>
                </div>
            `;
            document.getElementById('suggestPicFileInput').addEventListener('change', suggestPicFileSelected);
            break;

        case 'proposeAmendment':
            document.getElementById('modalBody').classList.add('modal-wide');
            body.innerHTML = `
                <h3>Propose an Amendment</h3>
                <div class="form-group">
                    <label>Title (short summary)</label>
                    <input type="text" id="amendmentTitle" required placeholder="e.g. Lower amendment threshold to 75%">
                </div>
                <div class="form-group">
                    <label>Edit the constitution below</label>
                    <textarea id="amendmentEditor" rows="8" style="font-family:monospace;font-size:16px;line-height:1.6;"
                        oninput="updateAmendmentPreview()">${esc(selectedGroup?.constitution || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Preview of changes</label>
                    <div id="amendmentDiffPreview" class="diff-display" style="min-height:60px;">
                        <span style="color:var(--dark-gray);">Make changes above to see a preview.</span>
                    </div>
                </div>
                <p style="font-size:0.8rem;color:var(--dark-gray);margin-top:0.5rem;">
                    The amendment will be put to a 7-day vote. Members must approve by the threshold defined in the constitution.
                </p>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="submitAmendment()">Submit Amendment</button>
                </div>
            `;
            break;
    }
}

function closeModal(options = {}) {
    const { refreshContactList = true } = options;
    if (heartDialogTimer) { clearTimeout(heartDialogTimer); heartDialogTimer = null; }
    shareWithContactId = null;
    shareWithContactName = '';
    vouchWithContactId = null;
    vouchWithContactName = '';
    if (contactSelfieStream) {
        stopContactSelfieStream();
        contactSelfieId = null;
        if (refreshContactList && activeMainView === 'contacts') {
            loadAndRenderContactList();
        }
    }
    stopSuggestPicStream();
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('modalBody').classList.remove('modal-wide');
}

async function savePreferences(e) {
    e?.preventDefault();
    if (savePreferences._running) return;
    savePreferences._running = true;
    try {
        if (!currentUser) {
            showToast('Session expired — please log in again.', 'error');
            return;
        }

        const form = document.getElementById('preferencesForm');
        if (form && !form.reportValidity()) {
            showToast('Please correct the highlighted field(s).', 'error');
            return;
        }

        const displayName = document.getElementById('prefDisplayName').value.trim();
        const email = document.getElementById('prefEmail').value.trim();
        const phone = document.getElementById('prefPhone').value.trim();
        const prefPreview = document.getElementById('prefPhotoPreview');
        const prevProfileImageUrl = currentProfile?.profile_image_url || null;
        const prevEmail = currentProfile?.email || '';
        const prevPhone = currentProfile?.phone || '';
        let profileImageUrl = prevProfileImageUrl;
        if (prefPreview?._pendingFile) {
            try {
                const file = prefPreview._pendingFile;
                const ext = (file.name && file.name.split('.').pop()) || 'jpg';
                const filePath = `${currentUser.id}/profile.${ext}`;
                const { error: upErr } = await db.storage.from('avatars').upload(filePath, file, { upsert: true });
                if (upErr) throw upErr;
                const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
                profileImageUrl = urlData.publicUrl;
            } catch (err) {
                console.error('Profile photo upload error:', err);
                showToast('Could not upload photo: ' + (err.message || 'error'), 'error');
            }
        }
        const payload = {
            display_name: displayName || currentUser.email,
            email: email || null,
            phone: phone || null
        };
        if (profileImageUrl !== undefined) payload.profile_image_url = profileImageUrl;

        // Handle push notification toggle
        const pushCheck = document.getElementById('prefPushNotifications');
        if (pushCheck) {
            payload.push_notifications = pushCheck.checked;
            if (pushCheck.checked) {
                await subscribeToPush();
            } else {
                await unsubscribePush();
            }
        }

        const { error } = await db.from('profiles').update(payload).eq('id', currentUser.id);
        if (error) {
            showToast('Could not save: ' + error.message, 'error');
            return;
        }
        if (currentProfile) {
            currentProfile.display_name = payload.display_name;
            currentProfile.email = email || null;
            currentProfile.phone = phone || null;
            currentProfile.profile_image_url = profileImageUrl;
            if (pushCheck) currentProfile.push_notifications = pushCheck.checked;
        }
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) userDisplay.textContent = payload.display_name;
        setHeaderAvatar(profileImageUrl || null);
        showToast('Saved.', 'success');

        // Notify contacts of profile changes (photo, email, phone)
        const changes = [];
        if (profileImageUrl && profileImageUrl !== prevProfileImageUrl) changes.push('profile picture');
        if ((email || '') !== prevEmail) changes.push('email');
        if ((phone || '') !== prevPhone) changes.push('phone number');
        if (changes.length > 0) {
            const msg = payload.display_name + ' updated their ' + changes.join(' and ') + '.';
            db.rpc('notify_contacts_of_profile_update', { p_actor_id: currentUser.id, p_message: msg })
                .then(({ error }) => { if (error) console.warn('notify profile update error:', error); });
        }
    } catch (err) {
        console.error('savePreferences failed:', err);
        showToast('Could not save preferences.', 'error');
    } finally {
        savePreferences._running = false;
    }
}

// ---- Suggest Profile Picture helpers ----

function openSuggestPicture(contactId) {
    suggestPicContactId = contactId;
    showModal('suggestPicture');
}

function closeSuggestPicModal() {
    stopSuggestPicStream();
    suggestPicContactId = null;
    closeModal({ refreshContactList: false });
}

function stopSuggestPicStream() {
    if (suggestPicStream) {
        suggestPicStream.getTracks().forEach(t => t.stop());
        suggestPicStream = null;
    }
    const video = document.getElementById('suggestPicVideo');
    if (video) video.srcObject = null;
}

function suggestPicFromFile() {
    const input = document.getElementById('suggestPicFileInput');
    if (input) input.click();
}

function suggestPicFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById('suggestPicPreviewImg');
    const previewWrap = document.getElementById('suggestPicPreviewWrap');
    const options = document.getElementById('suggestPicOptions');
    const cameraWrap = document.getElementById('suggestPicCameraWrap');
    const sendBtn = document.getElementById('suggestPicSendBtn');
    stopSuggestPicStream();
    if (cameraWrap) cameraWrap.style.display = 'none';
    if (preview) preview.src = url;
    if (previewWrap) previewWrap.style.display = '';
    if (options) options.style.display = 'none';
    if (sendBtn) {
        sendBtn.style.display = '';
        sendBtn._pendingFile = file;
    }
}

async function suggestPicFromCamera() {
    const cameraWrap = document.getElementById('suggestPicCameraWrap');
    const options = document.getElementById('suggestPicOptions');
    const video = document.getElementById('suggestPicVideo');
    if (!cameraWrap || !video) return;

    if (options) options.style.display = 'none';
    cameraWrap.style.display = '';

    try {
        suggestPicStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
        });
        video.srcObject = suggestPicStream;
        await video.play();
    } catch (e) {
        console.error('Suggest pic camera error:', e);
        showToast('Camera unavailable: ' + (e.message || 'error'), 'error');
        closeSuggestPicModal();
        return;
    }

    const sendBtn = document.getElementById('suggestPicSendBtn');
    if (sendBtn) {
        sendBtn.style.display = '';
        sendBtn.textContent = 'Capture';
        sendBtn._captureFromCamera = true;
    }
}

async function suggestPicSend() {
    const sendBtn = document.getElementById('suggestPicSendBtn');
    if (!sendBtn || !suggestPicContactId || !currentUser) return;

    if (sendBtn._captureFromCamera) {
        const video = document.getElementById('suggestPicVideo');
        if (!video || video.readyState < 2) {
            showToast('Camera not ready — please wait a moment.', 'error');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) { showToast('Could not capture image.', 'error'); return; }
        sendBtn._pendingFile = new File([blob], 'suggested.jpg', { type: 'image/jpeg' });
        sendBtn._captureFromCamera = false;

        stopSuggestPicStream();
        const cameraWrap = document.getElementById('suggestPicCameraWrap');
        const previewWrap = document.getElementById('suggestPicPreviewWrap');
        const preview = document.getElementById('suggestPicPreviewImg');
        if (cameraWrap) cameraWrap.style.display = 'none';
        if (preview) preview.src = URL.createObjectURL(sendBtn._pendingFile);
        if (previewWrap) previewWrap.style.display = '';
        sendBtn.textContent = 'Send';
        return;
    }

    const file = sendBtn._pendingFile;
    if (!file) return;

    sendBtn.disabled = true;
    try {
        await sendSuggestedPicture(suggestPicContactId, file);
        showToast('Picture suggestion sent!', 'success');
        closeSuggestPicModal();
    } catch (e) {
        console.error('Suggest picture error:', e);
        showToast('Could not send suggestion: ' + (e.message || 'error'), 'error');
        sendBtn.disabled = false;
    }
}

async function sendSuggestedPicture(contactId, file) {
    const ext = (file.name && file.name.split('.').pop()) || 'jpg';
    const filePath = `${currentUser.id}/suggested_${contactId}_${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from('avatars').upload(filePath, file, { upsert: false });
    if (upErr) throw upErr;
    const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
    const imageUrl = urlData.publicUrl;

    const { error: rpcErr } = await db.rpc('suggest_profile_picture', {
        p_actor_id: currentUser.id,
        p_contact_id: contactId,
        p_image_url: imageUrl
    });
    if (rpcErr) throw rpcErr;
}

function showSuggestedPictureDialog(notification) {
    const imageUrl = notification.data?.image_url;
    const msg = notification.message || 'Someone suggests a new profile picture';
    if (!imageUrl) {
        showToast(msg, 'info');
        return;
    }

    const overlay = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <h3>New picture suggestion</h3>
        <p style="font-size:0.9rem;color:var(--dark-gray);margin-bottom:0.75rem;">${esc(msg)}</p>
        <div style="text-align:center;margin-bottom:1rem;">
            <img src="${esc(imageUrl)}" class="suggest-pic-dialog-img" alt="Suggested profile picture">
        </div>
        <div class="form-actions" style="flex-wrap:wrap;gap:0.5rem;">
            <button type="button" class="btn btn-secondary" onclick="closeModal({refreshContactList:false})">Ignore</button>
            <button type="button" class="btn btn-outline" onclick="saveSuggestedPicture('${esc(imageUrl)}')">Save</button>
            <button type="button" class="btn btn-primary" onclick="acceptSuggestedPicture('${esc(imageUrl)}')">Accept</button>
        </div>
    `;
    overlay.classList.remove('hidden');
}

async function acceptSuggestedPicture(imageUrl) {
    if (!currentUser) return;
    try {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error('Could not download image');
        const blob = await resp.blob();
        const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
        const file = new File([blob], 'profile.' + ext, { type: blob.type || 'image/jpeg' });
        const filePath = `${currentUser.id}/profile.${ext}`;
        const { error: upErr } = await db.storage.from('avatars').upload(filePath, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
        const newUrl = urlData.publicUrl + '?t=' + Date.now();

        const { error } = await db.from('profiles').update({ profile_image_url: newUrl }).eq('id', currentUser.id);
        if (error) throw error;

        if (currentProfile) currentProfile.profile_image_url = newUrl;
        setHeaderAvatar(newUrl);
        showToast('Profile picture updated!', 'success');

        db.rpc('notify_contacts_of_profile_picture_change', { p_actor_id: currentUser.id })
            .then(({ error }) => { if (error) console.warn('notify profile pic change error:', error); });
    } catch (e) {
        console.error('Accept suggested picture error:', e);
        showToast('Could not update picture: ' + (e.message || 'error'), 'error');
        return;
    }
    closeModal({ refreshContactList: false });
}

function saveSuggestedPicture(imageUrl) {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'suggested-profile-picture.jpg';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Picture saved.', 'success');
}

// Allow Escape key to close any open modal or overlays
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('meetOverlay').classList.contains('hidden')) {
            closeMeetScreen();
        } else if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
            closeModal();
        }
    }
});
