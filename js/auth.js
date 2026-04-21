function hasInviteOrMeetToken() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('invite') || params.get('meet')) return true;
    if (localStorage.getItem('fairshare_invite') || localStorage.getItem('fairshare_meet')) return true;
    return false;
}

function switchAuthTab(tab) {
    // The "forgot" view is link-triggered (not a real tab), so when it's
    // active we still highlight "login" on the tab bar to reinforce that
    // forgot-password is part of the login flow.
    const tabHighlight = tab === 'forgot' ? 'login' : tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabHighlight));
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) forgotForm.classList.toggle('hidden', tab !== 'forgot');
    if (tab === 'signup') {
        const hasToken = hasInviteOrMeetToken();
        document.getElementById('signupGate').classList.toggle('hidden', hasToken);
        document.getElementById('signupFields').classList.toggle('hidden', !hasToken);
    }
    if (tab === 'forgot') {
        const loginEmail = document.getElementById('loginEmail')?.value?.trim();
        const forgotEmail = document.getElementById('forgotEmail');
        if (forgotEmail && loginEmail && !forgotEmail.value) forgotEmail.value = loginEmail;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
        showToast(error.message, 'error');
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) return;

    // Always target the public web origin so the email link works even when
    // the user kicked off the flow from the native iOS shell (where
    // window.location.origin is capacitor://localhost).
    const redirectTo = PUBLIC_APP_ORIGIN + '/reset-password.html';

    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
        showToast(error.message, 'error');
        return;
    }
    showToast('If that email is registered, a reset link has been sent.', 'success');
    switchAuthTab('login');
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    const { error } = await db.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } }
    });
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Account created! Check your email to confirm, then log in.', 'success');
        switchAuthTab('login');
    }
}

async function logout() {
    console.log('[auth] logout() called');
    // Clean up realtime subscriptions
    if (groupChannel) {
        db.removeChannel(groupChannel);
        groupChannel = null;
    }
    if (contactSharesChannel) {
        db.removeChannel(contactSharesChannel);
        contactSharesChannel = null;
    }
    if (contactEventsChannel) {
        db.removeChannel(contactEventsChannel);
        contactEventsChannel = null;
    }
    if (groupInvitationsChannel) {
        db.removeChannel(groupInvitationsChannel);
        groupInvitationsChannel = null;
    }
    // Stop nearby location tracking
    stopNearbyTracking();
    // Stop location sharing updates
    stopLocationSharingUpdates();
    unsubscribeFromLocationShares();
    stopContactLocationsRefresh();
    // Reset client state
    selectedGroup = null;
    myGroups = [];
    currentUser = null;
    currentProfile = null;
    profileCache = {};

    try {
        // Use local scope so signOut clears the local session immediately
        // without needing a server round-trip (which can hang if token expired).
        // Add a timeout guard: if signOut hangs (deadlocked locks), fall through.
        await Promise.race([
            db.auth.signOut({ scope: 'local' }),
            new Promise(resolve => setTimeout(() => {
                console.warn('[auth] signOut hung for 3s — forcing logout');
                resolve();
            }, 3000))
        ]);
    } catch (e) {
        console.warn('[auth] signOut error (ignored):', e);
    }
    // Always return to auth screen, even if signOut failed
    showAuth();
}

function showAuth() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    const installHintFloater = document.getElementById('installHintFloater');
    if (installHintFloater) installHintFloater.classList.add('hidden');
    document.getElementById('userDisplay').textContent = '';
    setHeaderAvatar(null);
}

