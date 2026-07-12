const CACHE_NAME = 'i-luv-pen-v3'
const URLS_TO_CACHE = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)))
  self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const isApiRequest = url.pathname.includes('/api/')
  const isDataJson = url.pathname.includes('/data/') && url.pathname.endsWith('.json')
  const isStaticAsset = url.pathname.includes('/assets/')

  // Keep DB/API and JSON data fresh across devices.
  if (isApiRequest || isDataJson) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }

  // Always prefer network for versioned build assets to avoid stale UI copy.
  if (isStaticAsset) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response
      return fetch(event.request)
        .then((networkResponse) => {
          const clone = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return networkResponse
        })
        .catch(() => caches.match('./index.html'))
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key)
          return null
        }),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url
  if (!targetUrl) return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
      return null
    }),
  )
})
