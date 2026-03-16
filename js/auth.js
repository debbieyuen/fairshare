function hasInviteOrMeetToken() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('invite') || params.get('meet')) return true;
    if (localStorage.getItem('fairshare_invite') || localStorage.getItem('fairshare_meet')) return true;
    return false;
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
    if (tab === 'signup') {
        const hasToken = hasInviteOrMeetToken();
        document.getElementById('signupGate').classList.toggle('hidden', hasToken);
        document.getElementById('signupFields').classList.toggle('hidden', !hasToken);
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
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('userDisplay').textContent = '';
    setHeaderAvatar(null);
}

async function showApp(navigateToGroupId) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('userDisplay').textContent = currentProfile?.display_name || currentUser.email;
    subscribeToContactShares();
    if (currentProfile?.push_notifications !== false) subscribeToPush();
    await loadMyGroups(navigateToGroupId || null);
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
