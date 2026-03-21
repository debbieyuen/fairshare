function navigateTo(view) {
    if (!currentUser) return;
    activeMainView = view;

    const contactsScreen = document.getElementById('contactsScreen');
    const groupsContent = document.getElementById('groupsContent');
    const profileScreen = document.getElementById('profileScreen');

    contactsScreen.classList.add('hidden');
    groupsContent.classList.add('hidden');
    profileScreen.classList.add('hidden');

    switch (view) {
        case 'contacts':
            contactsScreen.classList.remove('hidden');
            bindContactsSearchInput();
            loadAndRenderContactList();
            break;
        case 'groups':
            groupsContent.classList.remove('hidden');
            renderGroupList();
            break;
        case 'profile':
            profileScreen.classList.remove('hidden');
            renderProfileScreen();
            break;
    }

    updateBottomBarActive(view);
}

function updateBottomBarActive(view) {
    document.querySelectorAll('.bottom-bar-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
}
