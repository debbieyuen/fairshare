// Word-level diff: returns array of { type: 'same'|'ins'|'del', text } objects
function wordDiffRaw(oldText, newText) {
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);

    // Simple LCS-based diff
    const m = oldWords.length, n = newWords.length;
    // Build LCS table
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldWords[i - 1] === newWords[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build diff
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            result.unshift({ type: 'same', text: oldWords[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'ins', text: newWords[j - 1] });
            j--;
        } else {
            result.unshift({ type: 'del', text: oldWords[i - 1] });
            i--;
        }
    }

    return result;
}

// Word-level diff: produces HTML with <ins> and <del> spans
function wordDiff(oldText, newText) {
    return wordDiffRaw(oldText, newText).map(r => {
        const t = esc(r.text);
        if (r.type === 'ins') return `<ins>${t}</ins>`;
        if (r.type === 'del') return `<del>${t}</del>`;
        return t;
    }).join('');
}

// Render constitution text with highlighted tags
function renderConstitution(text) {
    if (!text) return '<em style="color:var(--dark-gray);">No constitution yet.</em>';
    return esc(text).replace(/\$([A-Z_]+)/g,
        '<span class="tag">$$$1</span>');
}

// Parse $AMENDMENT_PERCENTAGE from constitution text (returns 0-1)
function parseAmendmentThreshold(constitutionText) {
    if (!constitutionText) return 1.0; // default 100%
    const match = constitutionText.match(/(\d+)%\s*(?:members?\s*)?\$AMENDMENT_PERCENTAGE/i);
    if (match) return parseInt(match[1]) / 100;
    return 1.0;
}

function parseNewMemberThreshold(constitutionText) {
    if (!constitutionText) return 1.0; // default 100%
    const match = constitutionText.match(/(\d+)%\s*(?:members?\s*)?\$NEW_MEMBER_PERCENTAGE/i);
    if (match) return parseInt(match[1]) / 100;
    return 1.0;
}

// Build word-level attribution by replaying edit history diffs.
// Returns an array of { word, user_id, created_at } for each word in the final content.
function buildWordAttribution(history) {
    if (!history || history.length === 0) return [];

    // Start with the first revision — all words attributed to its author
    let prevWords = history[0].content.split(/(\s+)/);
    let attribution = prevWords.map(w => ({
        word: w,
        user_id: history[0].user_id,
        created_at: history[0].created_at
    }));

    // Replay each subsequent revision
    for (let h = 1; h < history.length; h++) {
        const rev = history[h];
        const newWords = rev.content.split(/(\s+)/);
        const diff = wordDiffRaw(
            prevWords.join(''),
            newWords.join('')
        );

        // Walk through the diff and build a new attribution array
        const newAttribution = [];
        let oldIdx = 0;  // pointer into previous attribution array

        for (const entry of diff) {
            if (entry.type === 'same') {
                // Carry forward the existing attribution
                // Find the matching old word
                while (oldIdx < attribution.length && attribution[oldIdx].word !== entry.text) {
                    oldIdx++;
                }
                if (oldIdx < attribution.length) {
                    newAttribution.push(attribution[oldIdx]);
                    oldIdx++;
                } else {
                    // Fallback — shouldn't happen, but attribute to current revision
                    newAttribution.push({ word: entry.text, user_id: rev.user_id, created_at: rev.created_at });
                }
            } else if (entry.type === 'ins') {
                // New/inserted word — attribute to this revision's author
                newAttribution.push({ word: entry.text, user_id: rev.user_id, created_at: rev.created_at });
            }
            // 'del' entries are dropped (they no longer exist in the new text)
        }

        attribution = newAttribution;
        prevWords = newWords;
    }

    return attribution;
}

