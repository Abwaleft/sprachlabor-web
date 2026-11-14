// Service worker de Sprachlabor (GitHub Pages: archivos estáticos, sin servidor propio).
// `scripts/publicar.py` reemplaza VERSION (hash del contenido) y ARCHIVOS antes de cada publicación.
//
// - Cascarón (HTML, CSS, JS, manifest, íconos, instrucciones y schemas del tutor): precacheado por versión, servido
//   desde la caché; las versiones viejas se borran al activar y la app recarga sola cuando toma el control una nueva.
// - Librerías de CDN (piper-tts-web, onnxruntime-web, transformers.js): caché «al primer uso» (sl-libs), así la app
//   arranca sin internet una vez que se usaron. Los modelos (voz en OPFS, Whisper en la caché del navegador) los
//   guardan las propias librerías.
// - API de Claude y GitHub: nunca pasan por la caché.

const VERSION = "__VERSION__";
const ARCHIVOS = __ARCHIVOS__;
const SHELL = `sl-shell-${VERSION}`;
const LIBS = "sl-libs";
const CDN = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"];
const BASE = new URL("./", self.location.href).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ARCHIVOS.map((a) => BASE + a))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("sl-shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.anthropic.com" || url.hostname === "api.github.com" || url.hostname === "huggingface.co") return;
  if (CDN.includes(url.hostname)) { e.respondWith(libCacheFirst(req)); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.endsWith("/sw.js")) return;
  e.respondWith(shellCacheFirst(req));
});

async function libCacheFirst(req) {
  const c = await caches.open(LIBS);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && (r.type === "basic" || r.type === "cors")) c.put(req, r.clone()).catch(() => {});
  return r;
}

async function shellCacheFirst(req) {
  const c = await caches.open(SHELL);
  const url = new URL(req.url);
  const key = req.mode === "navigate" || url.pathname === BASE ? BASE + "index.html" : url.pathname;
  const hit = await c.match(key);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok && req.mode !== "navigate") c.put(key, r.clone()).catch(() => {});
    return r;
  } catch (err) {
    if (req.mode === "navigate") {
      const index = await c.match(BASE + "index.html");
      if (index) return index;
    }
    throw err;
  }
}
