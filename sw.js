// 讓 app 沒網路也打得開（帳另外存在手機，有網路再傳）
const C = "xiangkou-v" + "27";
const FILES = ["./", "index.html", "app.js?v=" + "27", "manifest.json", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // 頁面本身每次都向網站要最新的（不用手機暫存），沒網路才用存起來的
  const fresh = e.request.mode === "navigate" || u.pathname.endsWith("/") || u.pathname.endsWith(".html") || u.pathname.endsWith("app.js");
  e.respondWith(fetch(e.request, fresh ? {cache: "no-store"} : {}).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
});
