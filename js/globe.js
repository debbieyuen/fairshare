// Globe screen: slowly auto-rotating earth with one pin per meeting-location
// cluster. Clicking a pin opens a carousel popup that cycles through every
// selfie in that cluster. Below the globe, a stats panel shows how many
// distinct places the user has met contacts, plus the love/trust stats.

const GLOBE_PIN_COLOR = '#ff3b30'; // classic red — pops on the blue-marble texture
const CLUSTER_RADIUS_KM = 15;      // points within this distance collapse to one pin

let _globe = null;
let _globeResizeHandler = null;
let _globeClusters = [];           // cached clusters for click handling
let _clusterPopup = null;          // { overlay, state } while a popup is open

async function openGlobeScreen() {
    if (!currentUser) return;

    const container = document.getElementById('globeViz');
    const emptyHint = document.getElementById('globeEmptyHint');
    if (!container) return;

    if (typeof Globe !== 'function') {
        let tries = 0;
        while (typeof Globe !== 'function' && tries < 40) {
            await new Promise(r => setTimeout(r, 50));
            tries++;
        }
        if (typeof Globe !== 'function') {
            container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--dark-gray);">Could not load globe library.</div>';
            return;
        }
    }

    const selfies = await loadGlobeSelfies();
    _globeClusters = buildClusters(selfies);

    if (_globe === null) {
        _globe = Globe()(container)
            .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
            .backgroundColor('rgba(0,0,0,0)')
            // Fatter, taller pins so they're easy to hit with a fingertip.
            // globe.gl renders points as cylinders; both the radius and the
            // altitude contribute to the pickable area, so we bump both.
            .pointAltitude(d => 0.02 + Math.min(0.08, Math.log2(d.count + 1) * 0.02))
            .pointColor(() => GLOBE_PIN_COLOR)
            .pointRadius(d => 0.55 + Math.min(1.4, Math.log2(d.count + 1) * 0.28))
            .pointLabel(d => clusterTooltipHtml(d))
            .onPointClick(cluster => {
                if (cluster) openClusterPopup(cluster);
            });

        const controls = _globe.controls();
        controls.autoRotateSpeed = 0.35;
        controls.enableDamping = true;

        // As soon as the user touches/grabs the globe, stop auto-rotation and
        // expand the globe to full-bleed so pins are easier to hit. OrbitControls
        // fires 'start' on pointer-down (drag, pinch, or tap).
        controls.addEventListener('start', () => {
            controls.autoRotate = false;
            expandGlobe();
        });

        _globeResizeHandler = () => sizeGlobeToContainer();
        window.addEventListener('resize', _globeResizeHandler);
    }

    // Each time the screen opens, reset to the compact, auto-rotating welcome
    // state. First interaction will stop rotation and expand.
    const wrap = document.querySelector('.globe-viz-wrap');
    if (wrap) wrap.classList.remove('expanded');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _globe.controls().autoRotate = !reduceMotion;

    _globe.pointsData(_globeClusters);

    requestAnimationFrame(() => {
        sizeGlobeToContainer();
        requestAnimationFrame(sizeGlobeToContainer);
    });

    if (emptyHint) {
        if (_globeClusters.length === 0) emptyHint.classList.remove('hidden');
        else emptyHint.classList.add('hidden');
    }

    renderGlobeStats(_globeClusters);
}

function sizeGlobeToContainer() {
    if (!_globe) return;
    const container = document.getElementById('globeViz');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
        _globe.width(w).height(h);
    }
}

function expandGlobe() {
    const wrap = document.querySelector('.globe-viz-wrap');
    if (!wrap || wrap.classList.contains('expanded')) return;
    wrap.classList.add('expanded');
    // Two-frame resize: the first frame lets the browser compute the new
    // layout; the second catches any settling (safe-area / dvh quirks).
    requestAnimationFrame(() => {
        sizeGlobeToContainer();
        requestAnimationFrame(sizeGlobeToContainer);
    });
}

// ---------- Data loading ----------

async function loadGlobeSelfies() {
    try {
        const { data: selfies, error } = await db
            .from('contact_selfies')
            .select('contact_id, captured_at, lat, lng, location_label, selfie_url')
            .eq('user_id', currentUser.id)
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .order('captured_at', { ascending: false });

        if (error) {
            console.error('[globe] Failed to load selfies:', error);
            return [];
        }
        if (!selfies || selfies.length === 0) return [];

        const contactIds = Array.from(new Set(selfies.map(s => s.contact_id).filter(Boolean)));
        const nameById = {};
        if (contactIds.length > 0) {
            const { data: profiles } = await db
                .from('profiles')
                .select('id, display_name')
                .in('id', contactIds);
            (profiles || []).forEach(p => { nameById[p.id] = p.display_name; });
        }

        return selfies
            .map(s => {
                const lat = Number(s.lat);
                const lng = Number(s.lng);
                if (!isFinite(lat) || !isFinite(lng)) return null;
                return {
                    lat,
                    lng,
                    contactId: s.contact_id,
                    contactName: nameById[s.contact_id] || 'Unknown',
                    date: s.captured_at,
                    locationLabel: s.location_label || '',
                    selfieUrl: s.selfie_url || ''
                };
            })
            .filter(Boolean);
    } catch (e) {
        console.error('[globe] loadGlobeSelfies error:', e);
        return [];
    }
}

