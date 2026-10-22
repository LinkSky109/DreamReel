/**
 * DreamReel Service Worker
 * 策略：
 * - 导航请求：网络优先，离线回退缓存的 index.html
 * - /assets/ 哈希产物：缓存优先（文件名含内容哈希，可长期缓存）
 * - 其他同源静态资源：网络优先，成功写入缓存，离线回退
 * - API / storage / 非 GET / 跨域：完全交给浏览器
 *
 * 发布新版本时 bump CACHE_VERSION。
 */
const CACHE_VERSION = 'dreamreel-v7'
const CACHE_PREFIX = 'dreamreel-'
const OFFLINE_URL = '/index.html'
const APP_SHELL = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
  '/css/style.css',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return
  if (url.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_URL))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(CACHE_VERSION)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)
      if (fallback) return fallback
    }
    throw error
  }
}
