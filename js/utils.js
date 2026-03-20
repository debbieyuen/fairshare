function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Appends a query param so replaced storage objects (same public URL) still load fresh bytes. */
function withImageCacheBust(url, token) {
    if (!url || token == null || token === '') return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'v=' + encodeURIComponent(String(token));
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

const INSTALL_HINT_SESSION_KEY = 'union_install_hint_dismissed';
let _installHintCloseBound = false;

function isStandaloneApp() {
    const standaloneMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    return Boolean(standaloneMedia || iosStandalone);
}

function isMobileBrowser() {
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const ua = window.navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    return Boolean(coarsePointer || mobileUA);
}

function shouldShowInstallHintThisSession() {
    try {
        return sessionStorage.getItem(INSTALL_HINT_SESSION_KEY) !== '1';
    } catch (e) {
        console.warn('Install hint session storage unavailable:', e);
        return true;
    }
}

function markInstallHintDismissedForSession() {
    try {
        sessionStorage.setItem(INSTALL_HINT_SESSION_KEY, '1');
    } catch (e) {
        console.warn('Could not persist install hint dismissal:', e);
    }
}

function dismissInstallHintFloater() {
    const floater = document.getElementById('installHintFloater');
    if (!floater) return;
    floater.classList.add('hidden');
    markInstallHintDismissedForSession();
}

function showInstallHintFloater() {
    const floater = document.getElementById('installHintFloater');
    const message = document.getElementById('installHintMessage');
    const closeBtn = document.getElementById('installHintCloseBtn');
    if (!floater || !message) return;

    const isMobile = isMobileBrowser();
    message.textContent = isMobile
        ? `Install ${APP_NAME} to homescreen to get notifications`
        : `Install ${APP_NAME} as desktop icon to get notifications`;

    if (isMobile) {
        floater.style.left = '';
        floater.style.right = '';
    } else {
        floater.style.left = '50vw';
        floater.style.right = 'auto';
    }
    floater.classList.remove('hidden');

    if (closeBtn && !_installHintCloseBound) {
        closeBtn.addEventListener('click', dismissInstallHintFloater);
        _installHintCloseBound = true;
    }
}

function maybeShowInstallHintFloater() {
    if (isStandaloneApp()) return;
    if (!shouldShowInstallHintThisSession()) return;
    showInstallHintFloater();
}
