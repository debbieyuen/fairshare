let contactsSearchQuery = '';
let contactsLoadedRows = [];

function getContactsSearchInput() {
    return document.getElementById('contactsSearchInput');
}

function getContactsSearchClearBtn() {
    return document.getElementById('contactsSearchClearBtn');
}

function updateContactsSearchClearVisibility() {
    const clearBtn = getContactsSearchClearBtn();
    if (!clearBtn) return;
    clearBtn.classList.toggle('hidden', !contactsSearchQuery);
}

function normalizeContactsSearchQuery(query) {
    return (query || '').trim().toLowerCase();
}

function setContactsSearchQuery(query, options = {}) {
    const { syncInput = true } = options;
    contactsSearchQuery = normalizeContactsSearchQuery(query);
    if (syncInput) {
        const input = getContactsSearchInput();
        if (input) input.value = query || '';
    }
    updateContactsSearchClearVisibility();
}

function clearContactSearchState() {
    setContactsSearchQuery('');
}

function bindContactsSearchInput() {
    const input = getContactsSearchInput();
    const clearBtn = getContactsSearchClearBtn();
    if (!input || input.dataset.bound === '1') return;
    input.addEventListener('input', () => {
        setContactsSearchQuery(input.value, { syncInput: false });
        renderContactsForCurrentQuery();
    });
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            setContactsSearchQuery('');
            renderContactsForCurrentQuery();
            input.focus();
        });
    }
    updateContactsSearchClearVisibility();
    input.dataset.bound = '1';
}

function getNoContactsHtml() {
    return '<p style="color:var(--dark-gray);text-align:center;padding:2rem;">No contacts yet. Use the handshake icon to add someone.</p>';
}

function getNoMatchingContactsHtml() {
    return '<p style="color:var(--dark-gray);text-align:center;padding:2rem;">No matching contacts.</p>';
}

async function openContactListScreen() {
    if (!currentUser) return;
    navigateTo('contacts');
}

function getContactRow(contactId) {
    if (!contactId) return null;
    return Array.from(document.querySelectorAll('.contact-row')).find((el) => el.dataset.contactId === contactId) || null;
}

function expandContactRow(contactId) {
    const content = document.getElementById('contactsListContent');
    const row = getContactRow(contactId);
    if (!content || !row) return false;
    content.querySelectorAll('.contact-row.expanded').forEach((expandedRow) => {
        if (expandedRow !== row) expandedRow.classList.remove('expanded');
    });
    row.classList.add('expanded');
    loadSharedTrust(contactId);
    loadFamilyTree(contactId);
    reloadContactSelfiesStrip(contactId);
    return true;
}

function updateContactSelfieInList(contactId, selfieUrl) {
    // Legacy helper kept for compatibility; now delegates to strip reload
    delete contactSelfiesCache[contactId];
    reloadContactSelfiesStrip(contactId);
    return true;
}

async function loadContactSelfies(contactId) {
    if (contactSelfiesCache[contactId]) return contactSelfiesCache[contactId];
    try {
        const { data, error } = await db
            .from('contact_selfies')
            .select('id, selfie_url, captured_at, location_label')
            .eq('contact_id', contactId)
            .order('captured_at', { ascending: false });
        if (error) throw error;
        contactSelfiesCache[contactId] = data || [];
    } catch (e) {
        console.error('loadContactSelfies error:', e);
        contactSelfiesCache[contactId] = [];
    }
    return contactSelfiesCache[contactId];
}

function formatSelfieDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildSelfiesStripHtml(selfies, contactId) {
    const addTileHtml = `
        <div class="selfie-tile selfie-tile-add" onclick="event.stopPropagation();openContactSelfie('${contactId}')" title="Add a selfie">
            <div class="selfie-tile-add-icon">📷</div>
        </div>`;
    if (!selfies || selfies.length === 0) {
        return `<div class="selfies-strip">${addTileHtml}</div>`;
    }
    const tilesHtml = selfies.map(s => {
        const dateStr = formatSelfieDate(s.captured_at);
        const locStr = s.location_label || '';
        const caption = [dateStr, locStr].filter(Boolean).join('\n');
        return `
            <div class="selfie-tile"
                 data-lightbox-url="${esc(s.selfie_url)}"
                 ${dateStr ? `data-lightbox-date="${esc(dateStr)}"` : ''}
                 ${locStr ? `data-lightbox-location="${esc(locStr)}"` : ''}>
                <img src="${esc(s.selfie_url)}" alt="Selfie" loading="lazy">
                ${caption ? `<div class="selfie-caption">${esc(dateStr)}${locStr ? `<br><span class="selfie-caption-location">${esc(locStr)}</span>` : ''}</div>` : ''}
            </div>`;
    }).join('');
    return `<div class="selfies-strip">${tilesHtml}${addTileHtml}</div>`;
}

