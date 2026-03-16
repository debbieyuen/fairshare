async function ensureSession() {
    // Returns true if session is valid, false if expired (and forces re-login)
    // Uses timeout guard in case the Supabase client is deadlocked
    try {
        const { data: { session }, error } = await getSessionWithTimeout();
        if (error || !session) {
            console.warn('[session] ensureSession: expired — redirecting to login');
            showToast('Session expired. Please log in again.', 'error');
            await logout();
            return false;
        }
        currentUser = session.user;
        return true;
    } catch (e) {
        console.warn('[session] ensureSession failed:', e);
        showToast('Session expired. Please log in again.', 'error');
        await logout();
        return false;
    }
}

// ---- Session keep-alive & recovery ----
// Two mechanisms work together:
//
// 1. visibilitychange — when the user returns after the tab was hidden (sleep,
//    minimised, switched tab).  If idle > 30 min, hard reload.
//
// 2. Periodic heartbeat (every 5 min) — catches the case where the tab stays
//    in the foreground on an awake computer but the session silently expires.
//    It makes a lightweight DB call; if it fails, the session is dead and we
//    force a reload.

let _lastActiveAt = Date.now();
const SESSION_STALE_MS = 30 * 60 * 1000; // 30 minutes

// --- Timeout-guarded getSession ---
// Supabase's internal navigator.locks can deadlock after a tab is
// backgrounded.  If getSession doesn't resolve within a few seconds,
// the client is stuck and we must hard-reload to recover.
const GET_SESSION_TIMEOUT_MS = 5000; // 5 seconds

function getSessionWithTimeout() {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            console.error('[session] getSession() hung for ' +
                GET_SESSION_TIMEOUT_MS + 'ms — Supabase client is stuck, reloading');
            window.location.reload();
        }, GET_SESSION_TIMEOUT_MS);

        db.auth.getSession().then(result => {
            clearTimeout(timer);
            resolve(result);
        }).catch(err => {
            clearTimeout(timer);
            console.warn('[session] getSession() threw:', err);
            resolve({ data: { session: null }, error: err });
        });
    });
}

// --- Mechanism 1: visibilitychange ---
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
        _lastActiveAt = Date.now();
        return;
    }
    // Page just became visible again
    if (!currentUser) return;

    const elapsed = Date.now() - _lastActiveAt;
    console.log(`[visibility] Tab resumed after ${Math.round(elapsed / 1000)}s`);

    if (elapsed > SESSION_STALE_MS) {
        // Been away too long — hard reload lets init() do a clean token refresh
        console.log(`[visibility] Idle ${Math.round(elapsed / 60000)} min — reloading`);
        window.location.reload();
        return;
    }

    // Short absence — just verify the session and re-subscribe to Realtime
    try {
        const { data: { session } } = await getSessionWithTimeout();
        if (!session) {
            showToast('Session expired — please log in again.', 'error');
            await logout();
        } else {
            currentUser = session.user;
            // Re-subscribe to realtime in case the channel was dropped
            if (selectedGroup) subscribeToGroup(selectedGroup.id);
        }
    } catch (e) {
        console.warn('[visibility] Session check failed:', e);
    }
});

// --- Mechanism 2: periodic heartbeat ---
// Every 5 minutes, make a tiny authenticated request. If the session is dead
// the request will fail and we reload to get a clean start.
const HEARTBEAT_MS = 5 * 60 * 1000; // 5 minutes
setInterval(async () => {
    if (!currentUser) return;  // not logged in, nothing to check
    console.log('[heartbeat] checking session…');
    try {
        // Lightweight RPC: select our own profile row (tiny payload, tests auth)
        const { error } = await Promise.race([
            db.from('profiles').select('id').eq('id', currentUser.id).single(),
            new Promise((_, reject) => setTimeout(() =>
                reject(new Error('Heartbeat timed out (10s) — client may be stuck')),
                10000))
        ]);
        if (error) {
            console.warn('[heartbeat] failed — session likely expired, reloading', error);
            window.location.reload();
        } else {
            console.log('[heartbeat] OK');
        }
    } catch (e) {
        console.warn('[heartbeat] exception — reloading', e);
        window.location.reload();
    }
}, HEARTBEAT_MS);
