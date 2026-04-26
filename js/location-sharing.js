const LOCATION_SHARING_POLL_MS = 60000;
const LOCATION_SHARING_INSTANCE_KEY = 'union_location_sharing_instance_id';
// How often the viewer polls inbound-sharer positions as a safety net. Realtime
// (when enabled on user_locations) does the heavy lifting; this catches any
// missed events and covers the case where the publication migration hasn't
// been applied yet.
const INBOUND_LOCATION_POLL_MS = 60000;
let contactLocationsCache = {}; // contact_id -> { lat, lng }

function getLocationSharingInstanceId() {
    try {
        let id = localStorage.getItem(LOCATION_SHARING_INSTANCE_KEY);
        if (!id) {
            id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
            localStorage.setItem(LOCATION_SHARING_INSTANCE_KEY, id);
        }
        return id;
    } catch (_) {
        return 'volatile-' + String(Date.now());
    }
}

function getLocationSharingPlatform() {
    if (IS_NATIVE) return 'ios';
    return 'web';
}

function getLocationSharingUserAgent() {
    try {
        return String(navigator.userAgent || '').slice(0, 500);
    } catch (_) {
        return '';
    }
}

function toggleShareLocation(contactId, enabled) {
    if (!currentUser) return;
    if (!enabled) {
        stopSharingLocation(contactId);
        return;
    }
    const row = contactsLoadedRows.find(r => r.contact.contact_id === contactId);
    shareLocationContactId = contactId;
    shareLocationContactName = row?.profile?.display_name || 'contact';
    showModal('shareLocationDuration');
}

async function shareLocationWithContact(contactId, duration) {
    if (!currentUser) return;
    const expiresAt = duration ? new Date(Date.now() + duration).toISOString() : null;
    try {
        const { error } = await db
            .from('location_shares')
            .upsert({
                from_user_id: currentUser.id,
                to_user_id: contactId,
                started_at: new Date().toISOString(),
                expires_at: expiresAt,
                source_instance_id: getLocationSharingInstanceId(),
                source_platform: getLocationSharingPlatform(),
                source_user_agent: getLocationSharingUserAgent()
            }, { onConflict: 'from_user_id,to_user_id' });
        if (error) throw error;

        locationSharesOutbound[contactId] = { expires_at: expiresAt };
        updateShareLocationCheckbox(contactId, true, expiresAt);
        checkAndStartLocationSharing();

        const displayName = currentProfile?.display_name || 'Someone';
        const msg = displayName + ' started sharing location with you';
        db.from('contact_notifications').insert({
            to_user_id: contactId,
            from_user_id: currentUser.id,
            notification_type: 'location_share_started',
            message: msg
        }).then(({ error: nErr }) => {
            if (nErr) console.warn('location share notification error:', nErr);
        });
        db.rpc('send_push_to_users', {
            p_user_ids: [contactId],
            p_actor_id: currentUser.id,
            p_title: 'Union',
            p_body: msg
        }).then(({ error: pErr }) => {
            if (pErr) console.warn('location share push error:', pErr);
        });
    } catch (e) {
        console.error('shareLocationWithContact error:', e);
        showToast('Could not share location.', 'error');
        updateShareLocationCheckbox(contactId, false, null);
    }
}

async function stopSharingLocation(contactId) {
    if (!currentUser) return;
    try {
        const { error } = await db
            .from('location_shares')
            .delete()
            .eq('from_user_id', currentUser.id)
            .eq('to_user_id', contactId);
        if (error) throw error;

        delete locationSharesOutbound[contactId];
        updateShareLocationCheckbox(contactId, false, null);
        checkAndStartLocationSharing();
    } catch (e) {
        console.error('stopSharingLocation error:', e);
        showToast('Could not stop sharing location.', 'error');
        updateShareLocationCheckbox(contactId, true, locationSharesOutbound[contactId]?.expires_at || null);
    }
}

