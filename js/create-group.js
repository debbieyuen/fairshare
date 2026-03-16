async function createGroup(e) {
    e.preventDefault();
    const name = document.getElementById('newGroupName').value.trim();
    const currencyName = document.getElementById('newCurrencyName').value.trim();
    const currencySymbol = document.getElementById('newCurrencySymbol').value.trim();

    // Generate default constitution
    const defaultConstitution = 'We, the people, hereby give this Group Name: ' + name + ' $GROUP_NAME\n\nIn economic matters, we choose the Currency Name: ' + currencyName + ' $CURRENCY_NAME, and the Currency Symbol: ' + currencySymbol + ' $CURRENCY_SYMBOL, and to Change Currency Rates: 66% $CHANGE_CURRENCY_RATES_PERCENTAGE of member\'s vote is required.\n\nTo Approve New Member: 100% $NEW_MEMBER_PERCENTAGE of member\'s vote is required.\n\nAny member may propose amendment to this constitution. To Approve Amendment: 100% $AMENDMENT_PERCENTAGE of member\'s vote is required.';

    // Create the group
    const { data: group, error: groupError } = await db
        .from('groups')
        .insert({
            name,
            currency_name: currencyName,
            currency_symbol: currencySymbol,
            constitution: defaultConstitution,
            created_by: currentUser.id
        })
        .select()
        .single();

    if (groupError) {
        console.error('createGroup error:', groupError);
        showToast(groupError.message, 'error');
        return;
    }

    // Add creator as active member
    const { error: memberError } = await db
        .from('members')
        .insert({
            group_id: group.id,
            user_id: currentUser.id,
            status: 'active',
            balance: 0
        });

    if (memberError) {
        console.error('createGroup member error:', memberError);
        showToast(memberError.message, 'error');
        return;
    }

    showToast(`Group "${name}" created!`, 'success');
    closeModal();
    await loadMyGroups(group.id);
}
