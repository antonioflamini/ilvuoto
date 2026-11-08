/* La Stanza offline: pagina, testi e codice si aggiornano dalla rete quando c'è, altrimenti si usa l'ultima copia salvata.
   Quando si cambia questo file, alzare il numero della cache. */
const CACHE = "ilvuoto-v5";
const CORE = ["./", "stile.css", "testi.js", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

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
  if (url.origin !== location.origin) return;                // Amazon, Instagram, statistiche: sempre dalla rete
  const fresh = req.mode === "navigate" || /\/$|\.(html|js|css|json|webmanifest)$/.test(url.pathname);
  if (fresh) {
    // prima la rete, senza la cache del browser, così gli aggiornamenti arrivano subito; senza rete, la copia
    const key = req.mode === "navigate" ? new URL("./", location.href).href : url.origin + url.pathname;
    e.respondWith(fetch(url.href, {cache: "no-cache", credentials: "same-origin"})
      .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(key, c)); } return r; })
      .catch(() => caches.match(key).then(hit => hit || caches.match(new URL("./", location.href).href))));
    return;
  }
  // immagini, suoni e font: prima la copia, poi la rete
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  })));
});