function updateShareLocationCheckbox(contactId, checked, expiresAt) {
    const cb = document.querySelector(`.contact-share-location-checkbox[data-contact-id="${contactId}"]`);
    if (cb) cb.checked = checked;
    const span = document.getElementById('share-loc-remaining-' + contactId);
    if (span) {
        const text = checked ? formatLocationShareRemaining(expiresAt) : '';
        span.textContent = text;
        span.style.display = text ? '' : 'none';
    }
    // Broadcast so the Contact Details screen can re-sync its toggle.
    try {
        window.dispatchEvent(new CustomEvent('union:locationShareChanged', {
            detail: { contactId, sharing: !!checked, expiresAt: expiresAt || null }
        }));
    } catch (_) { /* best effort */ }
}

function hasAnyActiveLocationShares() {
    const now = Date.now();
    return Object.values(locationSharesOutbound).some(s =>
        isLocationShareOwnedByThisDevice(s) &&
        (s.expires_at === null || new Date(s.expires_at).getTime() > now)
    );
}

function isLocationShareOwnedByThisDevice(share) {
    return !share?.source_instance_id || share.source_instance_id === getLocationSharingInstanceId();
}

function checkAndStartLocationSharing() {
    const active = hasAnyActiveLocationShares();
    const outboundIds = Object.keys(locationSharesOutbound || {});
    console.log('[location-sharing] checkAndStartLocationSharing: active=', active,
        'outbound contact ids=', outboundIds);
    if (active) {
        startLocationSharingUpdates();
    } else {
        stopLocationSharingUpdates();
    }
}

function startLocationSharingUpdates() {
    if (locationSharingInterval) return;

    console.log('[location-sharing] startLocationSharingUpdates: IS_NATIVE=', IS_NATIVE,
        'outboundShares=', Object.keys(locationSharesOutbound || {}).length);

    startNativeLocationSharing();

    sendSharingLocationPoll();
    locationSharingInterval = setInterval(sendSharingLocationPoll, LOCATION_SHARING_POLL_MS);
    startShareRemainingTimer();
}

async function getNativeLocationSharingConfig() {
    if (!currentUser || !db?.auth?.getSession) return null;
    const { data, error } = await db.auth.getSession();
    if (error) {
        console.warn('[location-sharing] could not read auth session for native location:', error);
        return null;
    }
    const accessToken = data?.session?.access_token;
    if (!accessToken) return null;
    return {
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        accessToken,
        userId: currentUser.id,
        instanceId: getLocationSharingInstanceId(),
        sourcePlatform: getLocationSharingPlatform(),
        sourceUserAgent: getLocationSharingUserAgent()
    };
}

async function startNativeLocationSharing() {
    if (!IS_NATIVE) return;
    try {
        const plugin = Capacitor.Plugins.BackgroundLocation;
        if (!plugin) {
            console.warn('[location-sharing] BackgroundLocation plugin not registered on this native build');
            return;
        }
        if (!startNativeLocationSharing._listenerAttached) {
            plugin.addListener('locationUpdate', (pos) => {
                console.log('[location-sharing] native locationUpdate', pos);
                nativeLocationLastPosition = { lat: pos.lat, lng: pos.lng };
                nativeLocationLastAt = Date.now();
                // Foreground fallback. The native plugin also writes accepted
                // fixes directly so background suspension does not stop sharing.
                sendSharingLocationUpdate(pos.lat, pos.lng);
            });
            startNativeLocationSharing._listenerAttached = true;
        }
        const config = await getNativeLocationSharingConfig();
        await plugin.start(config || {});
        console.log('[location-sharing] native plugin.start resolved');
    } catch (e) {
        console.warn('Native BackgroundLocation start failed:', e);
    }
}

function refreshNativeLocationSharingAuth() {
    if (!IS_NATIVE || !hasAnyActiveLocationShares()) return;
    startNativeLocationSharing();
}

