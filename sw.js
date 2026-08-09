// JOYZWORK Service Worker - PWA 离线支持 + Web Push v22
const CACHE_NAME = 'joyzwork-v22';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/supabase-sync.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy: always fetch fresh content, fall back to cache when offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Same-origin requests (our app files): network-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  // Cross-origin requests: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => response).catch(() => cached);
    })
  );
});

/* ============================================================
   Web Push — 接收推送并显示系统通知
   ============================================================ */
self.addEventListener('push', (event) => {
  let data = { title: 'JOYZWORK', body: '你有新的提醒' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="40" fill="%236366f1"/%3E%3Ctext x="96" y="130" font-size="100" font-weight="800" fill="white" text-anchor="middle" font-family="sans-serif"%3EJ%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="20" fill="%236366f1"/%3E%3Ctext x="48" y="65" font-size="50" font-weight="800" fill="white" text-anchor="middle" font-family="sans-serif"%3EJ%3C/text%3E%3C/svg%3E',
    tag: data.tag || 'joyzwork-push',
    requireInteraction: data.requireInteraction || false,
    data: { url: data.url || './index.html' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ============================================================
   通知点击 — 聚焦或打开应用
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 尝试聚焦已打开的窗口
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // 没有打开的窗口则打开新窗口
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
