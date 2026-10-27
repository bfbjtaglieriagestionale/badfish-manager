const CACHE = "badfish-manager-v95";
const SHELL = [
  "./",
  "./index.html",
  "./sw.js",
  "./manifest.webmanifest?v=91",
  "./assets/favicon-32.png?v=91",
  "./assets/apple-touch-icon.png?v=91",
  "./config.js?v=62",
  "./styles.css?v=92",
  "./atelier-v93.css?v=93",
  "./mobile-v94.css?v=94",
  "./ui-v94.js?v=94",
  "./repeat-jobs.js?v=95",
  "./repeat-jobs.css?v=95",
  "./assets/icon-192.png?v=91",
  "./assets/badfish-logo.png?v=91",
  "./drive.js?v=95",
  "./qr-engine.js?v=75",
  "./vendor/fflate-0.8.2.js",
  "./vendor/fzstd-0.1.1.js",
  "./fusion-stock.js?v=90",
  "./app.js?v=95",
  "./backup.js?v=78",
  "./stats.js?v=92",
  "./mobile-nav.js?v=94",
  "./job-tabs.js?v=94",
  "./assets/icon-512.png?v=91",
  "./assets/icon-maskable-512.png?v=91",
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
