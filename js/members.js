async function loadMembersList() {
    if (!selectedGroup) return;
    const el = document.getElementById('membersListContent');
    if (!el) return;

    const [{ data, error }, { data: sponsorships }] = await Promise.all([
        db.from('members')
            .select('*, profiles(display_name)')
            .eq('group_id', selectedGroup.id)
            .eq('status', 'active')
            .order('joined_at', { ascending: true }),
        db.from('sponsorships')
            .select('candidate_id, sponsor:profiles!sponsorships_sponsor_id_fkey(display_name)')
            .eq('group_id', selectedGroup.id)
            .eq('status', 'claimed')
    ]);

    if (error || !data) {
        el.innerHTML = '<p>Failed to load members.</p>';
        return;
    }

    // Update member count display
    const countEl = document.getElementById('memberCountDisplay');
    if (countEl) countEl.textContent = `${data.length} active member${data.length === 1 ? '' : 's'}`;

    // Build a map of candidate_id → sponsor name
    const sponsorMap = {};
    (sponsorships || []).forEach(s => {
        if (s.candidate_id) sponsorMap[s.candidate_id] = s.sponsor?.display_name || null;
    });

    el.innerHTML = data.map(m => {
        const sponsor = sponsorMap[m.user_id];
        const isCreator = m.user_id === selectedGroup.created_by;
        const sponsorLabel = isCreator ? 'founder' : (sponsor ? `sponsored by ${esc(sponsor)}` : '');
        const displayName = m.profiles?.display_name || 'Unknown';
        const avatarHtml = m.avatar_url
            ? `<img class="member-avatar" src="${esc(m.avatar_url)}" alt="">`
            : `<div class="member-avatar-placeholder">${esc(displayName.charAt(0).toUpperCase())}</div>`;
        return `<div class="member-item">
            ${avatarHtml}
            <span class="member-name">${esc(displayName)}</span>
            ${sponsorLabel ? `<span class="member-sponsor">${sponsorLabel}</span>` : ''}
        </div>`;
    }).join('');
}