function stopLocationSharingUpdates() {
    const wasRunning = !!locationSharingInterval;
    if (locationSharingInterval) {
        clearInterval(locationSharingInterval);
        locationSharingInterval = null;
    }
    stopShareRemainingTimer();

    // Only touch the native plugin if we'd previously started it. Calling
    // plugin.stop() when start() was never invoked just produces a confusing
    // "stop failed" log.
    if (IS_NATIVE && wasRunning) {
        try {
            const plugin = Capacitor.Plugins.BackgroundLocation;
            if (plugin && !hasAnyNearbyContacts()) {
                plugin.stop().catch(err => console.warn('[location-sharing] plugin.stop rejected:', err));
            }
        } catch (e) {
            console.warn('Native BackgroundLocation stop failed:', e);
        }
    }
}

async function sendSharingLocationPoll() {
    if (!currentUser) return;
    // Always request a fresh fix on every poll tick. We used to short-circuit
    // on native whenever `nativeLocationLastPosition` was non-null, relying on
    // the `locationUpdate` listener for updates. But Core Location's
    // distanceFilter suppresses those events until the device moves ~100m, so
    // a stationary user would keep the DB's `updated_at` fresh (via nearby
    // tracking) while lat/lng stayed hours old — contacts then saw
    // "updated just now" at the wrong location.
    try {
        console.log('[location-sharing] poll tick, requesting GPS');
        const pos = await getGPSLocation();
        if (!pos) {
            console.warn('[location-sharing] poll got no GPS position');
            return;
        }
        console.log('[location-sharing] poll got GPS', pos);
        await sendSharingLocationUpdate(pos.lat, pos.lng);
    } catch (e) {
        console.warn('Location sharing poll failed:', e);
    }
}

async function sendSharingLocationUpdate(lat, lng) {
    if (!currentUser) return;
    if (!hasAnyActiveLocationShares()) return;
    try {
        const { error } = await db
            .from('user_locations')
            .upsert({
                user_id: currentUser.id,
                lat: lat,
                lng: lng,
                updated_at: new Date().toISOString(),
                source_instance_id: getLocationSharingInstanceId(),
                source_platform: getLocationSharingPlatform(),
                source_user_agent: getLocationSharingUserAgent()
            }, { onConflict: 'user_id' });
        if (error) {
            console.warn('[location-sharing] upsert error:', error);
        } else {
            console.log('[location-sharing] upserted user_locations', { lat, lng });
        }
    } catch (e) {
        console.warn('Location sharing update failed:', e);
    }
}

function formatLocationShareRemaining(expiresAt) {
    if (!expiresAt) return '';
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return '';
    const minutes = Math.ceil(remaining / 60000);
    if (minutes < 60) return 'For next ' + minutes + ' minute' + (minutes === 1 ? '' : 's');
    const hours = Math.ceil(remaining / 3600000);
    if (hours < 24) return 'For next ' + hours + ' hour' + (hours === 1 ? '' : 's');
    const days = Math.ceil(remaining / 86400000);
    return 'For next ' + days + ' day' + (days === 1 ? '' : 's');
}

function startShareRemainingTimer() {
    if (shareRemainingTimer) return;
    shareRemainingTimer = setInterval(refreshShareRemainingTimers, 60000);
}

function stopShareRemainingTimer() {
    if (shareRemainingTimer) {
        clearInterval(shareRemainingTimer);
        shareRemainingTimer = null;
    }
}

function refreshShareRemainingTimers() {
    const now = Date.now();
    let anyExpired = false;
    for (const [contactId, share] of Object.entries(locationSharesOutbound)) {
        if (share.expires_at && new Date(share.expires_at).getTime() <= now) {
            delete locationSharesOutbound[contactId];
            updateShareLocationCheckbox(contactId, false, null);
            anyExpired = true;
            continue;
        }
        updateShareLocationCheckbox(contactId, true, share.expires_at);
    }
    if (anyExpired) {
        checkAndStartLocationSharing();
    }
}

