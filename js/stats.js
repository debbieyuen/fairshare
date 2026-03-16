async function loadStatsContent() {
    if (!selectedGroup) return;
    const el = document.getElementById('statsContent');
    if (!el) return;

    const [{ count: memberCount }, { data: members }, { count: txCount }, { count: pendingCount }] = await Promise.all([
        db.from('members').select('*', { count: 'exact', head: true })
            .eq('group_id', selectedGroup.id).eq('status', 'active'),
        db.from('members').select('balance')
            .eq('group_id', selectedGroup.id).eq('status', 'active'),
        db.from('transactions').select('*', { count: 'exact', head: true })
            .eq('group_id', selectedGroup.id),
        db.from('members').select('*', { count: 'exact', head: true })
            .eq('group_id', selectedGroup.id).eq('status', 'pending')
    ]);

    const totalSupply = (members || []).reduce((sum, m) => sum + Number(m.balance), 0);

    // 30-day fee sum (fees from person-to-person transactions)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentTx } = await db
        .from('transactions')
        .select('fee, amount, from_user')
        .eq('group_id', selectedGroup.id)
        .gte('created_at', thirtyDaysAgo);

    const fees30 = (recentTx || [])
        .filter(tx => tx.from_user !== null)
        .reduce((sum, tx) => sum + Number(tx.fee), 0);

    const income30 = (recentTx || [])
        .filter(tx => tx.from_user === null)
        .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const sym = selectedGroup.currency_symbol;
    el.innerHTML = `
        <div class="stats-grid">
            <div class="info-item"><div class="info-label">Active Members</div><div class="info-value">${memberCount || 0}</div></div>
            <div class="info-item"><div class="info-label">Pending Candidates</div><div class="info-value">${pendingCount || 0}</div></div>
            <div class="info-item"><div class="info-label">Total Supply</div><div class="info-value">${sym} ${totalSupply.toFixed(2)}</div></div>
            <div class="info-item"><div class="info-label">Total Transactions</div><div class="info-value">${txCount || 0}</div></div>
            <div class="info-item"><div class="info-label">Fee Rate</div><div class="info-value">${(Number(selectedGroup.fee_rate) * 100).toFixed(1)}%</div></div>
            <div class="info-item"><div class="info-label">Daily Income</div><div class="info-value">${sym} ${Number(selectedGroup.daily_income).toFixed(2)}</div></div>
            <div class="info-item"><div class="info-label">30 Day Fees</div><div class="info-value">${sym} ${fees30.toFixed(2)}</div></div>
            <div class="info-item"><div class="info-label">30 Day Income</div><div class="info-value">${sym} ${income30.toFixed(2)}</div></div>
        </div>
    `;
}
