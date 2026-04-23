// Remember where the contacts list was scrolled to when the user opened a
// contact's detail screen, so we can put them back in the same spot on return.
// The contacts list and contact-details screens are siblings inside
// .main-content and the page itself is what scrolls, so without this the
// detail screen would inherit whatever scrollY the list happened to have.
let _contactsScrollY = 0;

function navigateTo(view, arg) {
    if (!currentUser) return;

    if (activeMainView === 'contacts' && view === 'contactDetails') {
        _contactsScrollY = window.scrollY || window.pageYOffset || 0;
    }

    activeMainView = view;

    const contactsScreen = document.getElementById('contactsScreen');
    const groupsContent = document.getElementById('groupsContent');
    const profileScreen = document.getElementById('profileScreen');
    const contactDetailsScreen = document.getElementById('contactDetailsScreen');
    const globeScreen = document.getElementById('globeScreen');

    contactsScreen.classList.add('hidden');
    groupsContent.classList.add('hidden');
    profileScreen.classList.add('hidden');
    if (contactDetailsScreen) contactDetailsScreen.classList.add('hidden');
    if (globeScreen) globeScreen.classList.add('hidden');

    switch (view) {
        case 'contacts': {
            contactsScreen.classList.remove('hidden');
            bindContactsSearchInput();
            bindContactsSortButton();
            const targetY = _contactsScrollY;
            // Restore immediately so the existing DOM doesn't flash at the top,
            // then again after the async reload completes in case the rendered
            // height changed.
            window.scrollTo(0, targetY);
            requestAnimationFrame(() => window.scrollTo(0, targetY));
            const p = loadAndRenderContactList();
            if (p && typeof p.then === 'function') {
                p.then(() => window.scrollTo(0, targetY)).catch(() => {});
            }
            break;
        }
        case 'groups':
            groupsContent.classList.remove('hidden');
            renderGroupList();
            break;
        case 'profile':
            profileScreen.classList.remove('hidden');
            renderProfileScreen();
            break;
        case 'contactDetails':
            if (contactDetailsScreen) {
                contactDetailsScreen.classList.remove('hidden');
                openContactDetailsScreen(arg);
                // Always start at the hero card. Two passes handle the case
                // where async hydration (selfies, history) bumps page height.
                window.scrollTo(0, 0);
                requestAnimationFrame(() => window.scrollTo(0, 0));
            }
            break;
        case 'globe':
            if (globeScreen) {
                globeScreen.classList.remove('hidden');
                window.scrollTo(0, 0);
                if (typeof openGlobeScreen === 'function') openGlobeScreen();
            }
            break;
    }

    updateBottomBarActive(view);
}

function updateBottomBarActive(view) {
    document.querySelectorAll('.bottom-bar-btn[data-view]').forEach(btn => {
        // Contact Details is logically a child of the Contacts tab, so keep
        // the Contacts button highlighted while it's open.
        const target = view === 'contactDetails' ? 'contacts' : view;
        btn.classList.toggle('active', btn.dataset.view === target);
    });
}
