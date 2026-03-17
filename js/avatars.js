function setGroupAvatar(url) {
    const el = document.getElementById('groupAvatarImg');
    if (!el) return;
    if (url) {
        // Replace placeholder with actual img
        const parent = el.parentElement;
        const img = document.createElement('img');
        img.className = 'group-avatar';
        img.id = 'groupAvatarImg';
        img.src = url;
        img.alt = 'Group logo';
        parent.replaceChild(img, el);
    } else {
        // Show placeholder
        if (el.tagName === 'IMG') {
            const parent = el.parentElement;
            const placeholder = document.createElement('div');
            placeholder.className = 'group-avatar-placeholder';
            placeholder.id = 'groupAvatarImg';
            placeholder.textContent = '👥';
            parent.replaceChild(placeholder, el);
        }
    }
}

function setHeaderAvatar(url) {
    const el = document.getElementById('headerAvatar');
    if (!el) return;
    if (url) {
        el.src = url;
        el.classList.remove('hidden');
    } else {
        el.src = '';
        el.classList.add('hidden');
    }
}
