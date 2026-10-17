/**
 * R19：DreamReel Service Worker
 * 离线应用外壳（app shell）缓存。
 *
 * 注意：静态资源改为「网络优先」——缓存优先会导致改完代码后页面一直用旧 JS（看不到更新）。
 * 网络优先 + 缓存回退：联网时永远拿最新，离线时回退到缓存。
 */
const CACHE_VERSION = 'dreamreel-v2'
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
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // 跨域、API、媒体文件：交给浏览器（不经过 SW 缓存）
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return

  // 静态资源 / 导航：网络优先，失败回退缓存（离线可用）
  event.respondWith(
    fetch(request)
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {})
        }
        return resp
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  )
})
