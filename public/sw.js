/* Zcan service worker — deliberately small and conservative.
 *
 * - Navigations: network first. Only a few static, on-device pages are kept for offline use;
 *   anything else falls back to the /offline page.
 * - /_next/static/* (content-hashed, immutable) and /icons/*: cache first.
 * - /api/*, RSC payloads, non-GET and cross-origin requests: never touched, never cached.
 *
 * Kill switch: if this worker ever misbehaves, ship a sw.js that only calls
 * `self.registration.unregister()` and deletes caches — browsers re-check sw.js on every navigation.
 */

const VERSION = "zcan-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const STATIC_LIMIT = 300;

// Pages that work without a network once loaded (no addresses or order ids in their URL).
const OFFLINE_PAGES = ["/", "/tools", "/help", "/docs"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("zcan-") && !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {}
      }
      await self.clients.claim();
    })(),
  );
});

// Language copies (/es, /es/tools…) count as the same page.
const LOCALE_PREFIX = /^\/(es|pt|tr|ru|zh)(?=\/|$)/;
const isOfflinePage = (pathname) => {
  const bare = pathname.replace(LOCALE_PREFIX, "") || "/";
  return OFFLINE_PAGES.some((p) => bare === p || (p !== "/" && bare.startsWith(`${p}/`)));
};

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function handleNavigation(event, url) {
  try {
    const preloaded = await event.preloadResponse;
    const res = preloaded || (await fetch(event.request));
    if (res.ok && res.type === "basic" && !res.redirected && isOfflinePage(url.pathname)) {
      const copy = res.clone();
      // Keyed by path only, so ?from=…&amount=… variants share one entry.
      event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy)));
    }
    return res;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    return (isOfflinePage(url.pathname) && (await cache.match(url.pathname))) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function handleStatic(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(STATIC_CACHE, STATIC_LIMIT)));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Live data and React Server Component payloads always go straight to the network.
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(handleStatic(event));
  }
});
