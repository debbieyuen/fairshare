function openPreferences() {
    if (!currentUser) return;
    navigateTo('profile');
}

function sponsoredAgoLabel(createdAt) {
    if (!createdAt) return 'Sponsor';
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Sponsored today';
    if (diffDays < 30) return `Sponsored ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    let years = now.getFullYear() - created.getFullYear();
    let months = now.getMonth() - created.getMonth();
    if (now.getDate() < created.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    if (years > 0 && months > 0) return `Sponsored ${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'} ago`;
    if (years > 0) return `Sponsored ${years} year${years === 1 ? '' : 's'} ago`;
    return `Sponsored ${months} month${months === 1 ? '' : 's'} ago`;
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
                <div class="form-group pref-contact-field">
                    <label for="prefEmail">Email</label>
                    <input type="email" id="prefEmail" placeholder="you@example.com">
                </div>
                <div class="form-group pref-contact-field">
                    <label for="prefPhone">Phone</label>
                    <input type="tel" id="prefPhone" placeholder="+1 234 567 8900">
                </div>
                <p class="pref-help-text pref-contact-hint">(You choose when to share these)</p>
                <div class="pref-sponsor-card">
                    <div id="prefSponsorAvatar" class="pref-sponsor-avatar">👤</div>
                    <div>
                        <div class="pref-sponsor-label">${sponsoredAgoLabel(currentProfile?.created_at)}</div>
                        <div id="prefSponsorName" class="pref-sponsor-name">Loading sponsor...</div>
                    </div>
                </div>
                <hr class="pref-divider">
                <h4 class="pref-section-title">Preferences</h4>
                ${canUsePush() ? `
                <div class="form-group pref-checkbox-row">
                    <input type="checkbox" id="prefPushNotifications" style="flex-shrink:0;">
                    <label for="prefPushNotifications" style="margin:0;">Push Notifications</label>
                </div>
                <p id="prefPushHint" class="pref-help-text pref-push-hint"></p>
                ` : ''}
            </form>
            <div class="screen-version" aria-hidden="true">${esc(window.BUILD_VERSION || '')}</div>
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
        savePreferences();
    });

    document.getElementById('preferencesForm').addEventListener('submit', (e) => savePreferences(e));

    document.getElementById('prefDisplayName').addEventListener('change', () => savePreferences());
    document.getElementById('prefEmail').addEventListener('change', () => savePreferences());
    document.getElementById('prefPhone').addEventListener('change', () => savePreferences());

    const pushCheck = document.getElementById('prefPushNotifications');
    if (pushCheck) pushCheck.addEventListener('change', () => savePreferences());

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

    if (canUsePush()) {
        const pushCheck = document.getElementById('prefPushNotifications');
        const pushHint = document.getElementById('prefPushHint');
        isPushSubscribed().then(subscribed => {
            const prefEnabled = currentProfile?.push_notifications !== false;
            pushCheck.checked = prefEnabled && subscribed;
            if (!IS_NATIVE && Notification.permission === 'denied') {
                pushCheck.disabled = true;
                pushHint.textContent = 'Notifications are blocked by your browser. Enable them in your browser settings.';
            } else if (!subscribed && prefEnabled) {
                pushHint.textContent = 'Enable to receive notifications when the app is closed.';
            }
        });
    }
}