async function loadLocationShares() {
    if (!currentUser) return;
    try {
        let { data: shares, error } = await db
            .from('location_shares')
            .select('from_user_id, to_user_id, expires_at, source_instance_id')
            .or('from_user_id.eq.' + currentUser.id + ',to_user_id.eq.' + currentUser.id);
        if (error && /source_instance_id/i.test(error.message || '')) {
            const fallback = await db
                .from('location_shares')
                .select('from_user_id, to_user_id, expires_at')
                .or('from_user_id.eq.' + currentUser.id + ',to_user_id.eq.' + currentUser.id);
            shares = fallback.data;
            error = fallback.error;
        }
        if (error) throw error;

        locationSharesOutbound = {};
        locationSharesInbound = {};
        const now = new Date().toISOString();
        (shares || []).forEach(s => {
            if (s.expires_at && s.expires_at < now) return;
            if (s.from_user_id === currentUser.id) {
                locationSharesOutbound[s.to_user_id] = {
                    expires_at: s.expires_at,
                    source_instance_id: s.source_instance_id || null
                };
            } else {
                locationSharesInbound[s.from_user_id] = { expires_at: s.expires_at };
            }
        });
    } catch (e) {
        console.error('loadLocationShares error:', e);
    }
}

async function claimUnownedLocationSharesForThisDevice() {
    if (!currentUser) return;
    try {
        const { error } = await db
            .from('location_shares')
            .update({
                source_instance_id: getLocationSharingInstanceId(),
                source_platform: getLocationSharingPlatform(),
                source_user_agent: getLocationSharingUserAgent()
            })
            .eq('from_user_id', currentUser.id)
            .is('source_instance_id', null)
            .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
        if (error) throw error;
        await loadLocationShares();
    } catch (e) {
        console.warn('claimUnownedLocationSharesForThisDevice failed:', e);
    }
}

function subscribeToLocationShares() {
    if (locationSharesChannel) {
        db.removeChannel(locationSharesChannel);
        locationSharesChannel = null;
    }
    if (!currentUser) return;
    locationSharesChannel = db.channel('location-shares')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'location_shares',
            filter: 'to_user_id=eq.' + currentUser.id
        }, () => {
            handleLocationSharesChanged();
        })
        .subscribe();
}

function unsubscribeFromLocationShares() {
    if (locationSharesChannel) {
        db.removeChannel(locationSharesChannel);
        locationSharesChannel = null;
    }
}

async function handleLocationSharesChanged() {
    await loadLocationShares();
    await loadContactLocations();
    refreshContactLocationsSubscriptions();
    if (activeMainView === 'contacts') {
        const openRow = document.querySelector('.contact-row.expanded');
        const openCid = openRow?.dataset?.contactId;
        await loadAndRenderContactList();
        if (openCid) expandContactRow(openCid);
    }
}

// Keep the viewer's view of each inbound sharer's position fresh. We both
// subscribe to Realtime UPDATE/INSERT events on `user_locations` (server-side
// filtered by RLS to rows this user is allowed to see) and run a slow poll as
// a fallback in case Realtime is not enabled on the table yet.
function refreshContactLocationsSubscriptions() {
    const inboundIds = Object.keys(locationSharesInbound || {});
    if (inboundIds.length === 0) {
        stopContactLocationsRefresh();
        return;
    }
    startContactLocationsRealtime();
    startContactLocationsPolling();
}

function startContactLocationsRealtime() {
    if (contactLocationsChannel) return;
    if (!currentUser) return;
    try {
        contactLocationsChannel = db.channel('contact-locations')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_locations'
            }, (payload) => {
                const row = payload.new || payload.old;
                if (!row || !row.user_id) return;
                // We only care about inbound sharers. RLS should already limit
                // what we receive, but double-check client-side.
                if (!locationSharesInbound[row.user_id]) return;
                if (payload.eventType === 'DELETE') {
                    delete contactLocationsCache[row.user_id];
                } else if (typeof row.lat === 'number' && typeof row.lng === 'number') {
                    contactLocationsCache[row.user_id] = {
                        lat: row.lat,
                        lng: row.lng,
                        updated_at: row.updated_at || new Date().toISOString()
                    };
                }
                try {
                    window.dispatchEvent(new CustomEvent('union:contactLocationsLoaded'));
                } catch (_) { /* best effort */ }
            })
            .subscribe();
    } catch (e) {
        console.warn('startContactLocationsRealtime failed:', e);
    }
}

