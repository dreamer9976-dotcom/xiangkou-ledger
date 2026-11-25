// 讓 app 沒網路也打得開（帳另外存在手機，有網路再傳）
const C = "xiangkou-v" + "35";
const FILES = ["./", "index.html", "app.js?v=" + "35", "manifest.json", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // 先用手機裡存好的（打開很快），同時在背景抓新的存起來；新版由 app 自己檢查後重新載入
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request, {cache: "no-store"}).then(r => { if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); } return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => caches.match("./"));
  }));
});
