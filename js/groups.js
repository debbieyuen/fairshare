async function loadMyGroups(autoNavigateGroupId) {
    // Verify session is still valid before fetching data
    // Use timeout guard in case Supabase client is hung
    const { data: { session } } = await getSessionWithTimeout();
    if (!session) {
        showToast('Session expired — please log in again.', 'error');
        await logout();
        return;
    }

    const { data, error } = await db
        .from('members')
        .select('*, groups(*)')
        .eq('user_id', currentUser.id)
        .in('status', ['active', 'pending']);

    if (error) { showToast('Failed to load groups', 'error'); return; }
    myGroups = data || [];

    // Fetch member counts for each group
    const groupIds = myGroups.map(m => m.group_id);
    if (groupIds.length > 0) {
        const { data: counts } = await db
            .from('members')
            .select('group_id')
            .in('group_id', groupIds)
            .eq('status', 'active');
        const countMap = {};
        (counts || []).forEach(r => { countMap[r.group_id] = (countMap[r.group_id] || 0) + 1; });
        myGroups.forEach(m => { m._memberCount = countMap[m.group_id] || 0; });
    }

    renderGroupList();

    // If a specific group was requested (e.g. from sponsorship), navigate there
    if (autoNavigateGroupId) {
        const target = myGroups.find(m => m.group_id === autoNavigateGroupId);
        if (target) { selectGroup(target.groups, target); return; }
    }

    // Re-select current group if still valid, or restore last viewed group
    if (selectedGroup) {
        const still = myGroups.find(m => m.group_id === selectedGroup.id);
        if (still) {
            selectGroup(still.groups, still);
        } else {
            selectedGroup = null;
            showGroupsList();
        }
    } else if (currentProfile?.last_group_id) {
        const last = myGroups.find(m => m.group_id === currentProfile.last_group_id);
        if (last) {
            selectGroup(last.groups, last);
        } else {
            showGroupsList();
        }
    } else {
        showGroupsList();
    }
}

function renderGroupList() {
    const el = document.getElementById('groupList');
    const hint = document.getElementById('groupsEmptyHint');
    if (myGroups.length === 0) {
        el.innerHTML = '';
        hint.classList.remove('hidden');
        return;
    }
    hint.classList.add('hidden');
    el.innerHTML = myGroups.map(m => `
        <div class="group-card" onclick="selectGroupById('${m.group_id}')">
            <div>
                <div class="group-card-name">
                    ${esc(m.groups.name)}
                    ${m.status === 'pending' ? '<span class="group-card-status">pending</span>' : ''}
                </div>
                <div class="group-card-meta">${m._memberCount || 0} member${m._memberCount === 1 ? '' : 's'}</div>
            </div>
            <div class="group-card-arrow">›</div>
        </div>
    `).join('');
}

function selectGroupById(groupId) {
    const membership = myGroups.find(m => m.group_id === groupId);
    if (membership) selectGroup(membership.groups, membership);
}

async function selectGroup(group, membership) {
    selectedGroup = group;
    document.getElementById('groupsScreen').classList.add('hidden');
    document.getElementById('groupView').classList.remove('hidden');

    // Remember this group for next visit
    if (currentProfile?.last_group_id !== group.id) {
        currentProfile.last_group_id = group.id;
        db.from('profiles').update({ last_group_id: group.id }).eq('id', currentUser.id).then();
    }

    // Subscribe to realtime events for this group
    subscribeToGroup(group.id);

    // Show group name at top
    document.getElementById('groupNameDisplay').textContent = group.name;

    // Set avatar for this group membership
    setGroupAvatar(membership.avatar_url || null);
    setHeaderAvatar(membership.avatar_url || null);

    if (membership.status === 'pending') {
        document.getElementById('tabBar').classList.add('hidden');
        document.getElementById('tabContent').innerHTML =
            '<p style="color:var(--dark-gray);padding:1rem;">Your candidacy is being reviewed by the group members. ' +
            'You will gain access once enough members have endorsed you.</p>';
        document.getElementById('activityLog').classList.add('hidden');
        return;
    }

    document.getElementById('tabBar').classList.remove('hidden');
    document.getElementById('activityLog').classList.remove('hidden');

    // Render current tab
    await switchTab(activeTab);

    // Claim daily income if 24h+ since last claim
    if (membership.status === 'active' && Number(group.daily_income) > 0) {
        try {
            const { data: incomeResult } = await db.rpc('claim_daily_income', { p_group_id: group.id });
            if (incomeResult?.claimed) {
                membership.balance = Number(membership.balance) + Number(incomeResult.amount);
                const balEl = document.getElementById('balanceAmount');
                if (balEl) balEl.textContent =
                    `${group.currency_symbol} ${Number(incomeResult.new_balance).toFixed(2)}`;
                showToast(`Daily income: +${group.currency_symbol} ${Number(incomeResult.amount).toFixed(2)}`, 'success');
            }
        } catch (e) {
            console.error('Daily income claim error:', e);
        }
    }

    await loadActivityLog();
}

function showGroupsList() {
    document.getElementById('groupsScreen').classList.remove('hidden');
    document.getElementById('groupView').classList.add('hidden');
    selectedGroup = null;
    setHeaderAvatar(null); // hide avatar when not in a group
    // Unsubscribe from realtime when leaving a group
    if (groupChannel) {
        db.removeChannel(groupChannel);
        groupChannel = null;
    }
    renderGroupList();
}
