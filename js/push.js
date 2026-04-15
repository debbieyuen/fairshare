function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

function canUseWebPush() {
    if (IS_NATIVE) return false;
    const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    return isWebProtocol && window.isSecureContext && ('serviceWorker' in navigator) && ('PushManager' in window);
}

function canUseNativePush() {
    return IS_NATIVE && window.Capacitor?.Plugins?.PushNotifications;
}

function canUsePush() {
    return canUseWebPush() || canUseNativePush();
}

// ---- Native (APNs via Capacitor) ----

let _nativePushListenersRegistered = false;

async function subscribeToNativePush() {
    const PushNotifications = window.Capacitor.Plugins.PushNotifications;
    if (!PushNotifications) return;

    if (!_nativePushListenersRegistered) {
        _nativePushListenersRegistered = true;

        await PushNotifications.addListener('registration', async (token) => {
            console.log('[push] APNs device token:', token.value);
            try {
                const { error } = await db.from('device_push_tokens').upsert({
                    user_id: currentUser.id,
                    token: token.value,
                    platform: 'ios',
                }, { onConflict: 'user_id,token' });
                if (error) console.error('[push] Token upsert error:', error);
                else console.log('[push] Device token saved successfully');
            } catch (e) {
                console.warn('[push] Failed to save device token:', e);
            }
        });

        await PushNotifications.addListener('registrationError', (err) => {
            console.error('[push] Native push registration error:', JSON.stringify(err));
        });

        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[push] Foreground notification:', JSON.stringify(notification));
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[push] Notification tapped:', JSON.stringify(action));
            const data = action.notification?.data || {};
            const url = data.url || '/';
            handleNotificationNavigation(url);
        });
    }

    const permResult = await PushNotifications.requestPermissions();
    console.log('[push] Permission result:', JSON.stringify(permResult));
    if (permResult.receive !== 'granted') {
        console.warn('[push] Native push permission not granted:', permResult.receive);
        return;
    }
    await PushNotifications.register();
    console.log('[push] register() called successfully');
}

async function unsubscribeNativePush() {
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) return;
    try {
        await db.from('device_push_tokens')
            .delete()
            .eq('user_id', currentUser.id);
    } catch (e) {
        console.warn('[push] Failed to remove device tokens:', e);
    }
}

async function isNativePushRegistered() {
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) return false;
    try {
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive !== 'granted') return false;
        const { data, error } = await db.from('device_push_tokens')
            .select('id')
            .eq('user_id', currentUser.id)
            .limit(1);
        return !error && data && data.length > 0;
    } catch { return false; }
}

// ---- Web Push (existing) ----

async function subscribeToWebPush() {
    if (!canUseWebPush()) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg) return;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }
        const subJson = sub.toJSON();
        await db.from('push_subscriptions').upsert({
            user_id: currentUser.id,
            endpoint: subJson.endpoint,
            keys_p256dh: subJson.keys.p256dh,
            keys_auth: subJson.keys.auth,
        }, { onConflict: 'user_id,endpoint' });
    } catch (e) {
        console.warn('Push subscription failed:', e);
    }
}

async function unsubscribeWebPush() {
    if (!canUseWebPush()) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            const endpoint = sub.endpoint;
            await sub.unsubscribe();
            await db.from('push_subscriptions')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('endpoint', endpoint);
        }
    } catch (e) {
        console.warn('Push unsubscribe failed:', e);
    }
}

async function isWebPushSubscribed() {
    if (!canUseWebPush()) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg) return false;
        const sub = await reg.pushManager.getSubscription();
        return !!sub;
    } catch { return false; }
}

// ---- Unified API (called by auth.js and modals.js) ----

async function subscribeToPush() {
    if (canUseNativePush()) return subscribeToNativePush();
    return subscribeToWebPush();
}

async function unsubscribePush() {
    if (canUseNativePush()) return unsubscribeNativePush();
    return unsubscribeWebPush();
}

async function isPushSubscribed() {
    if (canUseNativePush()) return isNativePushRegistered();
    return isWebPushSubscribed();
}

// ---- Deep-link handler (shared by native tap + SW message) ----

function handleNotificationNavigation(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        const params = new URLSearchParams(parsed.search);

        if (params.get('action') === 'suggested_picture') {
            fetchAndShowSuggestedPicture();
        }

        const groupId = params.get('group');
        if (groupId) {
            const tab = params.get('tab');
            if (tab) activeTab = tab;
            navigateTo('groups');
            const membership = myGroups.find(m => m.group_id === groupId);
            if (membership) {
                selectGroup(membership.groups, membership);
            } else {
                loadMyGroups(groupId);
            }
        } else {
            Object.keys(contactSelfiesCache).forEach(k => delete contactSelfiesCache[k]);
            const expandedRow = document.querySelector('.contact-row.expanded');
            if (expandedRow?.dataset?.contactId) {
                reloadContactSelfiesStrip(expandedRow.dataset.contactId);
            }
        }
    } catch (e) {
        console.warn('[push] handleNotificationNavigation error:', e);
    }
}
