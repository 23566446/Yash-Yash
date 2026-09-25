const CACHE_NAME = 'yashyash-v13';
const ASSETS = [
    './',
    './index.html',
    './login.html',
    './register.html',
    './create-trip.html',
    './past-trip.html',
    './user.html',
    './license-manager.html',
    './trip-details.html',
    './trip-chat.html',
    './trip-ledger.html',
    './trip-album.html',
    './trip-ai.html',
    './offline.html',
    './css/style.css',
    './css/style-login.css',
    './css/album.css',
    './css/ledger.css',
    './js/main.js',
    './js/auth.js',
    './js/api.js',
    './js/chat-utils.js',
    './js/config.js',
    './js/image-utils.js',
    './js/realtime.js',
    './js/settlement.js',
    './js/ui.js',
    './js/maps-loader.js',
    './js/past-trip.js',
    './js/photo-utils.js',
    './js/pwa.js',
    './js/trip-album.js',
    './js/trip-ai.js',
    './js/trip-chat.js',
    './js/trip-details.js',
    './js/trip-ledger.js',
    './js/trip-nav.js',
    './js/user.js',
    './manifest.json',
    './calendar.png',
    './img/default-avatar.svg'
];

// 1. 安裝 Service Worker 並快取基本靜態資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// 2. 導航採網路優先；第一方靜態殼層採快取優先
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.includes('/api/') || url.pathname.includes('/socket.io/')) return;

    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(event.request);
                if (!response.ok) throw new Error('Navigation unavailable');
                const cache = await caches.open(CACHE_NAME);
                await cache.put(new Request(`${url.origin}${url.pathname}`), response.clone()).catch(() => {});
                return response;
            } catch (error) {
                return await caches.match(event.request, { ignoreSearch: true }) || await caches.match('./offline.html');
            }
        })());
        return;
    }

    event.respondWith(caches.match(event.request).then(cachedResponse => cachedResponse || fetch(event.request)));
});

// 3. 啟動並清理舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
