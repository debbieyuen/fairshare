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

        case 'sponsor':
            body.innerHTML = `
                <h3>Sponsor a New Member</h3>
                <div id="sponsorFormArea">
                    <form id="sponsorForm">
                        <div class="form-group">
                            <label>Describe the person you'd like to sponsor</label>
                            <textarea id="sponsorMessage" rows="3" placeholder="e.g. Jane Smith, my colleague who wants to participate in our group"></textarea>
                        </div>
                        <p style="font-size:0.8rem;color:var(--dark-gray);margin-top:0.5rem;">
                            This will generate a unique invite link you can share with the candidate.
                            The link expires in 7 days.
                        </p>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Create Invite Link</button>
                        </div>
                    </form>
                </div>
            `;
            document.getElementById('sponsorForm').addEventListener('submit', (e) => createSponsorship(e));
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
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('modalBody').classList.remove('modal-wide');
}

async function savePreferences(e) {
    e?.preventDefault();
    const saveBtn = document.getElementById('prefSaveBtn');
    const originalSaveLabel = saveBtn?.textContent || 'Save';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
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
        showToast('Preferences saved.', 'success');

        // Notify contacts if the profile picture changed
        if (profileImageUrl && profileImageUrl !== prevProfileImageUrl) {
            db.rpc('notify_contacts_of_profile_picture_change', { p_actor_id: currentUser.id })
                .then(({ error }) => { if (error) console.warn('notify profile pic error:', error); });
        }
    } catch (err) {
        console.error('savePreferences failed:', err);
        showToast('Could not save preferences.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalSaveLabel;
        }
    }
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