function ensureLightbox() {
    if (document.getElementById('img-lightbox')) return;
    const el = document.createElement('div');
    el.id = 'img-lightbox';
    el.className = 'img-lightbox';
    el.innerHTML = `
        <button class="img-lightbox-close" aria-label="Close">✕</button>
        <img class="img-lightbox-img" id="img-lightbox-img" alt="">
        <div class="img-lightbox-caption" id="img-lightbox-caption"></div>`;
    el.addEventListener('click', (e) => {
        if (!e.target.closest('.img-lightbox-img') && !e.target.closest('.img-lightbox-caption')) {
            closeLightbox();
        }
    });
    el.querySelector('.img-lightbox-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
    document.body.appendChild(el);
}

function openLightbox(url, dateStr, locationStr) {
    ensureLightbox();
    document.getElementById('img-lightbox-img').src = url;
    const cap = document.getElementById('img-lightbox-caption');
    const parts = [dateStr, locationStr].filter(Boolean);
    cap.innerHTML = parts.map(p => `<span>${esc(p)}</span>`).join('<br>');
    cap.style.display = parts.length ? '' : 'none';
    document.getElementById('img-lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (lb) lb.classList.remove('active');
    document.body.style.overflow = '';
}

async function reloadContactSelfiesStrip(contactId) {
    const container = document.getElementById('selfies-strip-' + contactId);
    if (!container) return;
    const selfies = await loadContactSelfies(contactId);
    container.innerHTML = buildSelfiesStripHtml(selfies, contactId);
}

function matchesContactSearch(row) {
    if (!contactsSearchQuery) return true;
    const name = (row.profile?.display_name || '').toLowerCase();
    const profileEmail = (row.profile?.email || '').toLowerCase();
    const profilePhone = (row.profile?.phone || '').toLowerCase();
    const sharedEmail = (row.shared?.shared_email || '').toLowerCase();
    const sharedPhone = (row.shared?.shared_phone || '').toLowerCase();
    return (
        name.includes(contactsSearchQuery)
        || profileEmail.includes(contactsSearchQuery)
        || profilePhone.includes(contactsSearchQuery)
        || sharedEmail.includes(contactsSearchQuery)
        || sharedPhone.includes(contactsSearchQuery)
    );
}

function bindContactRowEvents(content) {
    content.querySelectorAll('.contact-row').forEach((row) => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.contact-detail-actions') || e.target.closest('.selfies-strip-container') || e.target.closest('.contact-detail-profile-media') || e.target.closest('.contact-detail-met-on') || e.target.closest('input') || e.target.closest('button')) return;
            const wasExpanded = row.classList.contains('expanded');
            if (wasExpanded) {
                row.classList.remove('expanded');
                return;
            }

            content.querySelectorAll('.contact-row.expanded').forEach((expandedRow) => {
                expandedRow.classList.remove('expanded');
            });
            row.classList.add('expanded');
            const cid = row.dataset.contactId;
            if (cid) {
                loadSharedTrust(cid);
                loadFamilyTree(cid);
                reloadContactSelfiesStrip(cid);
            }
        });
    });
}

function bindContactActionEvents(content) {
    if (content.dataset.contactActionBound) return;
    content.addEventListener('click', (e) => {
        const selfieTile = e.target.closest('.selfie-tile[data-lightbox-url]');
        if (selfieTile) {
            e.stopPropagation();
            openLightbox(
                selfieTile.dataset.lightboxUrl,
                selfieTile.dataset.lightboxDate || '',
                selfieTile.dataset.lightboxLocation || ''
            );
            return;
        }
        const shareBtn = e.target.closest('.btn-share-with-contact');
        if (shareBtn) {
            e.stopPropagation();
            openShareWithContact(shareBtn.dataset.contactId || '', shareBtn.dataset.contactName || 'contact');
            return;
        }
        const vouchBtn = e.target.closest('.btn-vouch-with-contact');
        if (vouchBtn) {
            e.stopPropagation();
            openVouchWithContact(vouchBtn.dataset.contactId || '', vouchBtn.dataset.contactName || 'contact');
        }
    });
    content.dataset.contactActionBound = '1';
}

function renderContactRows(rows) {
    const content = document.getElementById('contactsListContent');
    if (!content) return;
    content.innerHTML = rows.map(({ contact, profile, shared }) => (
        renderContactRow(contact, profile, shared)
    )).join('');
    bindContactRowEvents(content);
    bindContactActionEvents(content);
}

