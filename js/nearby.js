const NEARBY_POLL_INTERVAL_MS = 60000; // 1 minute

function hasAnyNearbyContacts() {
    return contactsLoadedRows.some(r => r.contact && r.contact.notify_nearby);
}

function startNearbyTracking() {
    if (nearbyTrackingInterval) return;
    if (!('geolocation' in navigator)) return;
    nearbyTrackingActive = true;
    sendLocationUpdate();
    nearbyTrackingInterval = setInterval(sendLocationUpdate, NEARBY_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleNearbyVisibility);
}

function stopNearbyTracking() {
    nearbyTrackingActive = false;
    if (nearbyTrackingInterval) {
        clearInterval(nearbyTrackingInterval);
        nearbyTrackingInterval = null;
    }
    document.removeEventListener('visibilitychange', handleNearbyVisibility);
}

function handleNearbyVisibility() {
    if (document.visibilityState === 'visible') {
        if (nearbyTrackingActive && !nearbyTrackingInterval) {
            sendLocationUpdate();
            nearbyTrackingInterval = setInterval(sendLocationUpdate, NEARBY_POLL_INTERVAL_MS);
        }
    } else {
        if (nearbyTrackingInterval) {
            clearInterval(nearbyTrackingInterval);
            nearbyTrackingInterval = null;
        }
    }
}

async function sendLocationUpdate() {
    if (!currentUser || document.visibilityState !== 'visible') return;
    try {
        const pos = await getGPSLocation();
        if (!pos) return;
        await db.rpc('update_location_and_check_nearby', {
            p_lat: pos.lat,
            p_lng: pos.lng
        });
    } catch (e) {
        console.warn('Nearby location update failed:', e);
    }
}

function checkAndStartNearbyTracking() {
    if (hasAnyNearbyContacts()) {
        startNearbyTracking();
    } else {
        stopNearbyTracking();
    }
}
