const CACHE='badfish-manager-v5-email-account';
const ASSETS=[
  './','./index.html','./styles.css?v=5','./config.js?v=5','./drive.js?v=5','./app.js?v=5',
  './manifest.webmanifest?v=5','./assets/badfish-logo.png?v=5','./assets/icon-192.png?v=5','./assets/icon-512.png?v=5'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;

  // Network-first: evita che GitHub Pages continui a mostrare vecchie versioni
  // di JS, CSS o logo dopo un aggiornamento. Offline usa la cache.
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(c=>c.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
  );
});