function renderContactsForCurrentQuery() {
    const content = document.getElementById('contactsListContent');
    if (!content) return;

    if (!contactsLoadedRows.length) {
        content.innerHTML = getNoContactsHtml();
        return;
    }

    const filteredRows = contactsLoadedRows.filter(matchesContactSearch);
    if (!filteredRows.length) {
        content.innerHTML = getNoMatchingContactsHtml();
        return;
    }

    renderContactRows(filteredRows);
}

async function openContactDetailsById(contactId) {
    if (!contactId || !currentUser) return false;
    const content = document.getElementById('contactsListContent');
    if (!content) return false;

    navigateTo('contacts');
    clearContactSearchState();

    if (!getContactRow(contactId)) {
        await loadAndRenderContactList();
    }

    if (expandContactRow(contactId)) {
        return true;
    }

    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        await loadAndRenderContactList();
        if (expandContactRow(contactId)) return true;
    }
    return false;
}

async function openNewestContactDetails() {
    if (!currentUser) return false;
    navigateTo('contacts');
    clearContactSearchState();
    await loadAndRenderContactList();
    const firstRow = document.querySelector('.contact-row');
    const contactId = firstRow?.dataset?.contactId || '';
    if (!contactId) return false;
    return expandContactRow(contactId);
}

async function openPendingContactDetailsIfAny() {
    if (pendingOpenContactId) {
        const cid = pendingOpenContactId;
        pendingOpenContactId = null;
        await openContactDetailsById(cid);
        return;
    }
    if (pendingOpenNewestContact) {
        pendingOpenNewestContact = false;
        await openNewestContactDetails();
    }
}

function closeContactListScreen() {
    clearContactSearchState();
}

async function loadAndRenderContactList() {
    const content = document.getElementById('contactsListContent');
    try {
        const { data: contacts, error } = await db
            .from('contacts')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('met_at', { ascending: false });

        if (error) throw error;

        if (!contacts || contacts.length === 0) {
            contactsLoadedRows = [];
            content.innerHTML = getNoContactsHtml();
            return;
        }

        const contactIds = [...new Set(contacts.map(c => c.contact_id))];
        let profileMap = {};
        if (contactIds.length > 0) {
            const { data: profiles } = await db.from('profiles').select('id, display_name, profile_image_url, phone, email').in('id', contactIds);
            if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
        }

        let sharedByThemMap = {};
        try {
            const { data: sharedRows } = await db.from('contact_shared').select('user_id, shared_phone, shared_email').eq('contact_id', currentUser.id).in('user_id', contactIds);
            if (sharedRows) sharedRows.forEach(r => { sharedByThemMap[r.user_id] = r; });
        } catch (_) { /* contact_shared table may not exist yet */ }

        contactsLoadedRows = contacts.map((contact) => ({
            contact,
            profile: profileMap[contact.contact_id] || {},
            shared: sharedByThemMap[contact.contact_id] || {}
        }));
        renderContactsForCurrentQuery();
    } catch (e) {
        console.error('Load contacts error:', e);
        contactsLoadedRows = [];
        content.innerHTML = '<p style="color:var(--red);text-align:center;padding:2rem;">Failed to load contacts.</p>';
    }
}

function formatLastSeen(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return diffMin + 'm ago';
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return diffHrs + 'h ago';
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return diffDays + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatFirstMetDisplay(isoStr) {
    if (!isoStr) return 'tap to set';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function openMetOnPicker(cid) {
    const inp = document.getElementById('met-on-' + cid);
    if (!inp) return;
    try {
        if (inp.showPicker) inp.showPicker();
    } catch (e) {
        console.warn('showPicker failed:', e);
    }
}

function formatKnownDuration(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years * 12 + months < 1) return '';
    const parts = [];
    if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`);
    if (months > 0) parts.push(months === 1 ? '1 month' : `${months} months`);
    return parts.join(', ');
}

async function saveFirstMetAt(contactId, dateValue) {
    if (!currentUser) return;
    const isoDate = dateValue ? new Date(dateValue + 'T12:00:00').toISOString() : null;
    try {
        const { error } = await db
            .from('contacts')
            .update({ first_met_at: isoDate })
            .eq('user_id', currentUser.id)
            .eq('contact_id', contactId);
        if (error) throw error;
        const row = contactsLoadedRows.find(r => r.contact.contact_id === contactId);
        if (row) {
            row.contact.first_met_at = isoDate;
            const rowEl = document.querySelector(`.contact-row[data-contact-id="${contactId}"]`);
            if (rowEl) {
                const durationEl = rowEl.querySelector('.contact-row-known-duration');
                const newDuration = formatKnownDuration(isoDate || row.contact.created_at);
                if (durationEl) {
                    durationEl.textContent = newDuration;
                    durationEl.style.display = newDuration ? '' : 'none';
                }
                const displayEl = rowEl.querySelector(`#met-on-display-${contactId}`);
                if (displayEl) displayEl.textContent = formatFirstMetDisplay(isoDate);
            }
        }
        // Notify the contact that this user recorded a met date
        if (isoDate) {
            db.rpc('notify_contact_of_met_date', {
                p_actor_id: currentUser.id,
                p_contact_id: contactId,
                p_met_date: isoDate
            }).then(({ error: rpcErr }) => { if (rpcErr) console.warn('notify met date error:', rpcErr); });
        }
    } catch (e) {
        console.error('Failed to save first met date:', e);
    }
}

