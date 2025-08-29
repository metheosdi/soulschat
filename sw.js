// sw.js - Service Worker para PWA
const CACHE_NAME = 'souls-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Ativação
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch (cache first, then network)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Nova mensagem no chat Souls',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'souls-chat',
    actions: [
      { action: 'view', title: 'Abrir Chat' },
      { action: 'dismiss', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '💬 Chat Souls', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
