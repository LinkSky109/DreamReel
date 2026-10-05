/**
 * R19：DreamReel Service Worker
 * 离线应用外壳（app shell）缓存
 */
const CACHE_VERSION = 'dreamreel-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/i18n.js',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // 仅处理 GET；API 请求不缓存（网络优先）
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    // API：网络优先，失败时不返回缓存（避免脏数据）
    return
  }
  // 静态资源：缓存优先，回退网络并缓存
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((resp) => {
          if (resp.ok && url.origin === self.location.origin) {
            const copy = resp.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
          }
          return resp
        })
        .catch(() => caches.match('/index.html'))
    })
  )
})
