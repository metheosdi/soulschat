// Service Worker SUPER SIMPLES - apenas para instalação PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('✅ SW instalado (modo minimalista)');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// NÃO intercepta nenhuma requisição - deixa tudo passar
self.addEventListener('fetch', (event) => {
  return fetch(event.request);
});