// Render the document content with hover attribution spans
function renderAttributedDocument(attribution, profileMap) {
    if (attribution.length === 0) {
        return '<p style="color:var(--dark-gray);font-style:italic;">No content yet. Click Edit to add something.</p>';
    }

    let html = '<div class="group-doc-text" style="white-space:pre-wrap;word-wrap:break-word;line-height:1.7;font-size:0.95rem;">';
    for (const item of attribution) {
        const name = profileMap[item.user_id] || 'Unknown';
        const date = new Date(item.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
            + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const tooltip = `${name} — ${dateStr}`;
        // Only wrap non-whitespace tokens in spans (whitespace renders as-is)
        if (item.word.trim()) {
            html += `<span title="${esc(tooltip)}" style="cursor:default;">${esc(item.word)}</span>`;
        } else {
            html += esc(item.word);
        }
    }
    html += '</div>';
    return html;
}

let _docLoadGen = 0;
async function loadGroupDocument() {
    if (!selectedGroup) return;
    const myGen = ++_docLoadGen;
    const groupId = selectedGroup.id;
    const el = document.getElementById('groupDocContent');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--dark-gray);">Loading…</p>';

    try {
        // Fetch current document and full history in parallel
        const [docResult, histResult] = await Promise.all([
            db.from('group_documents').select('*').eq('group_id', groupId).maybeSingle(),
            db.from('document_history').select('*').eq('group_id', groupId).order('created_at', { ascending: true })
        ]);

        if (myGen !== _docLoadGen) return;

        if (docResult.error) {
            console.error('loadGroupDocument error:', docResult.error);
            el.innerHTML = `<p style="color:var(--red);">Error loading document: ${esc(docResult.error.message)}</p>`;
            return;
        }

        const doc = docResult.data;
        const history = histResult.data || [];

        // Build a profile name map for all authors in the history
        const authorIds = [...new Set(history.map(h => h.user_id))];
        const profileMap = {};
        for (const uid of authorIds) {
            profileMap[uid] = await getDisplayName(uid);
        }

        if (myGen !== _docLoadGen) return;

        // Build attribution if there's content
        let contentHtml;
        if (doc && doc.content && doc.content.trim()) {
            const attribution = buildWordAttribution(history);
            contentHtml = renderAttributedDocument(attribution, profileMap);
        } else {
            contentHtml = '<p style="color:var(--dark-gray);font-style:italic;">No content yet. Click Edit to add something.</p>';
        }

        let html = contentHtml;
        html += `<div style="margin-top:0.75rem;">
            <button class="btn btn-secondary btn-small" onclick="editGroupDocument()">Edit</button>
        </div>`;

        if (myGen !== _docLoadGen) return;
        el.innerHTML = html;
    } catch (e) {
        console.error('loadGroupDocument error:', e);
        if (myGen === _docLoadGen) {
            el.innerHTML = `<p style="color:var(--red);">Failed to load document: ${esc(e.message || e)}</p>`;
        }
    }
}

function editGroupDocument() {
    const el = document.getElementById('groupDocContent');
    if (!el) return;

    // Fetch current text from the rendered content (or empty for new)
    const existingTextEl = el.querySelector('.group-doc-text');
    let currentText = '';
    if (existingTextEl) {
        currentText = existingTextEl.textContent;
    }

    el.innerHTML = `
        <textarea id="groupDocEditor" rows="10"
            style="width:100%;font-family:inherit;font-size:0.95rem;line-height:1.6;padding:0.75rem;border:1px solid var(--medium-gray);border-radius:6px;resize:vertical;"
            placeholder="Use this space for announcements, marketplace listings, contact info, or anything the group wants to share…"
        >${esc(currentText)}</textarea>
        <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
            <button class="btn btn-primary btn-small" onclick="saveGroupDocument()">Save</button>
            <button class="btn btn-secondary btn-small" onclick="loadGroupDocument()">Cancel</button>
        </div>
    `;

    // Focus the editor
    const editor = document.getElementById('groupDocEditor');
    if (editor) editor.focus();
}

async function saveGroupDocument() {
    if (!selectedGroup) return;
    const editor = document.getElementById('groupDocEditor');
    if (!editor) return;

    const content = editor.value;

    // Disable buttons while saving
    editor.disabled = true;
    const buttons = editor.parentElement.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);

    try {
        const { data, error } = await db.rpc('save_document', {
            p_group_id: selectedGroup.id,
            p_content: content
        });

        if (error) {
            showToast('Failed to save document: ' + error.message, 'error');
            editor.disabled = false;
            buttons.forEach(b => b.disabled = false);
            return;
        }

        showToast('Document saved', 'success');
        await loadGroupDocument();
    } catch (e) {
        showToast('Failed to save document: ' + (e.message || e), 'error');
        editor.disabled = false;
        buttons.forEach(b => b.disabled = false);
    }
}

