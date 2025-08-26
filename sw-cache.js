// Service Worker para limpar caches antigos
self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('🔄 Service Worker instalado - limpando caches');
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});