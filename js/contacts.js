async function openContactListScreen() {
    if (!currentUser) return;
    const overlay = document.getElementById('contactsOverlay');
    const content = document.getElementById('contactsListContent');
    overlay.classList.remove('hidden');
    content.innerHTML = '<p style="color:var(--dark-gray);text-align:center;padding:2rem;">Loading…</p>';
    await loadAndRenderContactList();
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
    loadFamilyTree(contactId);
    return true;
}

function updateContactSelfieInList(contactId, selfieUrl) {
    const row = getContactRow(contactId);
    const wrap = row?.querySelector('.contact-selfie-wrap');
    if (!wrap) return false;
    if (selfieUrl) {
        wrap.innerHTML = `<img src="${esc(selfieUrl)}" alt="Selfie">`;
    } else {
        wrap.innerHTML = '<span title="Tap to take a selfie">📷</span>';
    }
    return true;
}

async function openContactDetailsById(contactId) {
    if (!contactId || !currentUser) return false;
    const overlay = document.getElementById('contactsOverlay');
    const content = document.getElementById('contactsListContent');
    if (!overlay || !content) return false;

    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
    }

    if (!getContactRow(contactId)) {
        await loadAndRenderContactList();
    }

    if (expandContactRow(contactId)) {
        return true;
    }

    // Contact row can arrive a moment later via realtime after meet/invite completion.
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        await loadAndRenderContactList();
        if (expandContactRow(contactId)) return true;
    }
    return false;
}

async function openNewestContactDetails() {
    if (!currentUser) return false;
    const overlay = document.getElementById('contactsOverlay');
    if (overlay && overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
    }
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
    document.getElementById('contactsOverlay').classList.add('hidden');
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
            content.innerHTML = '<p style="color:var(--dark-gray);text-align:center;padding:2rem;">No contacts yet. Use the handshake icon to add someone.</p>';
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

        content.innerHTML = contacts.map(c => {
            const profile = profileMap[c.contact_id] || {};
            const shared = sharedByThemMap[c.contact_id] || {};
            return renderContactRow(c, profile, shared);
        }).join('');

        content.querySelectorAll('.contact-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.contact-detail-actions') || e.target.closest('.contact-selfie-wrap') || e.target.closest('input') || e.target.closest('button')) return;
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
                if (cid) loadFamilyTree(cid);
            });
        });
        if (!content.dataset.contactActionBound) {
            content.addEventListener('click', (e) => {
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
    } catch (e) {
        console.error('Load contacts error:', e);
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

function renderContactRow(contact, profile, shared) {
    const name = profile.display_name || 'Unknown';
    const avatarUrl = profile.profile_image_url || null;
    const phone = (shared.shared_phone != null && shared.shared_phone !== '') ? shared.shared_phone : '';
    const email = (shared.shared_email != null && shared.shared_email !== '') ? shared.shared_email : '';
    const cid = esc(contact.contact_id);
    const selfieUrl = contact.selfie_url || null;
    const lastSeen = formatLastSeen(contact.met_at);
    const avatarHtml = avatarUrl
        ? `<img class="contact-row-avatar" src="${esc(avatarUrl)}" alt="">`
        : '<div class="contact-row-avatar-placeholder">👤</div>';
    const largeAvatarHtml = avatarUrl
        ? `<img class="contact-detail-profile-photo" src="${esc(avatarUrl)}" alt="${esc(name)} profile">`
        : '<div class="contact-detail-profile-placeholder">👤</div>';
    const selfieHtml = selfieUrl
        ? `<img src="${esc(selfieUrl)}" alt="Selfie">`
        : '<span title="Tap to take a selfie">📷</span>';
    return `
        <div class="contact-row" data-contact-id="${cid}">
            <div class="contact-row-header">
                ${avatarHtml}
                <span class="contact-row-name">${esc(name)}</span>
                ${lastSeen ? `<span class="contact-row-lastseen">${lastSeen}</span>` : ''}
                <span class="contact-row-chevron">›</span>
            </div>
            <div class="contact-detail">
                <div class="contact-detail-media-row">
                    <div class="contact-detail-profile-media">${largeAvatarHtml}</div>
                    <div class="contact-selfie-wrap contact-detail-selfie" onclick="event.stopPropagation();openContactSelfie('${cid}')">${selfieHtml}</div>
                </div>
                <div class="contact-detail-actions">
                    <button type="button" class="btn btn-primary btn-small btn-share-with-contact" data-contact-id="${cid}" data-contact-name="${esc(name)}">Share</button>
                    <button type="button" class="btn btn-small btn-vouch-with-contact" data-contact-id="${cid}" data-contact-name="${esc(name)}">Vouch</button>
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
    const cid = contactSelfieId;
    if (!cid || !currentUser) return;
    const video = document.getElementById('contactSelfieVideo');
    if (!video || video.readyState < 2) {
        showToast('Camera not ready — please wait a moment and try again.', 'error');
        return;
    }
    const btn = document.getElementById('contactSelfieCaptureBtn');
    if (btn) btn.disabled = true;
    let selfieSaved = false;
    let savedSelfieUrl = '';
    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) throw new Error('Could not capture image from camera');
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        const filePath = `${currentUser.id}/selfie_${cid}_${Date.now()}.jpg`;
        const { error: upErr } = await db.storage.from('avatars').upload(filePath, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
        const selfieUrl = urlData.publicUrl;
        const { error: rpcErr } = await db.rpc('set_contact_selfie', {
            p_contact_id: cid,
            p_selfie_url: selfieUrl
        });
        if (rpcErr) throw rpcErr;
        recentSelfieUploads[cid] = Date.now();
        selfieSaved = true;
        savedSelfieUrl = selfieUrl;
        showToast('Selfie saved!', 'success');
    } catch (e) {
        console.error('Capture selfie error:', e);
        showToast('Could not save selfie: ' + (e.message || 'error'), 'error');
    }
    if (btn) btn.disabled = false;
    if (selfieSaved) {
        updateContactSelfieInList(cid, savedSelfieUrl);
        closeContactSelfieModal({ refreshContacts: false });
        return;
    }
    closeContactSelfieModal();
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
