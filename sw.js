const CACHE_NAME = 'yashyash-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/register.html',
    '/css/style.css',
    '/css/style-login.css',
    '/js/main.js',
    '/js/auth.js',
    '/manifest.json',
    '/calendar.png'
];

// 1. 安裝 Service Worker 並快取基本靜態資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// 2. 攔截請求：先找快取，找不到再去網路抓
self.addEventListener('fetch', (event) => {
    // 排除 API 請求的快取（確保每次抓到最新資料庫資料）
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
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
        })
    );
});
