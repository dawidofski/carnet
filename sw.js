/* Mi Carnet service worker.
   App shell + content JSON are precached so the whole app works offline.
   Question photos are cached as they are seen, with a size cap. */

const VERSION = "v6";
const SHELL = `micarnet-shell-${VERSION}`;
const DATA = `micarnet-data-${VERSION}`;
const MEDIA = `micarnet-media-${VERSION}`;
const MEDIA_MAX = 900;

const base = new URL("./", self.location).pathname;
const p = (f) => base + f;

const SHELL_FILES = [
  "", "index.html", "manifest.webmanifest", "icon.svg",
  "app/style.css", "app/main.js",
  "app/lib/db.js", "app/lib/fsrs.js", "app/lib/content.js", "app/lib/session.js",
  "app/lib/classify.js", "app/lib/speech.js",
  "app/ui/common.js", "app/ui/player.js", "app/ui/path.js", "app/ui/home.js",
  "app/ui/vocab.js", "app/ui/stats.js", "app/ui/settings.js", "app/ui/exam.js",
  "app/vendor/preact.mjs", "app/vendor/hooks.mjs", "app/vendor/htm.mjs", "app/vendor/dexie.mjs",
].map(p);

const DATA_FILES = [
  "topics", "terms", "sentences", "questions", "grammar",
  "comprehension", "lexicon", "meta",
].map((n) => p(`app/data/${n}.json`));

/* cache.add() refuses some requests depending on the browser, and a single
   rejection would silently leave the shell incomplete — so fetch and put
   explicitly, and report what could not be stored. */
async function precache(cacheName, urls) {
  const c = await caches.open(cacheName);
  const failed = [];
  await Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(u, { cache: "reload", credentials: "same-origin" });
      if (!r.ok) throw new Error(r.status);
      await c.put(u, r.clone());
    } catch (err) {
      failed.push(u);
    }
  }));
  if (failed.length) console.warn("[sw] not precached:", failed);
  return failed;
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    await precache(SHELL, SHELL_FILES);
    await precache(DATA, DATA_FILES);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, MEDIA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimMedia() {
  const c = await caches.open(MEDIA);
  const keys = await c.keys();
  if (keys.length <= MEDIA_MAX) return;
  for (const k of keys.slice(0, keys.length - MEDIA_MAX)) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // navigations: serve the shell so deep links and offline reloads work
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const c = await caches.open(SHELL);
        const hit = (await c.match(p("index.html"))) ||
                    (await c.match(p(""))) ||
                    (await c.match(base)) ||
                    (await c.match(new Request(p("index.html"))));
        return hit || new Response(
          "<h1>Sin conexión</h1><p>Vuelve a abrir la aplicación cuando tengas red una vez más.</p>",
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // content JSON: cache first, refresh in the background
  if (url.pathname.includes("/app/data/")) {
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // question photos: cache on first view, capped
  if (url.pathname.includes("/media/")) {
    e.respondWith((async () => {
      const c = await caches.open(MEDIA);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok) { await c.put(req, r.clone()); trimMedia(); }
        return r;
      } catch {
        return new Response("", { status: 504 });
      }
    })());
    return;
  }

  // app shell: serve from cache for speed, refresh in the background so the
  // next load picks up a new version without waiting for a cache-name bump
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req);
    const net = fetch(req)
      .then((r) => {
        if (r.ok && url.pathname.startsWith(base)) c.put(req, r.clone());
        return r;
      })
      .catch(() => null);
    if (hit) {
      e.waitUntil(net);
      return hit;
    }
    return (await net) || Response.error();
  })());
});
