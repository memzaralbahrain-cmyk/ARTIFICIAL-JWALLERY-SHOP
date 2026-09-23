/* Al Memzar Star Jewellery - service worker (offline catalog + push) */
const V = "memzar-v1";
const CORE = ["./", "index.html", "manifest.json", "privacy.html", "products.txt",
              "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const IMG_LIMIT = 300;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > IMG_LIMIT + CORE.length) {
    await cache.delete(keys[CORE.length]);
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isPage = req.mode === "navigate" || /\.(html|txt|json)$/i.test(url.pathname) || url.pathname.endsWith("/");

  if (isPage) {
    // network first, so product updates show up; fall back to cache when offline
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // images and other files: cache first, refresh in background
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(req, copy).then(() => trim(c)));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

/* push notifications (works once a push server sends messages) */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Al Memzar Star Jewellery", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow(target);
  }));
});
