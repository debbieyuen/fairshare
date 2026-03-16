async function loadCandidatesList() {
    if (!selectedGroup) return;
    const el = document.getElementById('candidatesContent');
    if (!el) return;

    const { data: candidates, error } = await db
        .from('members')
        .select('*, profiles(display_name)')
        .eq('group_id', selectedGroup.id)
        .eq('status', 'pending');

    if (error || !candidates || candidates.length === 0) {
        el.innerHTML = '<p style="color:var(--dark-gray);">No pending candidates.</p>';
        return;
    }

    // Get endorsement counts
    const { data: endorsements } = await db
        .from('endorsements')
        .select('candidate_id, endorser_id')
        .eq('group_id', selectedGroup.id);

    const endorseMap = {};
    const myEndorsements = new Set();
    (endorsements || []).forEach(e => {
        endorseMap[e.candidate_id] = (endorseMap[e.candidate_id] || 0) + 1;
        if (e.endorser_id === currentUser.id) myEndorsements.add(e.candidate_id);
    });

    // Get sponsorship info for each candidate (sponsor name + message)
    const candidateIds = candidates.map(c => c.user_id);
    const { data: sponsorships } = await db
        .from('sponsorships')
        .select('candidate_id, message, sponsor:profiles!sponsorships_sponsor_id_fkey(display_name)')
        .eq('group_id', selectedGroup.id)
        .eq('status', 'claimed')
        .in('candidate_id', candidateIds);

    const sponsorMap = {};
    (sponsorships || []).forEach(s => {
        sponsorMap[s.candidate_id] = {
            sponsor_name: s.sponsor?.display_name || 'Unknown',
            message: s.message
        };
    });

    const { count: activeCount } = await db
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', selectedGroup.id)
        .eq('status', 'active');

    const memberPct = parseNewMemberThreshold(selectedGroup.constitution);
    const threshold = Math.max(1, Math.ceil((activeCount || 0) * memberPct));

    el.innerHTML = candidates.map(c => {
        const endorsed = myEndorsements.has(c.user_id);
        const count = endorseMap[c.user_id] || 0;
        const sponsorInfo = sponsorMap[c.user_id];
        return `<div class="member-item" style="flex-direction:column;align-items:stretch;gap:0.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <span class="member-name">${esc(c.profiles?.display_name || 'Unknown')}</span>
                    <span style="font-size:0.8rem;color:var(--dark-gray);margin-left:0.5rem;">${count}/${threshold} endorsements</span>
                </div>
                <div>
                    ${endorsed
                        ? `<button class="btn btn-danger btn-small" onclick="unendorse('${c.user_id}')">Unendorse</button>`
                        : `<button class="btn btn-success btn-small" onclick="endorse('${c.user_id}')">Endorse</button>`
                    }
                </div>
            </div>
            ${sponsorInfo ? `
                <div style="font-size:0.8rem;color:var(--dark-gray);padding-left:0.5rem;border-left:3px solid var(--medium-gray);">
                    Sponsored by <strong>${esc(sponsorInfo.sponsor_name)}</strong>
                    ${sponsorInfo.message ? `<br><em>"${esc(sponsorInfo.message)}"</em>` : ''}
                </div>
            ` : ''}
        </div>`;
    }).join('');
}

async function endorse(candidateId) {
    const { error } = await db.from('endorsements').insert({
        group_id: selectedGroup.id,
        candidate_id: candidateId,
        endorser_id: currentUser.id
    });
    if (error) { showToast(error.message, 'error'); return; }

    // Check if threshold met
    const { data } = await db.rpc('check_endorsements', {
        p_group_id: selectedGroup.id,
        p_candidate_id: candidateId
    });
    if (data?.admitted) {
        showToast('Candidate admitted to the group!', 'success');
        await loadMyGroups();
    } else {
        showToast('Endorsement recorded', 'info');
    }
    await loadCandidatesList();
}

async function unendorse(candidateId) {
    const { error } = await db.from('endorsements')
        .delete()
        .eq('group_id', selectedGroup.id)
        .eq('candidate_id', candidateId)
        .eq('endorser_id', currentUser.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Endorsement removed', 'info');
    await loadCandidatesList();
}
