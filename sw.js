// sw.js - Service Worker APENAS para limpar cache
self.addEventListener('install', (event) => {
    console.log('🔥 SW instalado - limpando caches');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log('🗑️ Removendo cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 🔥 IMPORTANTE: NÃO intercepta NENHUMA requisição
self.addEventListener('fetch', (event) => {
    // Deixa TUDO passar direto - não mexe em nada
    return fetch(event.request);
});