function startContactLocationsPolling() {
    if (contactLocationsPollInterval) return;
    document.addEventListener('visibilitychange', handleContactLocationsVisibility);
    window.addEventListener('focus', handleContactLocationsFocus);
    contactLocationsPollInterval = setInterval(() => {
        loadContactLocations();
    }, INBOUND_LOCATION_POLL_MS);
}

function stopContactLocationsRefresh() {
    if (contactLocationsChannel) {
        try { db.removeChannel(contactLocationsChannel); } catch (_) { /* noop */ }
        contactLocationsChannel = null;
    }
    if (contactLocationsPollInterval) {
        clearInterval(contactLocationsPollInterval);
        contactLocationsPollInterval = null;
    }
    document.removeEventListener('visibilitychange', handleContactLocationsVisibility);
    window.removeEventListener('focus', handleContactLocationsFocus);
}

function handleContactLocationsVisibility() {
    if (document.visibilityState === 'visible') {
        loadContactLocations();
    }
}

function handleContactLocationsFocus() {
    loadContactLocations();
}

function shareLocationDurationChoice(duration) {
    if (!shareLocationContactId) return;
    const contactId = shareLocationContactId;
    shareLocationContactId = null;
    shareLocationContactName = '';
    closeModal({ refreshContactList: false });
    shareLocationWithContact(contactId, duration);
}

function cancelShareLocationDialog() {
    const contactId = shareLocationContactId;
    shareLocationContactId = null;
    shareLocationContactName = '';
    closeModal({ refreshContactList: false });
    if (contactId) {
        updateShareLocationCheckbox(contactId, false, null);
    }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = v => v * Math.PI / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(miles) {
    if (miles < 1) {
        const feet = Math.round(miles * 5280);
        return feet + ' feet away';
    }
    if (miles < 10) return miles.toFixed(1) + ' miles away';
    return Math.round(miles) + ' miles away';
}

async function loadContactLocations() {
    if (!currentUser) return;
    const inboundIds = Object.keys(locationSharesInbound);
    if (inboundIds.length === 0) {
        contactLocationsCache = {};
        return;
    }
    try {
        const { data, error } = await db
            .from('user_locations')
            .select('user_id, lat, lng, updated_at')
            .in('user_id', inboundIds);
        if (error) throw error;
        contactLocationsCache = {};
        (data || []).forEach(r => {
            contactLocationsCache[r.user_id] = {
                lat: r.lat,
                lng: r.lng,
                updated_at: r.updated_at || null
            };
        });
        try {
            window.dispatchEvent(new CustomEvent('union:contactLocationsLoaded'));
        } catch (_) { /* best effort */ }
    } catch (e) {
        console.error('loadContactLocations error:', e);
    }
}

function renderContactLocationMap(contactId) {
    const loc = contactLocationsCache[contactId];
    if (!loc) return;
    const mapElId = 'contact-loc-map-' + contactId;
    const el = document.getElementById(mapElId);
    if (!el) return;

    updateContactLocationDistance(contactId);

    // If we've already built a Leaflet map in this element, just move it to
    // the new position instead of rebuilding. This lets realtime updates
    // animate the marker while the card stays open.
    if (el._leafletMap && el._leafletMarker) {
        try {
            el._leafletMap.setView([loc.lat, loc.lng], el._leafletMap.getZoom() || 14);
            el._leafletMarker.setLatLng([loc.lat, loc.lng]);
        } catch (_) { /* best effort */ }
        return;
    }

    el.dataset.rendered = '1';

    requestAnimationFrame(() => {
        const target = document.getElementById(mapElId);
        if (!target) return;
        const miniMap = L.map(target, {
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false,
            attributionControl: false
        }).setView([loc.lat, loc.lng], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
        }).addTo(miniMap);

        const marker = L.marker([loc.lat, loc.lng]).addTo(miniMap);
        target._leafletMap = miniMap;
        target._leafletMarker = marker;
        setTimeout(() => miniMap.invalidateSize(), 100);
        setTimeout(() => miniMap.invalidateSize(), 400);
    });
}