async function showApp(navigateToGroupId) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('userDisplay').textContent = currentProfile?.display_name || currentUser.email;
    setHeaderAvatar(currentProfile?.profile_image_url || null);
    initContactsSortPrefs();

    if (!navigateToGroupId) {
        const storedNav = localStorage.getItem('fairshare_notification_nav');
        if (storedNav) {
            try {
                const nav = JSON.parse(storedNav);
                navigateToGroupId = nav.groupId;
                if (nav.tab) activeTab = nav.tab;
            } catch {}
            localStorage.removeItem('fairshare_notification_nav');
        }
    } else {
        localStorage.removeItem('fairshare_notification_nav');
    }

    if (!navigateToGroupId) {
        navigateTo('contacts');
    }

    await loadMyGroups(navigateToGroupId || null);

    if (navigateToGroupId) {
        navigateTo('groups');
    }

    // Defer non-critical work until after the first paint so the UI is
    // interactive as soon as possible.
    setTimeout(async () => {
        subscribeToContactShares();
        subscribeToContactEvents();
        subscribeToContactNotifications();
        subscribeToGroupInvitations();
        maybeShowInstallHintFloater();
        if (currentProfile?.push_notifications !== false) subscribeToPush();
        await openPendingContactDetailsIfAny();
        await checkPendingGroupInvitations();
        await checkPendingSuggestedPictures();
        checkAndStartNearbyTracking();
        // Populate locationSharesOutbound/Inbound from the DB before deciding
        // whether to start the native location pipeline. Without this, a user
        // who has an existing outbound share from a prior session would never
        // kick off plugin.start() at launch (locationSharesOutbound would stay
        // empty until the contact list finished rendering and ran its own
        // loadLocationShares() as a side effect).
        try { await loadLocationShares(); } catch (e) { console.warn('loadLocationShares at login failed:', e); }
        checkAndStartLocationSharing();
        subscribeToLocationShares();
        // Fetch current positions of anyone sharing with us and wire up the
        // realtime/poll refresh so the card/map stays current.
        try { await loadContactLocations(); } catch (e) { console.warn('loadContactLocations at login failed:', e); }
        refreshContactLocationsSubscriptions();
    }, 0);
}

function subscribeToContactShares() {
    if (contactSharesChannel) {
        db.removeChannel(contactSharesChannel);
        contactSharesChannel = null;
    }
    if (!currentUser) return;
    contactSharesChannel = db.channel('contact-shares')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'contact_shares',
            filter: 'to_user_id=eq.' + currentUser.id
        }, async (payload) => {
            const fromId = payload.new?.from_user_id;
            const sharedType = payload.new?.shared_type;
            if (!fromId || !sharedType) return;
            const { data: profile } = await db.from('profiles').select('display_name').eq('id', fromId).single();
            const name = profile?.display_name || 'Someone';
            const msg = sharedType === 'phone' ? (name + ' shared phone number with you.') : (name + ' shared email with you.');
            showToast(msg, 'info');
        })
        .subscribe();
}

