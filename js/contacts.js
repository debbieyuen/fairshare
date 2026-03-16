async function openContactListScreen() {
    if (!currentUser) return;
    const overlay = document.getElementById('contactsOverlay');
    const content = document.getElementById('contactsListContent');
    overlay.classList.remove('hidden');
    content.innerHTML = '<p style="color:var(--dark-gray);text-align:center;padding:2rem;">Loading…</p>';
    await loadAndRenderContactList();
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
                row.classList.toggle('expanded');
                if (!wasExpanded) {
                    const cid = row.dataset.contactId;
                    if (cid) loadFamilyTree(cid);
                }
            });
        });
        content.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-share-with-contact');
            if (btn) {
                e.stopPropagation();
                openShareWithContact(btn.dataset.contactId || '', btn.dataset.contactName || 'contact');
            }
        });
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
                ${phone ? `<div class="contact-detail-line">📞 <a href="tel:${esc(phone)}">${esc(phone)}</a></div>` : ''}
                ${email ? `<div class="contact-detail-line">✉ <a href="mailto:${esc(email)}">${esc(email)}</a></div>` : ''}
                <div class="contact-detail-line">Selfie</div>
                <div class="contact-selfie-wrap" onclick="event.stopPropagation();openContactSelfie('${cid}')">${selfieHtml}</div>
                <div class="contact-detail-actions">
                    <button type="button" class="btn btn-primary btn-small btn-share-with-contact" data-contact-id="${cid}" data-contact-name="${esc(name)}">Share</button>
                    <button type="button" class="btn btn-small btn-trust" onclick="event.stopPropagation();sendAttestation('${cid}','trust')">Trust</button>
                    <button type="button" class="btn btn-small btn-love" onclick="event.stopPropagation();sendAttestation('${cid}','love')">Love</button>
                </div>
                <div class="family-tree" id="ft-${cid}">
                    <div class="family-tree-title">Shared Sponsor Tree</div>
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
        container.innerHTML = '<div class="family-tree-title">Shared Sponsor Tree</div><div class="family-tree-loading">Could not load tree.</div>';
    }
}

function renderFamilyTree(container, myChain, theirChain, contactId) {
    // Find LCA: the first ID that appears in both chains
    const theirIdSet = new Set(theirChain.map(n => n.id));
    let lcaIndex = -1;
    for (let i = 0; i < myChain.length; i++) {
        if (theirIdSet.has(myChain[i].id)) {
            lcaIndex = i;
            break;
        }
    }

    // Build the path from contact to LCA
    let theirLcaIndex = -1;
    if (lcaIndex >= 0) {
        const lcaId = myChain[lcaIndex].id;
        theirLcaIndex = theirChain.findIndex(n => n.id === lcaId);
    }

    if (lcaIndex < 0 || theirLcaIndex < 0) {
        container.innerHTML = '<div class="family-tree-title">Shared Sponsor Tree</div><div class="family-tree-loading" style="font-style:italic;">No shared sponsors found.</div>';
        return;
    }

    // myPath: from me up to (but not including) LCA
    const myPath = myChain.slice(0, lcaIndex);
    // theirPath: from contact up to (but not including) LCA
    const theirPath = theirChain.slice(0, theirLcaIndex);
    const lca = myChain[lcaIndex];

    // Shared ancestors above LCA (optional, show a few)
    const sharedAbove = myChain.slice(lcaIndex + 1, lcaIndex + 4);

    const nodeHtml = (node, cls = '') => {
        const name = esc(node.display_name || 'Unknown');
        return `<div class="ft-node ${cls}" title="${name}">${name}</div>`;
    };

    const connectorHtml = '<div class="ft-connector"></div>';

    // Build left branch (me to LCA)
    let leftBranch = '';
    for (let i = 0; i < myPath.length; i++) {
        const cls = i === 0 ? 'ft-you' : '';
        leftBranch += nodeHtml(myPath[i], cls) + connectorHtml;
    }

    // Build right branch (contact to LCA)
    let rightBranch = '';
    for (let i = 0; i < theirPath.length; i++) {
        const cls = i === 0 ? 'ft-them' : '';
        rightBranch += nodeHtml(theirPath[i], cls) + connectorHtml;
    }

    // If both paths are empty, they share the same direct sponsor
    const hasLeftPath = myPath.length > 0;
    const hasRightPath = theirPath.length > 0;

    // Build shared ancestors above LCA
    let sharedHtml = '';
    for (const node of sharedAbove) {
        sharedHtml += connectorHtml + nodeHtml(node);
    }
    if (myChain.length > lcaIndex + 4) {
        sharedHtml += connectorHtml + '<div class="ft-node" style="color:var(--dark-gray);">⋮</div>';
    }

    let treeHtml = '<div class="family-tree-title">Shared Sponsor Tree</div>';

    if (!hasLeftPath && !hasRightPath) {
        // Both are directly sponsored by the LCA
        treeHtml += `<div class="family-tree-diagram">
            <div class="ft-branch">${nodeHtml(lca, 'ft-lca')}${sharedHtml}</div>
        </div>`;
    } else {
        // Render V-shaped tree
        const maxLen = Math.max(myPath.length, theirPath.length);
        const leftPad = maxLen - myPath.length;
        const rightPad = maxLen - theirPath.length;

        let leftCol = '';
        for (let i = 0; i < leftPad; i++) leftCol += '<div class="ft-connector" style="visibility:hidden;"></div><div class="ft-node" style="visibility:hidden;">.</div>';
        leftCol += leftBranch;

        let rightCol = '';
        for (let i = 0; i < rightPad; i++) rightCol += '<div class="ft-connector" style="visibility:hidden;"></div><div class="ft-node" style="visibility:hidden;">.</div>';
        rightCol += rightBranch;

        treeHtml += `<div class="family-tree-diagram" style="flex-direction:column;align-items:center;">
            <div class="ft-branches">
                <div class="ft-branch">${leftCol}</div>
                <div class="ft-branch">${rightCol}</div>
            </div>
            <div style="display:flex;align-items:flex-end;width:100%;max-width:200px;">
                <div style="flex:1;height:2px;background:var(--medium-gray);"></div>
                <div style="flex:1;height:2px;background:var(--medium-gray);"></div>
            </div>
            <div class="ft-connector"></div>
            ${nodeHtml(lca, 'ft-lca')}
            ${sharedHtml}
        </div>`;
    }

    container.innerHTML = treeHtml;
}