function updateContactLocationDistance(contactId) {
    const loc = contactLocationsCache[contactId];
    if (!loc) return;
    const distEl = document.getElementById('contact-loc-dist-' + contactId);
    if (!distEl) return;
    try {
        getGPSLocation().then(myPos => {
            if (myPos) {
                const miles = haversineDistance(myPos.lat, myPos.lng, loc.lat, loc.lng);
                distEl.textContent = formatDistance(miles);
            }
        }).catch(() => {});
    } catch (_) { /* non-critical */ }
}

// When any inbound sharer's position updates, nudge any rendered mini-map(s)
// to the new spot and refresh the distance label. The contact details pane
// re-renders itself via its own `union:contactLocationsLoaded` listener, and
// the fullscreen map always reads from the cache when opened — so together
// these keep every surface live.
window.addEventListener('union:contactLocationsLoaded', () => {
    Object.keys(contactLocationsCache || {}).forEach(cid => {
        const el = document.getElementById('contact-loc-map-' + cid);
        if (el) renderContactLocationMap(cid);
    });
});

function openContactLocationFullscreen(contactId, contactName) {
    const loc = contactLocationsCache[contactId];
    if (!loc) return;

    let overlay = document.getElementById('contact-location-fullscreen');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'contact-location-fullscreen';
        overlay.className = 'contact-location-fullscreen';
        overlay.innerHTML = `
            <button class="contact-location-fullscreen-close" aria-label="Close">✕</button>
            <div class="contact-location-fullscreen-map" id="contact-location-fullscreen-map"></div>`;
        overlay.querySelector('.contact-location-fullscreen-close')
            .addEventListener('click', closeContactLocationFullscreen);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeContactLocationFullscreen();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) closeContactLocationFullscreen();
        });
        document.body.appendChild(overlay);
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    const mapEl = document.getElementById('contact-location-fullscreen-map');
    mapEl.innerHTML = '';

    requestAnimationFrame(() => {
        const fullMap = L.map(mapEl, {
            zoomControl: true,
            attributionControl: false
        }).setView([loc.lat, loc.lng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
        }).addTo(fullMap);

        const fullMarker = L.marker([loc.lat, loc.lng])
            .addTo(fullMap)
            .bindPopup(esc(contactName || 'Contact'))
            .openPopup();

        overlay._leafletMap = fullMap;
        overlay._leafletMarker = fullMarker;
        overlay._contactId = contactId;
        setTimeout(() => fullMap.invalidateSize(), 200);
    });
}

// Keep an open fullscreen map in sync with realtime updates.
window.addEventListener('union:contactLocationsLoaded', () => {
    const overlay = document.getElementById('contact-location-fullscreen');
    if (!overlay || !overlay.classList.contains('active')) return;
    const cid = overlay._contactId;
    if (!cid) return;
    const loc = contactLocationsCache[cid];
    if (!loc || !overlay._leafletMap || !overlay._leafletMarker) return;
    try {
        overlay._leafletMarker.setLatLng([loc.lat, loc.lng]);
        overlay._leafletMap.panTo([loc.lat, loc.lng]);
    } catch (_) { /* best effort */ }
});

function closeContactLocationFullscreen() {
    const overlay = document.getElementById('contact-location-fullscreen');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    if (overlay._leafletMap) {
        overlay._leafletMap.remove();
        overlay._leafletMap = null;
    }
}