// Load the Constitution content
let _constitutionLoadGen = 0;  // generation counter to prevent stale writes
async function loadConstitutionContent() {
    if (!selectedGroup) return;
    const myGen = ++_constitutionLoadGen;       // claim this generation
    const groupId = selectedGroup.id;           // pin the group id
    const el = document.getElementById('constitutionContent');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--dark-gray);">Loading…</p>';

    try {
        // Refresh group data to get latest constitution
        const { data: freshGroup, error: groupErr } = await db
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (myGen !== _constitutionLoadGen) return;  // stale – a newer call took over

        if (groupErr) {
            console.error('loadConstitution group fetch error:', groupErr);
            el.innerHTML = `<p style="color:var(--red);">Error loading group data: ${esc(groupErr.message)}</p>`;
            return;
        }
        if (freshGroup) {
            selectedGroup = freshGroup;   // safe: we checked generation
        }

        const constitutionHtml = `<div class="constitution-text">${renderConstitution(selectedGroup.constitution)}</div>`;

        // Load active and past amendments in parallel
        const [activeResult, pastResult, memberResult] = await Promise.all([
            db.from('amendments')
                .select('*, proposer:profiles(display_name)')
                .eq('group_id', groupId)
                .eq('status', 'voting')
                .order('created_at', { ascending: false }),
            db.from('amendments')
                .select('*, proposer:profiles(display_name)')
                .eq('group_id', groupId)
                .in('status', ['passed', 'failed', 'withdrawn'])
                .order('resolved_at', { ascending: false })
                .limit(20),
            db.from('members')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', groupId)
                .eq('status', 'active')
        ]);

        if (myGen !== _constitutionLoadGen) return;  // stale

        if (activeResult.error) console.warn('loadConstitution active amendments error:', activeResult.error);
        if (pastResult.error) console.warn('loadConstitution past amendments error:', pastResult.error);

        const activeAmendments = activeResult.data;
        const pastAmendments = pastResult.data;
        const activeMembers = memberResult.count;

        // Get vote counts for all amendments we're showing
        const allAmendmentIds = [
            ...(activeAmendments || []).map(a => a.id),
            ...(pastAmendments || []).map(a => a.id)
        ];

        let votesMap = {};
        let myVotesMap = {};
        if (allAmendmentIds.length > 0) {
            const { data: votes } = await db
                .from('amendment_votes')
                .select('amendment_id, user_id, vote')
                .in('amendment_id', allAmendmentIds);

            if (myGen !== _constitutionLoadGen) return;  // stale

            (votes || []).forEach(v => {
                if (!votesMap[v.amendment_id]) votesMap[v.amendment_id] = { approve: 0, reject: 0 };
                if (v.vote) votesMap[v.amendment_id].approve++;
                else votesMap[v.amendment_id].reject++;
                if (v.user_id === currentUser.id) myVotesMap[v.amendment_id] = v.vote;
            });
        }

        let html = constitutionHtml;

        // Propose button
        html += `<div style="margin:1rem 0;">
            <button class="btn btn-primary" onclick="showModal('proposeAmendment')">Propose an Amendment</button>
        </div>`;

        // Active amendments
        if (activeAmendments && activeAmendments.length > 0) {
            html += `<h4 style="margin:1.5rem 0 0.5rem;color:var(--accent-color);">Active Amendments</h4>`;
            html += activeAmendments.map(a => renderAmendmentCard(a, votesMap, myVotesMap, activeMembers)).join('');
        }

        // Past amendments
        if (pastAmendments && pastAmendments.length > 0) {
            html += `<h4 style="margin:1.5rem 0 0.5rem;color:var(--accent-color);">Amendment History</h4>`;
            html += pastAmendments.map(a => renderAmendmentCard(a, votesMap, myVotesMap, activeMembers)).join('');
        }

        if (myGen !== _constitutionLoadGen) return;  // final stale check before DOM write
        el.innerHTML = html;
    } catch (e) {
        console.error('loadConstitution error:', e);
        if (myGen === _constitutionLoadGen) {
            el.innerHTML = `<p style="color:var(--red);">Failed to load constitution: ${esc(e.message || e)}</p>`;
        }
    }
}

