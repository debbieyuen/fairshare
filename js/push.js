function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
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

async function unsubscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
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

async function isPushSubscribed() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return !!sub;
    } catch { return false; }
}
