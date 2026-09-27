/* Folio service worker. Network first so updates show up right away; the cache is
   only a fallback, which lets the app open without a connection after one visit. */
const CACHE = 'folio-v2'
const CORE = [
  'app.html',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/views.css',
  'css/landing.css',
  'js/util.js',
  'js/emoji.js',
  'js/store.js',
  'js/planner.js',
  'js/md.js',
  'js/seed.js',
  'js/ui.js',
  'js/highlight.js',
  'js/database.js',
  'js/editor.js',
  'js/templates.js',
  'js/kit.js',
  'js/tasks.js',
  'js/focus.js',
  'js/calendar.js',
  'js/dashboard.js',
  'js/projects.js',
  'js/habits.js',
  'js/timeline.js',
  'js/app.js',
  'js/landing.js',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/shot-dashboard.jpg',
  'img/shot-dashboard-dark.jpg',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)
  if (url.origin !== self.location.origin && !fonts) return
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone()
          caches.open(CACHE).then(cache => cache.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('app.html') : Response.error()))
      )
  )
})
