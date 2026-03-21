// FamFi Service Worker — minimal for PWA installability + offline shell
const CACHE_NAME = 'famfi-v1'
const OFFLINE_URL = '/offline'

// Pre-cache the offline fallback during install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  )
  self.skipWaiting()
})

// Clean up old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  )
  self.clients.claim()
})

// Network-first strategy: try network, fall back to cache
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(OFFLINE_URL)
        .then((cached) => cached || new Response('Offline', { status: 503 }))
    )
  )
})