function openContactSelfie(contactId) {
    contactSelfieId = contactId;
    showModal('contactSelfie');
}

function closeContactSelfieModal() {
    stopContactSelfieStream();
    contactSelfieId = null;
    closeModal();
    if (document.getElementById('contactsListContent') && !document.getElementById('contactsOverlay').classList.contains('hidden')) {
        loadAndRenderContactList();
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
    const cid = contactSelfieId;
    if (!cid || !currentUser) return;
    const video = document.getElementById('contactSelfieVideo');
    if (!video || video.readyState < 2) {
        showToast('Camera not ready — please wait a moment and try again.', 'error');
        return;
    }
    const btn = document.getElementById('contactSelfieCaptureBtn');
    if (btn) btn.disabled = true;
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
        showToast('Selfie saved!', 'success');
    } catch (e) {
        console.error('Capture selfie error:', e);
        showToast('Could not save selfie: ' + (e.message || 'error'), 'error');
    }
    if (btn) btn.disabled = false;
    closeContactSelfieModal();
}

function openShareWithContact(contactId, contactName) {
    shareWithContactId = contactId;
    shareWithContactName = contactName || 'contact';
    showModal('shareWithContact');
}

async function submitShareWithContact(e) {
    e.preventDefault();
    if (!shareWithContactId) { closeModal(); return; }
    const sharePhone = document.getElementById('sharePhone').checked;
    const shareEmail = document.getElementById('shareEmail').checked;
    const phone = sharePhone ? (currentProfile?.phone || '') : null;
    const email = shareEmail ? (currentProfile?.email || '') : null;
    try {
        await db.from('contact_shared').upsert({
            user_id: currentUser.id,
            contact_id: shareWithContactId,
            shared_phone: phone,
            shared_email: email
        }, { onConflict: 'user_id,contact_id' });
        if (sharePhone) {
            await db.from('contact_shares').insert({ from_user_id: currentUser.id, to_user_id: shareWithContactId, shared_type: 'phone' });
        }
        if (shareEmail) {
            await db.from('contact_shares').insert({ from_user_id: currentUser.id, to_user_id: shareWithContactId, shared_type: 'email' });
        }
        showToast('Shared.', 'success');
    } catch (err) {
        console.error('Share with contact error:', err);
        showToast('Could not save: ' + (err.message || 'error'), 'error');
    }
    closeModal();
    shareWithContactId = null;
    shareWithContactName = '';
    if (document.getElementById('contactsListContent') && !document.getElementById('contactsOverlay').classList.contains('hidden')) {
        await loadAndRenderContactList();
    }
}
