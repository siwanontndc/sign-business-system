const CACHE = "sign-business-static-v1";
const STATIC = ["/app-icon.svg", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache navigations or business/auth/API traffic. Keep Supabase-backed data fresh.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  const isSafeStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/app-icon.svg" ||
    url.pathname === "/logo.png" ||
    url.pathname === "/favicon.ico";
  if (!isSafeStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
