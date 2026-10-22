const CACHE = "badfish-manager-v90";
const SHELL = [
  "./",
  "./index.html",
  "./sw.js",
  "./manifest.webmanifest?v=72",
  "./assets/favicon-32.png?v=62",
  "./assets/apple-touch-icon.png?v=62",
  "./config.js?v=62",
  "./styles.css?v=90",
  "./assets/icon-192.png?v=62",
  "./assets/badfish-logo.png?v=62",
  "./drive.js?v=90",
  "./qr-engine.js?v=75",
  "./vendor/fflate-0.8.2.js",
  "./vendor/fzstd-0.1.1.js",
  "./fusion-stock.js?v=90",
  "./app.js?v=90",
  "./backup.js?v=78",
  "./stats.js?v=80",
  "./mobile-nav.js?v=85",
  "./job-tabs.js?v=90",
  "./assets/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && /^badfish-manager-v/i.test(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== location.origin
  )
    return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(event.request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(event.request)) ||
          (event.request.mode === "navigate"
            ? await caches.match("./index.html")
            : null) ||
          new Response("Offline", { status: 503 }),
      ),
  );
});