function subscribeToContactNotifications() {
    if (contactNotificationsChannel) {
        db.removeChannel(contactNotificationsChannel);
        contactNotificationsChannel = null;
    }
    if (!currentUser) return;
    contactNotificationsChannel = db.channel('contact-notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'contact_notifications',
            filter: 'to_user_id=eq.' + currentUser.id
        }, async (payload) => {
            if (payload.new?.notification_type === 'profile_picture_suggested') {
                const notification = Object.assign({}, payload.new);
                if (!notification.data?.image_url) {
                    try {
                        const { data: notifData } = await db.rpc('get_contact_notification_data', {
                            p_notification_id: notification.id
                        });
                        if (notifData) notification.data = notifData;
                    } catch (e) {
                        console.warn('get_contact_notification_data fallback failed:', e);
                    }
                }
                showSuggestedPictureDialog(notification);
            } else if (payload.new?.notification_type === 'met_date_set') {
                const msg = payload.new?.message;
                if (msg) showToast(msg, 'info');
                const fromId = payload.new?.from_user_id;
                const metDate = payload.new?.data?.met_date;
                if (fromId && metDate) updateContactMetDate(fromId, metDate);
            } else if (payload.new?.notification_type === 'nearby_alert') {
                const msg = payload.new?.message;
                if (msg) showToast(msg, 'success');
            } else if (payload.new?.notification_type === 'location_share_started') {
                const msg = payload.new?.message;
                if (msg) showToast(msg, 'success');
            } else if (payload.new?.notification_type === 'new_selfie') {
                // In-app display is handled by the contacts.selfie_url UPDATE Realtime event,
                // which also refreshes the selfie strip. This notification exists for push delivery only.
            } else if (payload.new?.notification_type === 'profile_picture_updated'
                    || payload.new?.notification_type === 'profile_updated') {
                const fromId = payload.new?.from_user_id;
                const msg = payload.new?.message;
                if (fromId) {
                    try {
                        const { data: fresh } = await db.from('profiles')
                            .select('profile_image_url')
                            .eq('id', fromId)
                            .single();
                        // Use the notification's created_at as the cache-bust token so
                        // same-URL replacements (upsert into the same storage path)
                        // actually reload in the browser.
                        const bust = payload.new?.created_at || Date.now();
                        const url = fresh?.profile_image_url || null;
                        if (typeof updateContactAvatarInList === 'function') {
                            updateContactAvatarInList(fromId, url, bust);
                        }
                        if (typeof cdUpdateHeroAvatar === 'function') {
                            cdUpdateHeroAvatar(fromId, url, bust);
                        }
                    } catch (e) {
                        console.warn('refresh contact avatar after profile update failed:', e);
                    }
                }
                if (msg) showToast(msg, 'info');
            } else {
                const msg = payload.new?.message;
                if (msg) showToast(msg, 'info');
            }
        })
        .subscribe();
}

function subscribeToContactEvents() {
    if (contactEventsChannel) {
        db.removeChannel(contactEventsChannel);
        contactEventsChannel = null;
    }
    if (!currentUser) return;

    contactEventsChannel = db.channel('contact-events')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'contacts',
            filter: 'user_id=eq.' + currentUser.id
        }, async (payload) => {
            const contactId = payload.new?.contact_id;
            if (!contactId) return;
            await openContactDetailsById(contactId);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'contacts',
            filter: 'user_id=eq.' + currentUser.id
        }, async (payload) => {
            const contactId = payload.new?.contact_id;
            const oldSelfie = payload.old?.selfie_url || '';
            const newSelfie = payload.new?.selfie_url || '';
            if (!contactId || !newSelfie || oldSelfie === newSelfie) return;

            updateContactSelfieInList(contactId, newSelfie);

            const recentUploadAt = recentSelfieUploads[contactId] || 0;
            if (Date.now() - recentUploadAt < 15000) {
                delete recentSelfieUploads[contactId];
                return;
            }

            const { data: profile } = await db.from('profiles').select('display_name').eq('id', contactId).single();
            const name = profile?.display_name || 'Someone';
            showToast(name + ' took a new selfie with you.', 'info');
        })
        .subscribe();
}

async function checkPendingSuggestedPictures() {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'suggested_picture') return;
    window.history.replaceState({}, document.title, window.location.pathname);
    await fetchAndShowSuggestedPicture();
}

async function fetchAndShowSuggestedPicture() {
    if (!currentUser) return;
    try {
        const { data, error } = await db
            .from('contact_notifications')
            .select('*')
            .eq('to_user_id', currentUser.id)
            .eq('notification_type', 'profile_picture_suggested')
            .order('created_at', { ascending: false })
            .limit(1);
        if (error || !data || data.length === 0) return;
        const notification = data[0];
        if (!notification.data?.image_url) {
            try {
                const { data: notifData } = await db.rpc('get_contact_notification_data', {
                    p_notification_id: notification.id
                });
                if (notifData) notification.data = notifData;
            } catch (e) {
                console.warn('get_contact_notification_data fallback failed:', e);
            }
        }
        showSuggestedPictureDialog(notification);
    } catch (e) {
        console.error('fetchAndShowSuggestedPicture error:', e);
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'notification-click') {
            handleNotificationNavigation('/' + (event.data.search || ''));
        }
    });
}
