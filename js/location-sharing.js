const LOCATION_SHARING_POLL_MS = 60000;
let contactLocationsCache = {}; // contact_id -> { lat, lng }

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
                expires_at: expiresAt
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
}

function hasAnyActiveLocationShares() {
    const now = Date.now();
    return Object.values(locationSharesOutbound).some(s =>
        s.expires_at === null || new Date(s.expires_at).getTime() > now
    );
}

function checkAndStartLocationSharing() {
    if (hasAnyActiveLocationShares()) {
        startLocationSharingUpdates();
    } else {
        stopLocationSharingUpdates();
    }
}

function startLocationSharingUpdates() {
    if (locationSharingInterval) return;

    if (IS_NATIVE) {
        try {
            const plugin = Capacitor.Plugins.BackgroundLocation;
            plugin.addListener('locationUpdate', (pos) => {
                nativeLocationLastPosition = { lat: pos.lat, lng: pos.lng };
                sendSharingLocationUpdate(pos.lat, pos.lng);
            });
            plugin.start();
        } catch (e) {
            console.warn('Native BackgroundLocation start failed:', e);
        }
    }

    sendSharingLocationPoll();
    locationSharingInterval = setInterval(sendSharingLocationPoll, LOCATION_SHARING_POLL_MS);
    startShareRemainingTimer();
}

function stopLocationSharingUpdates() {
    if (locationSharingInterval) {
        clearInterval(locationSharingInterval);
        locationSharingInterval = null;
    }
    stopShareRemainingTimer();

    if (IS_NATIVE) {
        try {
            const plugin = Capacitor.Plugins.BackgroundLocation;
            if (!hasAnyNearbyContacts()) {
                plugin.stop();
            }
        } catch (e) {
            console.warn('Native BackgroundLocation stop failed:', e);
        }
    }
}

async function sendSharingLocationPoll() {
    if (!currentUser) return;
    if (IS_NATIVE && nativeLocationLastPosition) return;
    try {
        const pos = await getGPSLocation();
        if (!pos) return;
        await sendSharingLocationUpdate(pos.lat, pos.lng);
    } catch (e) {
        console.warn('Location sharing poll failed:', e);
    }
}

async function sendSharingLocationUpdate(lat, lng) {
    if (!currentUser) return;
    try {
        await db
            .from('user_locations')
            .upsert({
                user_id: currentUser.id,
                lat: lat,
                lng: lng,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
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
        const { data: shares, error } = await db
            .from('location_shares')
            .select('from_user_id, to_user_id, expires_at')
            .or('from_user_id.eq.' + currentUser.id + ',to_user_id.eq.' + currentUser.id);
        if (error) throw error;

        locationSharesOutbound = {};
        locationSharesInbound = {};
        const now = new Date().toISOString();
        (shares || []).forEach(s => {
            if (s.expires_at && s.expires_at < now) return;
            if (s.from_user_id === currentUser.id) {
                locationSharesOutbound[s.to_user_id] = { expires_at: s.expires_at };
            } else {
                locationSharesInbound[s.from_user_id] = { expires_at: s.expires_at };
            }
        });
    } catch (e) {
        console.error('loadLocationShares error:', e);
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
    if (activeMainView === 'contacts') {
        const openRow = document.querySelector('.contact-row.expanded');
        const openCid = openRow?.dataset?.contactId;
        await loadAndRenderContactList();
        if (openCid) expandContactRow(openCid);
    }
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
            .select('user_id, lat, lng')
            .in('user_id', inboundIds);
        if (error) throw error;
        contactLocationsCache = {};
        (data || []).forEach(r => {
            contactLocationsCache[r.user_id] = { lat: r.lat, lng: r.lng };
        });
    } catch (e) {
        console.error('loadContactLocations error:', e);
    }
}

function renderContactLocationMap(contactId) {
    const loc = contactLocationsCache[contactId];
    if (!loc) return;
    const mapElId = 'contact-loc-map-' + contactId;
    const el = document.getElementById(mapElId);
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';

    try {
        const distEl = document.getElementById('contact-loc-dist-' + contactId);
        if (distEl) {
            getGPSLocation().then(myPos => {
                if (myPos) {
                    const miles = haversineDistance(myPos.lat, myPos.lng, loc.lat, loc.lng);
                    distEl.textContent = formatDistance(miles);
                }
            }).catch(() => {});
        }
    } catch (e) { /* distance calc is non-critical */ }

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

        L.marker([loc.lat, loc.lng]).addTo(miniMap);
        setTimeout(() => miniMap.invalidateSize(), 100);
        setTimeout(() => miniMap.invalidateSize(), 400);
    });
}

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

        L.marker([loc.lat, loc.lng])
            .addTo(fullMap)
            .bindPopup(esc(contactName || 'Contact'))
            .openPopup();

        overlay._leafletMap = fullMap;
        setTimeout(() => fullMap.invalidateSize(), 200);
    });
}

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