function renderContactRow(contact, profile, shared) {
    const name = profile.display_name || 'Unknown';
    const avatarUrl = profile.profile_image_url || null;
    const phone = (shared.shared_phone != null && shared.shared_phone !== '') ? shared.shared_phone : '';
    const email = (shared.shared_email != null && shared.shared_email !== '') ? shared.shared_email : '';
    const hasSharedPhone = !!phone;
    const hasSharedEmail = !!email;
    const cid = esc(contact.contact_id);
    const lastSeen = formatLastSeen(contact.met_at);
    const knownSinceDateStr = contact.first_met_at || contact.created_at || null;
    const knownDuration = formatKnownDuration(knownSinceDateStr);
    const firstMetValue = knownSinceDateStr ? new Date(knownSinceDateStr).toISOString().slice(0, 10) : '';
    const firstMetDisplayValue = formatFirstMetDisplay(knownSinceDateStr);
    const avatarHtml = avatarUrl
        ? `<img class="contact-row-avatar" src="${esc(avatarUrl)}" alt="">`
        : '<div class="contact-row-avatar-placeholder">👤</div>';
    const largeAvatarHtml = avatarUrl
        ? `<img class="contact-detail-profile-photo" src="${esc(avatarUrl)}" alt="${esc(name)} profile"
               style="cursor:pointer"
               onclick="event.stopPropagation(); openLightbox('${esc(avatarUrl)}')">`
        : '<div class="contact-detail-profile-placeholder">👤</div>';
    const sharedIconHtml = (hasSharedPhone || hasSharedEmail)
        ? `<span class="contact-row-shared-icons" aria-label="Contact details shared with you">
                ${hasSharedPhone ? '<span class="contact-row-shared-icon" title="Phone shared">📞</span>' : ''}
                ${hasSharedEmail ? '<span class="contact-row-shared-icon contact-row-shared-icon-email" title="Email shared">✉</span>' : ''}
            </span>`
        : '';
    return `
        <div class="contact-row" data-contact-id="${cid}">
            <div class="contact-row-header">
                ${avatarHtml}
                <span class="contact-row-name">
                    <span class="contact-row-name-top">
                        <span class="contact-row-name-text">${esc(name)}</span>
                        ${sharedIconHtml}
                    </span>
                    <span class="contact-row-known-duration"${!knownDuration ? ' style="display:none"' : ''}>${knownDuration}</span>
                </span>
                ${lastSeen ? `<span class="contact-row-lastseen">${lastSeen}</span>` : ''}
                <span class="contact-row-chevron">›</span>
            </div>
            <div class="contact-detail">
                <div class="contact-detail-top-row">
                    <div class="contact-detail-profile-media">${largeAvatarHtml}</div>
                    <div class="contact-detail-top-actions">
                        <button type="button" class="btn btn-small btn-vouch-with-contact" data-contact-id="${cid}" data-contact-name="${esc(name)}">Vouch</button>
                        <button type="button" class="btn btn-primary btn-small btn-share-with-contact" data-contact-id="${cid}" data-contact-name="${esc(name)}">Share</button>
                    </div>
                </div>
                <div class="contact-detail-met-on" onclick="event.stopPropagation(); openMetOnPicker('${cid}')">
                    <span class="contact-detail-met-on-label">We met on</span>
                    <span class="contact-detail-met-on-value">
                        <span class="contact-detail-met-on-display" id="met-on-display-${cid}">${firstMetDisplayValue}</span>
                        <input type="date" class="contact-detail-met-on-input" id="met-on-${cid}"
                            value="${firstMetValue}"
                            onchange="event.stopPropagation(); saveFirstMetAt('${cid}', this.value)">
                    </span>
                </div>
                <div class="contact-detail-selfies-section">
                    <div class="contact-shared-title">Selfies Together</div>
                    <div id="selfies-strip-${cid}" class="selfies-strip-container">
                        <div class="selfies-strip">
                            <div class="selfie-tile selfie-tile-add" onclick="event.stopPropagation();openContactSelfie('${cid}')" title="Add a selfie">
                                <div class="selfie-tile-add-icon">📷</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="contact-shared-trust" id="shared-${cid}">
                    <div class="contact-shared-title">Trust</div>
                    <div class="contact-detail-line contact-detail-muted">Loading shared trust…</div>
                </div>
                <div class="contact-shared-details">
                    <div class="contact-shared-title">Shared with you</div>
                    ${phone ? `<div class="contact-detail-line">📞 <a href="tel:${esc(phone)}">${esc(phone)}</a></div>` : ''}
                    ${email ? `<div class="contact-detail-line">✉ <a href="mailto:${esc(email)}">${esc(email)}</a></div>` : ''}
                    ${!phone && !email ? '<div class="contact-detail-line contact-detail-muted">No phone or email shared with you yet.</div>' : ''}
                </div>
                <div class="family-tree" id="ft-${cid}">
                    <div class="family-tree-title">Family Tree</div>
                    <div class="family-tree-loading">Loading…</div>
                </div>
            </div>
        </div>`;
}

