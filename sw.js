const CACHE = "badfish-manager-v105";
const SHELL = [
  "./features-v105.css?v=105",
  "./machines-v105.js?v=105",
  "./push-v105.js?v=105",
  "./backup-core-v105.js?v=105",
  "./corrections-v104.css?v=104",
  "./cnc-v103.css?v=104",
  "./",
  "./index.html",
  "./sw.js",
  "./manifest.webmanifest?v=91",
  "./assets/favicon-32.png?v=91",
  "./assets/apple-touch-icon.png?v=91",
  "./config.js?v=105",
  "./styles.css?v=92",
  "./atelier-v93.css?v=93",
  "./mobile-v94.css?v=94",
  "./ui-v94.js?v=94",
  "./repeat-jobs.js?v=104",
  "./repeat-jobs.css?v=95",
  "./quote-pdf-v96.css?v=96",
  "./responsive-v97.css?v=97",
  "./assets/icon-192.png?v=91",
  "./assets/badfish-logo.png?v=91",
  "./drive.js?v=95",
  "./qr-engine.js?v=75",
  "./vendor/fflate-0.8.2.js",
  "./vendor/fzstd-0.1.1.js",
  "./fusion-stock.js?v=90",
  "./production-v101.js?v=104",
  "./production-v101.css?v=104",
  "./app.js?v=105",
  "./countdown-v102.js?v=105",
  "./backup.js?v=105",
  "./stats.js?v=104",
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

// Gli avvisi sono inviati dal server anche quando la pagina è chiusa.
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  const scope = new URL(self.registration.scope);
  let target = scope.href;
  try { const url = new URL(data.url, scope); if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) target = url.href; } catch {}
  event.waitUntil(self.registration.showNotification(String(data.title || 'Badfish · Avviso CNC').slice(0,100), {
    body: String(data.body || 'Controlla le lavorazioni in corso.').slice(0,500),
    icon: new URL('assets/icon-192.png', scope).href,
    badge: new URL('assets/icon-192.png', scope).href,
    tag: String(data.tag || 'badfish-cnc').slice(0,300),
    data: {url:target}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const scope = new URL(self.registration.scope);
  let url = scope.href;
  try {const candidate = new URL(event.notification.data?.url,scope); if(candidate.origin===scope.origin && candidate.pathname.startsWith(scope.pathname))url=candidate.href;} catch {}
  event.waitUntil((async()=>{
    const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const page of pages)if(page.url.startsWith(scope.href) && 'focus' in page){ await page.navigate(url);return page.focus(); }
    return self.clients.openWindow(url);
  })());
});
