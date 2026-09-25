(function registerServiceWorker() {
    let lastOnlineState = navigator.onLine;
    let statusTimer;

    function showConnectionStatus(message, online) {
        let banner = document.getElementById('pwa-connection-status');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pwa-connection-status';
            banner.setAttribute('role', 'status');
            banner.setAttribute('aria-live', 'polite');
            banner.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10000;padding:10px 14px;border-radius:9px;color:white;max-width:90%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.18);';
            document.body.appendChild(banner);
        }
        clearTimeout(statusTimer);
        banner.style.background = online ? '#6b8051' : '#a65252';
        banner.textContent = message;
        banner.hidden = false;
        if (online) statusTimer = setTimeout(() => { banner.hidden = true; }, 3500);
    }

    function updateConnectionStatus(online) {
        if (online === lastOnlineState) return;
        lastOnlineState = online;
        showConnectionStatus(online ? '網路已恢復' : '目前離線，部分即時功能無法使用', online);
    }

    window.addEventListener('offline', () => updateConnectionStatus(false));
    window.addEventListener('online', () => updateConnectionStatus(true));
    if (!navigator.onLine) {
        lastOnlineState = null;
        updateConnectionStatus(false);
    }

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        const basePath = window.location.pathname.includes('/Yash-Yash/') ? '/Yash-Yash/' : './';
        navigator.serviceWorker.register(`${basePath}sw.js`)
            .then(registration => console.log('PWA Ready! Scope:', registration.scope))
            .catch(error => console.warn('PWA registration failed:', error));
    });
}());
