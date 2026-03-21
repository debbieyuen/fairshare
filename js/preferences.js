function openPreferences() {
    if (!currentUser) return;
    navigateTo('profile');
}

function renderProfileScreen() {
    const container = document.getElementById('profileScreenContent');
    if (!container || !currentUser) return;

    container.innerHTML = `
        <div class="card">
            <div class="profile-screen-header">
                <h2>Public Profile</h2>
                <button type="button" class="btn btn-outline btn-small pref-logout-btn" onclick="logout();">Log Out</button>
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
                    <button type="button" id="prefSaveBtn" class="btn btn-primary" onclick="savePreferences(event)">Save</button>
                </div>
            </form>
        </div>
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
}