const sharedTrustCache = {};
function renderSharedTrust(container, trustData) {
    const contactsCount = trustData?.contactsCount == null
        ? 'Unavailable'
        : (Number.isFinite(Number(trustData.contactsCount)) ? Number(trustData.contactsCount) : 0);
    const attestersCount = trustData?.attestersCount == null
        ? 'Unavailable'
        : (Number.isFinite(Number(trustData.attestersCount)) ? Number(trustData.attestersCount) : 0);
    const profileMatchesCount = trustData?.profileMatchesCount == null
        ? 'Unavailable'
        : (Number.isFinite(Number(trustData.profileMatchesCount)) ? Number(trustData.profileMatchesCount) : 0);
    const groupNames = Array.isArray(trustData?.groups) ? trustData.groups.filter(Boolean) : null;
    const contactsText = contactsCount === 'Unavailable'
        ? 'Shared contacts unavailable'
        : (Number(contactsCount) > 0
            ? `<span class="contact-shared-key">${Number(contactsCount)}</span> Shared Contacts`
            : 'No Shared Contacts');
    const groupsText = groupNames == null
        ? 'Shared groups unavailable'
        : (groupNames.length > 0
            ? `Shared groups: <span class="contact-shared-key">${groupNames.map(name => esc(name)).join(', ')}</span>`
            : 'No Shared Groups');
    const attestersText = attestersCount === 'Unavailable'
        ? 'Mutual attestations unavailable'
        : (Number(attestersCount) > 0
            ? `<span class="contact-shared-key">${Number(attestersCount)}</span> Mutual Attestations`
            : 'No Mutual Attestations');
    const profileMatchesText = profileMatchesCount === 'Unavailable'
        ? 'Matches Profile unavailable'
        : (Number(profileMatchesCount) > 0
            ? `<span class="contact-shared-key">${Number(profileMatchesCount)}</span> profile picture confirmations`
            : 'No profile picture confirmations');
    container.innerHTML = `
        <div class="contact-shared-title">Trust</div>
        <div class="contact-detail-line">${contactsText}</div>
        <div class="contact-detail-line">${groupsText}</div>
        <div class="contact-detail-line">${attestersText}</div>
        <div class="contact-detail-line">${profileMatchesText}</div>
    `;
}

async function loadSharedTrust(contactId) {
    const container = document.getElementById('shared-' + contactId);
    if (!container || !currentUser) return;

    if (container.dataset.loaded === '1') return;

    if (sharedTrustCache[contactId]) {
        container.dataset.loaded = '1';
        renderSharedTrust(container, sharedTrustCache[contactId]);
        return;
    }

    try {
        const [sharedContactsRes, sharedGroupsRes, sharedAttestersRes, profileMatchesRes] = await Promise.all([
            db.rpc('get_shared_contacts_count', { p_contact_id: contactId }),
            db.rpc('get_shared_groups', { p_contact_id: contactId }),
            db.rpc('get_shared_attesters_count', { p_contact_id: contactId }),
            db.rpc('get_profile_picture_attesters_count', { p_contact_id: contactId })
        ]);

        if (sharedContactsRes.error) console.error('Shared trust contacts RPC error:', sharedContactsRes.error);
        if (sharedGroupsRes.error) console.error('Shared trust groups RPC error:', sharedGroupsRes.error);
        if (sharedAttestersRes.error) console.error('Shared trust attesters RPC error:', sharedAttestersRes.error);
        if (profileMatchesRes.error) console.error('Shared trust profile match RPC error:', profileMatchesRes.error);

        const trustData = {
            contactsCount: sharedContactsRes.error
                ? null
                : (Number.isFinite(Number(sharedContactsRes.data)) ? Number(sharedContactsRes.data) : 0),
            groups: sharedGroupsRes.error
                ? null
                : (Array.isArray(sharedGroupsRes.data) ? sharedGroupsRes.data.map(row => row.name).filter(Boolean) : []),
            attestersCount: sharedAttestersRes.error
                ? null
                : (Number.isFinite(Number(sharedAttestersRes.data)) ? Number(sharedAttestersRes.data) : 0),
            profileMatchesCount: profileMatchesRes.error
                ? null
                : (Number.isFinite(Number(profileMatchesRes.data)) ? Number(profileMatchesRes.data) : 0)
        };

        const allFailed = trustData.contactsCount == null
            && trustData.groups == null
            && trustData.attestersCount == null
            && trustData.profileMatchesCount == null;
        container.dataset.loaded = '1';
        if (allFailed) {
            container.innerHTML = `
                <div class="contact-shared-title">Trust</div>
                <div class="contact-detail-line contact-detail-muted">Could not load shared trust yet.</div>
            `;
            return;
        }

        sharedTrustCache[contactId] = trustData;
        renderSharedTrust(container, trustData);
    } catch (e) {
        console.error('Shared trust error:', e);
        container.dataset.loaded = '1';
        container.innerHTML = `
            <div class="contact-shared-title">Trust</div>
            <div class="contact-detail-line contact-detail-muted">Could not load shared trust yet.</div>
        `;
    }
}

