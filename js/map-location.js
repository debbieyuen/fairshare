const LOCATION_PATTERN = /^📍location:([-\d.]+),([-\d.]+),([\d.]+)$/;
const DEFAULT_RADIUS = 100;
const MIN_RADIUS = 10;
const MAX_RADIUS = 50000;

function parseLocationBody(body) {
    const m = body && body.trim().match(LOCATION_PATTERN);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    const radius = parseFloat(m[3]);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng, radius };
}

function formatRadius(meters) {
    if (meters >= 1000) return (meters / 1000).toFixed(1).replace(/\.0$/, '') + ' km';
    return Math.round(meters) + ' m';
}

function openMapPicker() {
    if (!selectedGroup || !currentUser) return;

    const overlay = document.createElement('div');
    overlay.className = 'map-picker-overlay';
    overlay.innerHTML = `
        <div class="map-picker-modal">
            <div class="map-picker-header">
                <h3>Share Location</h3>
                <span class="map-picker-radius" id="mapPickerRadius">Radius: ${formatRadius(DEFAULT_RADIUS)}</span>
            </div>
            <div id="mapPickerMap" class="map-picker-map"></div>
            <div class="map-picker-actions">
                <button class="btn btn-secondary" id="mapPickerCancel">Cancel</button>
                <button class="btn btn-primary" id="mapPickerSend">Send Location</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const mapEl = document.getElementById('mapPickerMap');
    const radiusLabel = document.getElementById('mapPickerRadius');

    const map = L.map(mapEl, {
        zoomControl: true,
        attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(map);

    let currentLat = 0;
    let currentLng = 0;
    let currentRadius = DEFAULT_RADIUS;
    let marker = null;
    let circle = null;

    function initMapAt(lat, lng) {
        currentLat = lat;
        currentLng = lng;
        map.setView([lat, lng], 15);

        circle = L.circle([lat, lng], {
            radius: currentRadius,
            color: '#3a7ca5',
            fillColor: '#3a7ca5',
            fillOpacity: 0.15,
            weight: 2
        }).addTo(map);

        marker = L.marker([lat, lng], { draggable: true }).addTo(map);

        marker.on('drag', function () {
            const pos = marker.getLatLng();
            currentLat = pos.lat;
            currentLng = pos.lng;
            circle.setLatLng(pos);
        });

        marker.on('dragend', function () {
            const pos = marker.getLatLng();
            currentLat = pos.lat;
            currentLng = pos.lng;
        });

        map.on('click', function (e) {
            const center = L.latLng(currentLat, currentLng);
            const dist = center.distanceTo(e.latlng);
            const clamped = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, dist));
            currentRadius = clamped;
            circle.setRadius(clamped);
            radiusLabel.textContent = 'Radius: ' + formatRadius(clamped);
        });
    }

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                initMapAt(pos.coords.latitude, pos.coords.longitude);
            },
            function () {
                showToast('Could not get GPS location — place the marker manually', 'error');
                initMapAt(0, 0);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        showToast('Geolocation not available', 'error');
        initMapAt(0, 0);
    }

    document.getElementById('mapPickerCancel').addEventListener('click', function () {
        overlay.remove();
    });

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
    });

    document.getElementById('mapPickerSend').addEventListener('click', function () {
        sendLocationMessage(currentLat, currentLng, currentRadius);
        overlay.remove();
    });

    setTimeout(function () { map.invalidateSize(); }, 100);
}

async function sendLocationMessage(lat, lng, radius) {
    if (!selectedGroup || !currentUser) return;
    const body = `📍location:${lat.toFixed(6)},${lng.toFixed(6)},${Math.round(radius)}`;

    const { data: msg, error } = await db.from('chat_messages').insert({
        group_id: selectedGroup.id,
        user_id: currentUser.id,
        body: body
    }).select().single();

    if (error) {
        showToast('Failed to send location: ' + error.message, 'error');
    } else if (msg) {
        appendChatMessage(msg);
    }
}

let _locationMapCounter = 0;

function renderLocationPreview(container, lat, lng, radius) {
    _locationMapCounter++;
    const mapId = 'locPreview_' + _locationMapCounter;

    container.innerHTML = `
        <div class="chat-location-preview" id="${mapId}"></div>
        <div class="chat-location-label">📍 Location (${formatRadius(radius)} radius)</div>
    `;

    requestAnimationFrame(function () {
        const el = document.getElementById(mapId);
        if (!el) return;

        const previewMap = L.map(el, {
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false,
            attributionControl: false
        }).setView([lat, lng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
        }).addTo(previewMap);

        L.circle([lat, lng], {
            radius: radius,
            color: '#3a7ca5',
            fillColor: '#3a7ca5',
            fillOpacity: 0.15,
            weight: 2
        }).addTo(previewMap);

        L.marker([lat, lng]).addTo(previewMap);

        // Fit the circle in view
        const circleBounds = L.latLng(lat, lng).toBounds(radius * 2.5);
        previewMap.fitBounds(circleBounds);

        setTimeout(function () { previewMap.invalidateSize(); }, 200);
    });
}
