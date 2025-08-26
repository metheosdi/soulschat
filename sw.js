// Service Worker MÍNIMO para PWA - NÃO INTERFERE EM NADA
const CACHE_NAME = 'souls-chat-static-v1';

// Instalação - cache apenas dos arquivos estáticos ESSENCIAIS
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll([
          '/',
          '/index.html',
          '/manifest.json'
          // NÃO cachear icons para evitar problemas
        ]);
      })
      .then(() => self.skipWaiting())
  );
  console.log('✅ SW instalado');
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - NÃO cachear nada dinâmico!
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // NUNCA cachear Socket.io, APIs ou dados dinâmicos
  if (url.pathname.includes('/socket.io/') || 
      url.pathname.includes('/api/') ||
      event.request.method !== 'GET') {
    return fetch(event.request);
  }
  
  // Para arquivos estáticos, tenta cache primeiro
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});