// Family tree: loads ancestor chains for both users and renders the shared tree
const familyTreeCache = {};
async function loadFamilyTree(contactId) {
    const container = document.getElementById('ft-' + contactId);
    if (!container || !currentUser) return;

    // Don't reload if already rendered
    if (container.dataset.loaded === '1') return;

    try {
        const [myChainRes, theirChainRes] = await Promise.all([
            familyTreeCache[currentUser.id]
                ? Promise.resolve({ data: familyTreeCache[currentUser.id], error: null })
                : db.rpc('get_ancestor_chain', { p_user_id: currentUser.id }),
            db.rpc('get_ancestor_chain', { p_user_id: contactId })
        ]);

        const myChain = myChainRes.data || [];
        const theirChain = theirChainRes.data || [];

        if (myChain.length > 0) familyTreeCache[currentUser.id] = myChain;

        container.dataset.loaded = '1';
        renderFamilyTree(container, myChain, theirChain, contactId);
    } catch (e) {
        console.error('Family tree error:', e);
        container.innerHTML = '<div class="family-tree-title">Family Tree</div><div class="family-tree-loading">Could not load tree.</div>';
    }
}

function renderFamilyTree(container, myChain, theirChain, contactId) {
    const normalizeAncestorChain = (chain) => {
        const out = [];
        const seen = new Set();
        for (const node of (chain || [])) {
            if (!node || !node.id) continue;
            // Stop at first cycle so repeating sponsor loops do not render forever.
            if (seen.has(node.id)) break;
            seen.add(node.id);
            out.push(node);
        }
        return out;
    };

    const safeMyChain = normalizeAncestorChain(myChain);
    const safeTheirChain = normalizeAncestorChain(theirChain);
    const theirIdSet = new Set(safeTheirChain.map(n => n.id));
    let lcaIndex = -1;
    for (let i = 0; i < safeMyChain.length; i++) {
        if (theirIdSet.has(safeMyChain[i].id)) {
            lcaIndex = i;
            break;
        }
    }

    if (lcaIndex < 0) {
        container.innerHTML = '<div class="family-tree-title">Family Tree</div><div class="family-tree-loading" style="font-style:italic;">No shared sponsors found.</div>';
        return;
    }

    const lcaId = safeMyChain[lcaIndex].id;
    const theirLcaIndex = safeTheirChain.findIndex(n => n.id === lcaId);
    if (theirLcaIndex < 0) {
        container.innerHTML = '<div class="family-tree-title">Family Tree</div><div class="family-tree-loading" style="font-style:italic;">No shared sponsors found.</div>';
        return;
    }

    // Build root -> ... -> LCA vertical chain
    const sharedTopPath = safeMyChain.slice(lcaIndex).reverse();
    // Build LCA child -> ... -> leaves (you/contact)
    const myDescPath = safeMyChain.slice(0, lcaIndex).reverse();
    const theirDescPath = safeTheirChain.slice(0, theirLcaIndex).reverse();

    const nodeHtml = (node, cls = '') => {
        const name = esc(node.display_name || 'Unknown');
        return `<div class="ft-node ${cls}" title="${name}">${name}</div>`;
    };

    const connectorHtml = '<div class="ft-connector"></div>';
    const buildPathHtml = (pathNodes, leafClass) => {
        if (!pathNodes.length) return '';
        let html = '';
        for (let i = 0; i < pathNodes.length; i++) {
            if (i > 0) html += connectorHtml;
            const cls = i === pathNodes.length - 1 ? leafClass : '';
            html += nodeHtml(pathNodes[i], cls);
        }
        return html;
    };

    let sharedHtml = '';
    for (let i = 0; i < sharedTopPath.length; i++) {
        if (i > 0) sharedHtml += connectorHtml;
        const cls = i === sharedTopPath.length - 1 ? 'ft-lca' : '';
        sharedHtml += nodeHtml(sharedTopPath[i], cls);
    }

    const leftBranch = buildPathHtml(myDescPath, 'ft-you');
    const rightBranch = buildPathHtml(theirDescPath, 'ft-them');
    const hasLeft = myDescPath.length > 0;
    const hasRight = theirDescPath.length > 0;
    const branchStem = (hasLeft || hasRight)
        ? `${connectorHtml}<div class="ft-split-bar"><div></div><div></div></div>`
        : '';

    // Special-case root->descendant: only show right branch below root chain.
    let branchHtml = '';
    if (hasLeft || hasRight) {
        if (!hasLeft && hasRight) {
            branchHtml = `<div class="ft-branches ft-single-right">
                <div class="ft-branch ft-branch-empty"></div>
                <div class="ft-branch">${rightBranch}</div>
            </div>`;
        } else if (hasLeft && !hasRight) {
            branchHtml = `<div class="ft-branches ft-single-left">
                <div class="ft-branch">${leftBranch}</div>
                <div class="ft-branch ft-branch-empty"></div>
            </div>`;
        } else {
            branchHtml = `<div class="ft-branches">
                <div class="ft-branch">${leftBranch}</div>
                <div class="ft-branch">${rightBranch}</div>
            </div>`;
        }
    }

    const treeHtml = `<div class="family-tree-title">Family Tree</div>
        <div class="family-tree-diagram">
            <div class="ft-branch">${sharedHtml}</div>
            ${branchStem}
            ${branchHtml}
        </div>`;

    container.innerHTML = treeHtml;
}

