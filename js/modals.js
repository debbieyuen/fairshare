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

        case 'preferences':
            body.innerHTML = `
                <div class="pref-modal-header">
                    <h3>Public Profile</h3>
                    <button type="button" class="btn btn-outline btn-small pref-logout-btn" onclick="closeModal();logout();">Log Out</button>
                </div>
                <form id="preferencesForm">
                    <div class="pref-profile-row">
                        <div id="prefPhotoPreview" class="contact-selfie-wrap pref-photo-preview" onclick="document.getElementById('prefPhotoInput').click()">📷</div>
                        <input type="file" id="prefPhotoInput" accept="image/*" style="display:none;">
                        <div class="form-group pref-display-name-group">
                            <label for="prefDisplayName">Display Name</label>
                            <input type="text" id="prefDisplayName" placeholder="Your public name" maxlength="80">
                            <p class="pref-help-text">Shared with contacts, who will vouch for its accuracy.</p>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="prefEmail">Email</label>
                        <p class="pref-help-text">(not shared by default)</p>
                        <input type="email" id="prefEmail" placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label for="prefPhone">Phone</label>
                        <p class="pref-help-text">(not shared by default)</p>
                        <input type="tel" id="prefPhone" placeholder="+1 234 567 8900">
                    </div>
                    <div class="pref-sponsor-card">
                        <div id="prefSponsorAvatar" class="pref-sponsor-avatar">👤</div>
                        <div>
                            <div class="pref-sponsor-label">Sponsor</div>
                            <div id="prefSponsorName" class="pref-sponsor-name">Loading sponsor...</div>
                        </div>
                    </div>
                    <hr class="pref-divider">
                    <h4 class="pref-section-title">Preferences</h4>
                    ${'PushManager' in window ? `
                    <div class="form-group pref-checkbox-row">
                        <input type="checkbox" id="prefPushNotifications" style="flex-shrink:0;">
                        <label for="prefPushNotifications" style="margin:0;">Push Notifications</label>
                    </div>
                    <p id="prefPushHint" class="pref-help-text pref-push-hint"></p>
                    ` : ''}
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button type="button" id="prefSaveBtn" class="btn btn-primary" onclick="savePreferences(event)">Save</button>
                    </div>
                </form>
            `;
            document.getElementById('prefDisplayName').value = currentProfile?.display_name || '';
            document.getElementById('prefEmail').value = currentProfile?.email || '';
            document.getElementById('prefPhone').value = currentProfile?.phone || '';
            const prefPreview = document.getElementById('prefPhotoPreview');
            if (currentProfile?.profile_image_url) {
                const img = document.createElement('img');
                img.src = currentProfile.profile_image_url;
                img.style.width = img.style.height = '100%';
                img.style.objectFit = 'cover';
                prefPreview.innerHTML = '';
                prefPreview.appendChild(img);
            }
            document.getElementById('prefPhotoInput').addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                prefPreview.innerHTML = '';
                const img = document.createElement('img');
                img.src = url;
                img.style.width = img.style.height = '100%';
                img.style.objectFit = 'cover';
                prefPreview.appendChild(img);
                prefPreview._pendingFile = file;
            });
            document.getElementById('preferencesForm').addEventListener('submit', (e) => savePreferences(e));
            document.getElementById('prefSaveBtn').addEventListener('click', (e) => savePreferences(e));
            // Load sponsor info
            (async () => {
                const sponsorNameEl = document.getElementById('prefSponsorName');
                const sponsorAvatarEl = document.getElementById('prefSponsorAvatar');
                if (!sponsorNameEl || !sponsorAvatarEl) return;
                try {
                    if (currentProfile?.sponsor_id) {
                        const { data: sp } = await db.from('profiles').select('display_name, profile_image_url').eq('id', currentProfile.sponsor_id).single();
                        const sponsorName = sp?.display_name || 'Unknown';
                        sponsorNameEl.textContent = sponsorName;
                        if (sp?.profile_image_url) {
                            sponsorAvatarEl.innerHTML = `<img src="${esc(sp.profile_image_url)}" alt="${esc(sponsorName)}">`;
                        } else {
                            sponsorAvatarEl.textContent = sponsorName.charAt(0).toUpperCase() || '👤';
                        }
                    } else {
                        sponsorNameEl.textContent = 'Root user (no sponsor)';
                        sponsorAvatarEl.textContent = '★';
                    }
                } catch (_) {
                    sponsorNameEl.textContent = '';
                    sponsorAvatarEl.textContent = '👤';
                }
            })();
            // Initialize push toggle
            if ('PushManager' in window) {
                const pushCheck = document.getElementById('prefPushNotifications');
                const pushHint = document.getElementById('prefPushHint');
                isPushSubscribed().then(subscribed => {
                    const prefEnabled = currentProfile?.push_notifications !== false;
                    pushCheck.checked = prefEnabled && subscribed;
                    if (Notification.permission === 'denied') {
                        pushCheck.disabled = true;
                        pushHint.textContent = 'Notifications are blocked by your browser. Enable them in your browser settings.';
                    } else if (!subscribed && prefEnabled) {
                        pushHint.textContent = 'Enable to receive notifications when the app is closed.';
                    }
                });
            }
            break;

        case 'shareWithContact':
            body.innerHTML = `
                <h3>Share with ${esc(shareWithContactName || 'contact')}</h3>
                <p style="font-size:0.9rem;color:var(--dark-gray);margin-bottom:1rem;">Choose what to share. They will be notified.</p>
                <form id="shareWithContactForm" style="min-width:0;overflow-wrap:break-word;">
                    <div class="form-group" style="display:flex;align-items:flex-start;gap:0.5rem;max-width:100%;min-width:0;">
                        <input type="checkbox" id="sharePhone" style="flex-shrink:0;margin-top:0.2rem;" ${(currentProfile?.phone) ? '' : 'disabled'}>
                        <label for="sharePhone" style="margin:0;flex:1;min-width:0;overflow-wrap:break-word;word-break:break-word;">Share my phone number</label>
                    </div>
                    ${!(currentProfile?.phone) ? '<p style="font-size:0.8rem;color:var(--dark-gray);">Add your phone in Profile first.</p>' : ''}
                    <div class="form-group" style="display:flex;align-items:flex-start;gap:0.5rem;max-width:100%;min-width:0;">
                        <input type="checkbox" id="shareEmail" style="flex-shrink:0;margin-top:0.2rem;" ${(currentProfile?.email) ? '' : 'disabled'}>
                        <label for="shareEmail" style="margin:0;flex:1;min-width:0;overflow-wrap:break-word;word-break:break-word;">Share my email</label>
                    </div>
                    ${!(currentProfile?.email) ? '<p style="font-size:0.8rem;color:var(--dark-gray);">Add your email in Profile first.</p>' : ''}
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Share</button>
                    </div>
                </form>
            `;
            document.getElementById('shareWithContactForm').addEventListener('submit', (e) => submitShareWithContact(e));
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

function closeModal() {
    if (heartDialogTimer) { clearTimeout(heartDialogTimer); heartDialogTimer = null; }
    if (contactSelfieStream) {
        stopContactSelfieStream();
        contactSelfieId = null;
        if (document.getElementById('contactsListContent') && document.getElementById('contactsOverlay') && !document.getElementById('contactsOverlay').classList.contains('hidden')) {
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
        let profileImageUrl = currentProfile?.profile_image_url || null;
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
        showToast('Preferences saved.', 'success');
        closeModal();
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
        } else if (!document.getElementById('contactsOverlay').classList.contains('hidden')) {
            closeContactListScreen();
        } else if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
            closeModal();
        }
    }
});
