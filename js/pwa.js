(function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        const basePath = window.location.pathname.includes('/Yash-Yash/') ? '/Yash-Yash/' : './';
        navigator.serviceWorker.register(`${basePath}sw.js`)
            .then(registration => console.log('PWA Ready! Scope:', registration.scope))
            .catch(error => console.warn('PWA registration failed:', error));
    });
}());