function openContactSelfie(contactId) {
    contactSelfieId = contactId;
    showModal('contactSelfie');
}

function closeContactSelfieModal(options = {}) {
    const { refreshContacts = true } = options;
    stopContactSelfieStream();
    contactSelfieId = null;
    closeModal({ refreshContactList: refreshContacts });
}

async function openNewContactSelfieOverlay(contactId, contactName) {
    newContactSelfieId = contactId;
    newContactSelfieContactName = contactName || 'your new contact';
    const overlay = document.getElementById('newContactSelfieOverlay');
    const banner = document.getElementById('newContactSelfieBanner');
    const video = document.getElementById('newContactSelfieVideo');
    if (!overlay || !video) return;
    if (banner) banner.textContent = `Take a selfie with ${newContactSelfieContactName}!`;
    overlay.classList.remove('hidden');
    try {
        newContactSelfieStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = newContactSelfieStream;
        await video.play();
    } catch (e) {
        console.error('New-contact selfie camera error:', e);
        showToast('Camera unavailable: ' + (e.message || 'error'), 'error');
        closeNewContactSelfieOverlay({ navigate: true });
    }
}

function closeNewContactSelfieOverlay(options = {}) {
    const { navigate = false } = options;
    const overlay = document.getElementById('newContactSelfieOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (newContactSelfieStream) {
        newContactSelfieStream.getTracks().forEach(t => t.stop());
        newContactSelfieStream = null;
    }
    const video = document.getElementById('newContactSelfieVideo');
    if (video) video.srcObject = null;
    const cid = newContactSelfieId;
    newContactSelfieId = null;
    newContactSelfieContactName = '';
    if (navigate && cid) {
        openContactDetailsById(cid);
    } else if (navigate) {
        openNewestContactDetails();
    }
}

async function startContactSelfieStream() {
    stopContactSelfieStream();
    const video = document.getElementById('contactSelfieVideo');
    if (!video) return;
    try {
        contactSelfieStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
        });
        video.srcObject = contactSelfieStream;
        await video.play();
    } catch (e) {
        console.error('Contact selfie camera error:', e);
        showToast('Camera unavailable: ' + (e.message || 'error'), 'error');
        closeContactSelfieModal();
    }
}

function stopContactSelfieStream() {
    if (contactSelfieStream) {
        contactSelfieStream.getTracks().forEach(t => t.stop());
        contactSelfieStream = null;
    }
    const video = document.getElementById('contactSelfieVideo');
    if (video) video.srcObject = null;
}