function renderAmendmentCard(a, votesMap, myVotesMap, activeMemberCount) {
    const votes = votesMap[a.id] || { approve: 0, reject: 0 };
    const myVote = myVotesMap[a.id];
    const total = activeMemberCount || 1;
    const pct = total > 0 ? (votes.approve / total * 100) : 0;
    const thresholdPct = (a.threshold * 100);
    const now = new Date();
    const expires = new Date(a.expires_at);
    const isExpired = expires <= now;
    const timeLeft = isExpired ? 'Expired' : formatTimeLeft(expires - now);

    let diffHtml = wordDiff(a.old_text || '', a.new_text || '');

    let actions = '';
    if (a.status === 'voting') {
        if (isExpired) {
            actions = `<button class="btn btn-primary btn-small" onclick="resolveAmendment('${a.id}')">Resolve Vote</button>`;
        } else {
            const approveClass = myVote === true ? 'btn-success' : 'btn-outline';
            const rejectClass = myVote === false ? 'btn-danger' : 'btn-outline';
            actions = `
                <button class="btn ${approveClass} btn-small" onclick="voteAmendment('${a.id}', true)"
                    ${myVote === true ? 'disabled' : ''}>Approve${myVote === true ? 'd' : ''}</button>
                <button class="btn ${rejectClass} btn-small" onclick="voteAmendment('${a.id}', false)"
                    ${myVote === false ? 'disabled' : ''}>Reject${myVote === false ? 'ed' : ''}</button>
            `;
            if (a.proposed_by === currentUser.id) {
                actions += ` <button class="btn btn-secondary btn-small" onclick="withdrawAmendment('${a.id}')">Withdraw</button>`;
            }
        }
    }

    return `<div class="amendment-card ${a.status}">
        <div class="amendment-header">
            <span class="amendment-title">${esc(a.title)}</span>
            <span class="amendment-status ${a.status}">${a.status}</span>
        </div>
        <div class="amendment-meta">
            Proposed by ${esc(a.proposer?.display_name || 'Unknown')}
            &middot; ${a.status === 'voting' ? timeLeft : (a.resolved_at ? new Date(a.resolved_at).toLocaleDateString() : '')}
        </div>
        <div class="vote-bar">
            <span style="font-size:0.8rem;font-weight:600;">${votes.approve}/${total}</span>
            <div class="vote-bar-track">
                <div class="vote-bar-fill" style="width:${pct}%"></div>
                <div class="vote-bar-threshold" style="left:${thresholdPct}%" title="Threshold: ${thresholdPct}%"></div>
            </div>
            <span style="font-size:0.75rem;color:var(--dark-gray);">need ${thresholdPct}%</span>
        </div>
        <details style="margin:0.5rem 0;">
            <summary style="cursor:pointer;font-size:0.85rem;color:var(--primary-color);font-weight:500;">Show changes</summary>
            <div class="diff-display" style="margin-top:0.5rem;">${diffHtml}</div>
        </details>
        ${actions ? `<div style="display:flex;gap:0.5rem;margin-top:0.5rem;">${actions}</div>` : ''}
    </div>`;
}

function formatTimeLeft(ms) {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
}

// Live diff preview in the propose amendment modal
function updateAmendmentPreview() {
    const oldText = selectedGroup?.constitution || '';
    const newText = document.getElementById('amendmentEditor').value;
    const preview = document.getElementById('amendmentDiffPreview');
    if (oldText === newText) {
        preview.innerHTML = '<span style="color:var(--dark-gray);">No changes yet.</span>';
    } else {
        preview.innerHTML = wordDiff(oldText, newText);
    }
}

