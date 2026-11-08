/* La Stanza offline: la pagina si aggiorna dalla rete quando c'è, altrimenti usa l'ultima copia salvata. */
const CACHE = "ilvuoto-v3";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;          // Amazon, Instagram...: sempre dalla rete
  if (req.mode === "navigate" || (sameOrigin && /\/(index\.html)?$/.test(url.pathname))) {
    // la pagina: prima la rete (così gli aggiornamenti arrivano subito), poi la copia
    e.respondWith(fetch(req, {cache: "no-cache"}).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put("index.html", c)); } return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  // icone e font: prima la copia, poi la rete
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && (r.ok || r.type === "opaque")) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  })));
});
