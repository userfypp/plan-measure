// Plan Measure service worker. The build (scripts/serviceWorker.ts) fills the three constants
// below and emits the result as `sw.js` at the root of the output.
//
// - Navigations: network first with a short timeout, then the `index.html` precached by THIS
//   version. The network page is never stored, so the cached page always matches its cached assets.
// - Other same-origin GETs: this version's precache, then the run-time caches, then the network.
//   Hashed assets are stored in the version's run-time cache; the versioned pdf.js resources
//   (CMaps, WASM, fonts, ICC) in a cache that outlives builds and keeps only the current version.
// - No skipWaiting() or clients.claim(): a new worker takes over when the old one has no pages.
const VERSION = "__VERSION__";
const PRECACHE_URLS = /*PRECACHE_URLS*/ [];
const PDFJS_PREFIX = "__PDFJS_PREFIX__";

const PREFIX = "plan-measure-";
const PRECACHE = `${PREFIX}precache-${VERSION}`;
const RUNTIME = `${PREFIX}runtime-${VERSION}`;
const PDFJS = `${PREFIX}pdfjs`;
const NAVIGATION_TIMEOUT_MS = 3000;

const scope = self.registration.scope;
const shellUrl = new URL("index.html", scope).href;
const pdfjsUrl = new URL(PDFJS_PREFIX, scope).href;
const assetsUrl = new URL("assets/", scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // "reload" skips the HTTP cache, so a half-stale deployment cannot end up in the precache.
      const responses = await Promise.all(
        PRECACHE_URLS.map(async (path) => {
          const response = await fetch(new Request(new URL(path, scope), { cache: "reload" }));
          if (!response.ok) throw new Error(`Precache failed for ${path}: ${response.status}`);
          return [path, response];
        }),
      );
      for (const [path, response] of responses) {
        await cache.put(new URL(path, scope), response.clone());
        if (path === "index.html") await cache.put(scope, response);
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && ![PRECACHE, RUNTIME, PDFJS].includes(name)) {
          await caches.delete(name);
        }
      }
      const pdfjs = await caches.open(PDFJS);
      for (const request of await pdfjs.keys()) {
        if (!request.url.startsWith(pdfjsUrl)) await pdfjs.delete(request);
      }
    })(),
  );
});

async function navigate(request) {
  const cached = () => caches.open(PRECACHE).then((cache) => cache.match(shellUrl));
  let timer;
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), NAVIGATION_TIMEOUT_MS);
      }),
    ]);
    return response.ok ? response : ((await cached()) ?? response);
  } catch (error) {
    const fallback = await cached();
    if (fallback) return fallback;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function asset(request) {
  const precached = await caches.open(PRECACHE).then((cache) => cache.match(request.url));
  if (precached) return precached;
  const store = request.url.startsWith(pdfjsUrl)
    ? PDFJS
    : request.url.startsWith(assetsUrl)
      ? RUNTIME
      : null;
  if (store) {
    const stored = await caches.open(store).then((cache) => cache.match(request.url));
    if (stored) return stored;
  }
  const response = await fetch(request);
  if (store && response.ok && response.status === 200) {
    const copy = response.clone();
    await caches
      .open(store)
      .then((cache) => cache.put(request.url, copy))
      .catch(() => undefined);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  if (request.mode === "navigate") event.respondWith(navigate(request));
  else event.respondWith(asset(request));
});