async function captureContactSelfie() {
    const cid = contactSelfieId || newContactSelfieId;
    if (!cid || !currentUser) return;
    const video = document.getElementById('contactSelfieVideo') || document.getElementById('newContactSelfieVideo');
    if (!video || video.readyState < 2) {
        showToast('Camera not ready — please wait a moment and try again.', 'error');
        return;
    }
    const btn = document.getElementById('contactSelfieCaptureBtn') || document.getElementById('newContactSelfieCaptureBtn');
    if (btn) btn.disabled = true;
    let selfieSaved = false;
    let savedSelfieUrl = '';
    try {
        // Grab GPS in parallel with image capture (non-blocking; falls back gracefully)
        let lat = null, lng = null, locationLabel = '';
        const gpsResult = await getGPSLocation();
        if (gpsResult) {
            lat = gpsResult.lat;
            lng = gpsResult.lng;
            locationLabel = await reverseGeocode(lat, lng);
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) throw new Error('Could not capture image from camera');
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        const filePath = `${currentUser.id}/selfie_${cid}_${Date.now()}.jpg`;
        const { error: upErr } = await db.storage.from('avatars').upload(filePath, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
        const selfieUrl = urlData.publicUrl;
        const capturedAt = new Date().toISOString();
        const { error: rpcErr } = await db.rpc('add_contact_selfie', {
            p_contact_id: cid,
            p_selfie_url: selfieUrl,
            p_captured_at: capturedAt,
            p_lat: lat,
            p_lng: lng,
            p_location_label: locationLabel || null
        });
        if (rpcErr) throw rpcErr;
        recentSelfieUploads[cid] = Date.now();
        // Invalidate cache so the strip reloads
        delete contactSelfiesCache[cid];
        selfieSaved = true;
        savedSelfieUrl = selfieUrl;
        showToast('Selfie saved!', 'success');
    } catch (e) {
        console.error('Capture selfie error:', e);
        showToast('Could not save selfie: ' + (e.message || 'error'), 'error');
    }
    if (btn) btn.disabled = false;
    if (selfieSaved) {
        // If triggered from the new-contact fullscreen overlay, close it and navigate
        if (newContactSelfieId) {
            closeNewContactSelfieOverlay({ navigate: true });
            return;
        }
        // Otherwise reload the selfies strip inline
        reloadContactSelfiesStrip(cid);
        closeContactSelfieModal({ refreshContacts: false });
        return;
    }
    if (newContactSelfieId) {
        closeNewContactSelfieOverlay({ navigate: true });
        return;
    }
    closeContactSelfieModal();
}

function getGPSLocation() {
    return new Promise(resolve => {
        if (!('geolocation' in navigator)) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
        );
    });
}

async function reverseGeocode(lat, lng) {
    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
        );
        if (!resp.ok) return '';
        const data = await resp.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || '';
        const state = addr.state || '';
        const parts = [city, state].filter(Boolean);
        return parts.join(', ');
    } catch {
        return '';
    }
}

function openShareWithContact(contactId, contactName) {
    shareWithContactId = contactId;
    shareWithContactName = contactName || 'contact';
    showModal('shareChoice');
}

async function shareWithContactChoice(sharedType) {
    if (!shareWithContactId || !currentUser) { closeModal(); return; }
    const isPhone = sharedType === 'phone';
    const myValue = isPhone ? (currentProfile?.phone || '') : (currentProfile?.email || '');
    if (!myValue) {
        showToast(isPhone ? 'Add your phone in Profile first.' : 'Add your email in Profile first.', 'error');
        return;
    }
    try {
        const { data: existing } = await db
            .from('contact_shared')
            .select('shared_phone, shared_email')
            .eq('user_id', currentUser.id)
            .eq('contact_id', shareWithContactId)
            .maybeSingle();

        const phone = isPhone ? myValue : (existing?.shared_phone || null);
        const email = isPhone ? (existing?.shared_email || null) : myValue;

        await db.from('contact_shared').upsert({
            user_id: currentUser.id,
            contact_id: shareWithContactId,
            shared_phone: phone,
            shared_email: email
        }, { onConflict: 'user_id,contact_id' });

        await db.from('contact_shares').insert({
            from_user_id: currentUser.id,
            to_user_id: shareWithContactId,
            shared_type: isPhone ? 'phone' : 'email'
        });

        showToast(isPhone ? 'Phone number shared.' : 'Email shared.', 'success');
    } catch (err) {
        console.error('Share with contact error:', err);
        showToast('Could not save: ' + (err.message || 'error'), 'error');
        return;
    }
    closeModal();
    shareWithContactId = null;
    shareWithContactName = '';
}

function openVouchWithContact(contactId, contactName) {
    vouchWithContactId = contactId;
    vouchWithContactName = contactName || 'contact';
    showModal('vouchChoice');
}

async function vouchWithContactChoice(attestationType) {
    if (!vouchWithContactId) { closeModal(); return; }
    await sendAttestation(vouchWithContactId, attestationType);
    closeModal();
    vouchWithContactId = null;
    vouchWithContactName = '';
}