// ---------- Clustering ----------

// Simple greedy clustering by great-circle distance. Each selfie joins the
// first existing cluster whose centroid is within CLUSTER_RADIUS_KM; otherwise
// seeds a new cluster. Cluster centroid is updated as a running mean.
function buildClusters(selfies) {
    const clusters = [];
    for (const s of selfies) {
        let joined = null;
        for (const c of clusters) {
            if (haversineKm(c.lat, c.lng, s.lat, s.lng) <= CLUSTER_RADIUS_KM) {
                joined = c;
                break;
            }
        }
        if (joined) {
            joined.selfies.push(s);
            const n = joined.selfies.length;
            joined.lat = ((joined.lat * (n - 1)) + s.lat) / n;
            joined.lng = ((joined.lng * (n - 1)) + s.lng) / n;
            if (!joined.locationLabel && s.locationLabel) joined.locationLabel = s.locationLabel;
        } else {
            clusters.push({
                lat: s.lat,
                lng: s.lng,
                selfies: [s],
                locationLabel: s.locationLabel || ''
            });
        }
    }
    // Attach derived fields that globe.gl's accessors can read.
    for (const c of clusters) {
        c.count = c.selfies.length;
        c.contactCount = new Set(c.selfies.map(s => s.contactId).filter(Boolean)).size;
    }
    return clusters;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------- Tooltips and stats ----------

function clusterTooltipHtml(cluster) {
    const title = cluster.locationLabel || 'Unknown location';
    const meetings = cluster.count === 1 ? '1 meeting' : `${cluster.count} meetings`;
    return `<div style="font-family:system-ui,sans-serif;padding:6px 10px;background:rgba(0,0,0,0.78);color:#fff;border-radius:6px;font-size:0.82rem;max-width:220px;">
        <div><strong>${escapeHtmlForLabel(title)}</strong></div>
        <div style="opacity:0.85;">${meetings} &middot; tap to view</div>
    </div>`;
}

async function renderGlobeStats(clusters) {
    const citiesEl = document.getElementById('globeCitiesLine');
    const listEl = document.getElementById('globeStatsList');
    if (!citiesEl || !listEl) return;

    const n = clusters.length;
    if (n === 0) {
        citiesEl.textContent = '';
    } else {
        const word = n === 1 ? 'city' : 'cities';
        citiesEl.textContent = `Contacts in ${n} ${word}.`;
    }

    // Reuse the same attestation counts + formatting as the heart dialog.
    try {
        const { data, error } = await db.rpc('get_my_attestation_counts');
        if (error) throw error;

        const love        = data.love_count            || 0;
        const trust       = data.trust_count           || 0;
        const respect     = data.respect_count         || 0;
        const help        = data.help_count            || 0;
        const pic         = data.profile_picture_count || 0;
        const sponsDirect = data.sponsored_direct      || 0;
        const sponsMore   = data.sponsored_indirect    || 0;

        const lines = [];
        if (sponsDirect > 0) {
            const personWord = sponsDirect === 1 ? 'person' : 'people';
            let line = `You have sponsored ${sponsDirect} ${personWord}`;
            if (sponsMore > 0) line += `, who have sponsored ${sponsMore} more`;
            lines.push(line + '.');
        }
        const picLine   = formatHeartStatLine(pic,     'people have validated your profile picture');
        const helpLine  = formatHeartStatLine(help,    'others will help you');
        const respLine  = formatHeartStatLine(respect, 'others respect you');
        const trustLine = formatHeartStatLine(trust,   'others trust you');
        const loveLine  = formatHeartStatLine(love,    'others love you');
        if (picLine)   lines.push(picLine);
        if (helpLine)  lines.push(helpLine);
        if (respLine)  lines.push(respLine);
        if (trustLine) lines.push(trustLine);
        if (loveLine)  lines.push(loveLine);

        listEl.innerHTML = lines.length
            ? lines.map(l => `<p>${esc(l)}</p>`).join('')
            : '<p style="opacity:0.7;">No attestations yet.</p>';
    } catch (e) {
        console.error('[globe] Failed to load attestation counts:', e);
        listEl.innerHTML = '<p style="opacity:0.7;">Could not load trust stats.</p>';
    }
}

// ---------- Cluster popup (carousel) ----------

function openClusterPopup(cluster) {
    if (!cluster || !cluster.selfies || cluster.selfies.length === 0) return;

    closeClusterPopup(); // belt and suspenders

    // Pause auto-rotation so the globe isn't moving behind the popup.
    let restoreAutoRotate = false;
    if (_globe) {
        const controls = _globe.controls();
        if (controls.autoRotate) {
            restoreAutoRotate = true;
            controls.autoRotate = false;
        }
    }

    const state = { index: 0, selfies: cluster.selfies, cluster, restoreAutoRotate };

    const overlay = document.createElement('div');
    overlay.className = 'globe-cluster-overlay';
    overlay.innerHTML = `
        <div class="globe-cluster-modal" role="dialog" aria-modal="true">
            <button class="globe-cluster-close" aria-label="Close">✕</button>
            <div class="globe-cluster-header">
                <div class="globe-cluster-title" id="globeClusterTitle"></div>
                <div class="globe-cluster-subtitle" id="globeClusterSubtitle"></div>
            </div>
            <div class="globe-cluster-carousel">
                <img class="globe-cluster-img" id="globeClusterImg" alt="">
            </div>
            <div class="globe-cluster-caption">
                <button class="globe-cluster-nav globe-cluster-prev" aria-label="Previous">‹</button>
                <div class="globe-cluster-caption-info">
                    <div class="globe-cluster-caption-name" id="globeClusterName"></div>
                    <div class="globe-cluster-caption-date" id="globeClusterDate"></div>
                </div>
                <div class="globe-cluster-counter" id="globeClusterCounter"></div>
                <button class="globe-cluster-nav globe-cluster-next" aria-label="Next">›</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    _clusterPopup = { overlay, state };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeClusterPopup();
    });
    overlay.querySelector('.globe-cluster-close').addEventListener('click', closeClusterPopup);
    overlay.querySelector('.globe-cluster-prev').addEventListener('click', () => stepClusterPopup(-1));
    overlay.querySelector('.globe-cluster-next').addEventListener('click', () => stepClusterPopup(+1));

    document.addEventListener('keydown', clusterKeyHandler);

    renderClusterPopupFrame();
}

function stepClusterPopup(delta) {
    if (!_clusterPopup) return;
    const { state } = _clusterPopup;
    const n = state.selfies.length;
    state.index = (state.index + delta + n) % n;
    renderClusterPopupFrame();
}

function renderClusterPopupFrame() {
    if (!_clusterPopup) return;
    const { overlay, state } = _clusterPopup;
    const s = state.selfies[state.index];
    const n = state.selfies.length;

    const title = state.cluster.locationLabel || 'Unknown location';
    const contactCount = state.cluster.contactCount || new Set(state.selfies.map(x => x.contactId).filter(Boolean)).size;
    const contactWord = contactCount === 1 ? 'contact' : 'contacts';
    const meetingWord = n === 1 ? 'meeting' : 'meetings';

    overlay.querySelector('#globeClusterTitle').textContent = title;
    overlay.querySelector('#globeClusterSubtitle').textContent = `${n} ${meetingWord} with ${contactCount} ${contactWord}`;

    const img = overlay.querySelector('#globeClusterImg');
    img.src = s.selfieUrl || '';
    img.alt = s.contactName ? `Selfie with ${s.contactName}` : 'Selfie';

    overlay.querySelector('#globeClusterName').textContent = s.contactName || 'Unknown';
    overlay.querySelector('#globeClusterDate').textContent = formatClusterDate(s.date);
    overlay.querySelector('#globeClusterCounter').textContent = `${state.index + 1} of ${n}`;

    const prev = overlay.querySelector('.globe-cluster-prev');
    const next = overlay.querySelector('.globe-cluster-next');
    const single = n <= 1;
    prev.disabled = single;
    next.disabled = single;
    prev.style.display = single ? 'none' : '';
    next.style.display = single ? 'none' : '';
}

function closeClusterPopup() {
    if (!_clusterPopup) return;
    const { overlay, state } = _clusterPopup;
    if (state.restoreAutoRotate && _globe) {
        _globe.controls().autoRotate = true;
    }
    document.removeEventListener('keydown', clusterKeyHandler);
    overlay.remove();
    _clusterPopup = null;
}

function clusterKeyHandler(e) {
    if (!_clusterPopup) return;
    if (e.key === 'Escape') closeClusterPopup();
    else if (e.key === 'ArrowLeft') stepClusterPopup(-1);
    else if (e.key === 'ArrowRight') stepClusterPopup(+1);
}

function formatClusterDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
        return '';
    }
}

function escapeHtmlForLabel(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