async function submitAmendment() {
    if (!selectedGroup) return;
    const title = document.getElementById('amendmentTitle').value.trim();
    const newText = document.getElementById('amendmentEditor').value;
    const oldText = selectedGroup.constitution || '';

    if (!title) { showToast('Please enter a title for the amendment', 'error'); return; }
    if (newText === oldText) { showToast('No changes detected in the constitution', 'error'); return; }

    const threshold = parseAmendmentThreshold(oldText);

    const { error } = await db.from('amendments').insert({
        group_id: selectedGroup.id,
        proposed_by: currentUser.id,
        title,
        old_text: oldText,
        new_text: newText,
        threshold
    });

    if (error) { showToast(error.message, 'error'); return; }

    // Log the event for realtime notifications
    await db.rpc('log_group_event', {
        p_group_id: selectedGroup.id,
        p_event_type: 'amendment_proposed',
        p_summary: 'Amendment proposed: ' + title,
        p_metadata: { title }
    });

    showToast('Amendment proposed! Members have 7 days to vote.', 'success');
    closeModal();
    if (activeTab === 'constitution') await loadConstitutionContent();
}

async function voteAmendment(amendmentId, approve) {
    const { error } = await db.from('amendment_votes').upsert({
        amendment_id: amendmentId,
        user_id: currentUser.id,
        vote: approve
    }, { onConflict: 'amendment_id,user_id' });

    if (error) { showToast(error.message, 'error'); return; }

    // After an approval vote, check if threshold is now met
    if (approve) {
        const { data, error: resolveError } = await db.rpc('resolve_amendment', { p_amendment_id: amendmentId });
        if (!resolveError && data?.passed) {
            showToast(`Amendment passed! (${data.approve_count}/${data.active_members} approved, ${data.ratio}% ≥ ${data.threshold}% needed)`, 'success');
            // Refresh group data since constitution may have changed
            const { data: freshGroup } = await db.from('groups').select('*').eq('id', selectedGroup.id).single();
            if (freshGroup) {
                selectedGroup = freshGroup;
                const membership = myGroups.find(m => m.group_id === selectedGroup.id);
                if (membership) membership.groups = freshGroup;
                renderGroupList();
            }
            await loadConstitutionContent();
            return;
        }
    }

    showToast(approve ? 'Voted to approve' : 'Voted to reject', 'info');
    await loadConstitutionContent();
}

async function resolveAmendment(amendmentId) {
    const { data, error } = await db.rpc('resolve_amendment', { p_amendment_id: amendmentId });
    if (error) { showToast(error.message, 'error'); return; }

    if (data?.resolved === false) {
        showToast(`Not enough votes yet (${data.approve_count}/${data.active_members}, need ${data.threshold}%)`, 'info');
    } else if (data?.passed) {
        showToast(`Amendment passed! (${data.approve_count}/${data.active_members} approved, ${data.ratio}% ≥ ${data.threshold}% needed)`, 'success');
        const { data: freshGroup } = await db.from('groups').select('*').eq('id', selectedGroup.id).single();
        if (freshGroup) {
            selectedGroup = freshGroup;
            const membership = myGroups.find(m => m.group_id === selectedGroup.id);
            if (membership) membership.groups = freshGroup;
            renderGroupList();
        }
    } else {
        showToast(`Amendment failed. (${data.approve_count}/${data.active_members} approved, ${data.ratio}% < ${data.threshold}% needed)`, 'error');
    }
    await loadConstitutionContent();
}

async function withdrawAmendment(amendmentId) {
    console.log('withdrawAmendment called with:', amendmentId);
    try {
        const { data, error } = await db
            .from('amendments')
            .update({ status: 'withdrawn' })
            .eq('id', amendmentId)
            .select()
            .single();

        console.log('withdrawAmendment result:', { data, error });
        if (error) {
            console.error('withdrawAmendment error:', error);
            showToast(error.message, 'error');
            return;
        }
        showToast('Amendment withdrawn', 'info');
        await loadConstitutionContent();
    } catch (e) {
        console.error('withdrawAmendment exception:', e);
        showToast('Error withdrawing amendment: ' + e.message, 'error');
    }
}
