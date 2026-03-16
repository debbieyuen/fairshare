function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let _versionFloaterTimeout = null;
function toggleVersionFloater(e) {
    e.preventDefault();
    const el = document.getElementById('versionFloater');
    if (!el) return;
    if (!el.classList.contains('hidden')) {
        el.classList.add('hidden');
        clearTimeout(_versionFloaterTimeout);
        return;
    }
    el.classList.remove('hidden');
    clearTimeout(_versionFloaterTimeout);
    _versionFloaterTimeout = setTimeout(() => el.classList.add('hidden'), 3000);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
