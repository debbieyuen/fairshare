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

    try {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            currentUser = session.user;
            await loadProfile();
            const claimedGroup = await handlePendingInvite();
            await handlePendingMeet();
            showApp(claimedGroup);
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
                        await handlePendingMeet();
                        showApp(claimedGroup);
                    } catch (e) {
                        console.error('[auth] post-SIGNED_IN error:', e);
                    }
                }, 0);
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                currentProfile = null;
                showAuth();
            } else if (event === 'TOKEN_REFRESHED' && session) {
                // Session refreshed successfully — update user reference
                console.log('[auth] Token refreshed OK');
                currentUser = session.user;
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

    // Always clear the stored token (used or failed)
    localStorage.removeItem('fairshare_invite');

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

        const sponsorName = data?.user_name || 'A Union member';
        const sponsorInitial = sponsorName.charAt(0).toUpperCase() || 'U';
        const sponsorAvatar = data?.profile_image_url
            ? `<img class="invite-sponsor-avatar" src="${esc(data.profile_image_url)}" alt="${esc(sponsorName)}">`
            : `<span class="invite-sponsor-avatar invite-sponsor-avatar-fallback">${esc(sponsorInitial)}</span>`;

        document.getElementById('inviteBannerText').innerHTML =
            `<div class="invite-sponsor-row">${sponsorAvatar}<div class="invite-sponsor-message"><strong class="invite-sponsor-name">${esc(sponsorName)}</strong> wants to sponsor you as a Union member!</div></div>` +
            `<div class="invite-sponsor-subtext">Sign up to join and add them as a contact.</div>`;
        document.getElementById('inviteBanner').classList.remove('hidden');

        switchAuthTab('signup');
    } catch (e) {
        console.error('Failed to load meet details:', e);
    }
}

// Claim a pending meet token after the user has signed in
async function handlePendingMeet() {
    const stored = localStorage.getItem('fairshare_meet');
    if (!stored) return;

    let token = null;
    try {
        const parsed = JSON.parse(stored);
        const ONE_HOUR_MS = 60 * 60 * 1000;
        if (parsed.token && (Date.now() - parsed.savedAt) < ONE_HOUR_MS) {
            token = parsed.token;
        }
    } catch {
        token = stored;
    }

    if (!token) {
        localStorage.removeItem('fairshare_meet');
        return;
    }

    try {
        const { data, error } = await db.rpc('complete_meet', { p_token: token });
        if (error) {
            showToast('Meet: ' + error.message, 'error');
        } else {
            const contactName = data?.contact_name || 'New contact';
            if (data?.contact_id) pendingOpenContactId = data.contact_id;
            showToast(`Connected with ${contactName}!`, 'success');
        }
    } catch (e) {
        console.error('Failed to complete meet:', e);
    }

    localStorage.removeItem('fairshare_meet');

    if (window.location.search.includes('meet=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    document.getElementById('inviteBanner').classList.add('hidden');
}
