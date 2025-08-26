const CACHE_NAME = 'souls-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Service Worker mínimo - apenas para instalação PWA
self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('✅ Service Worker instalado');
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Intercepta requisições
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/socket.io/')) {
    // Não cachear conexões socket.io
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retorna do cache ou faz fetch
        return response || fetch(event.request);
      })
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

});
