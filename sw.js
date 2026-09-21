const CACHE='badfish-manager-v6-premium';
const SHELL=[
  './','./index.html','./styles.css?v=6','./config.js?v=6','./drive.js?v=6','./app.js?v=6',
  './manifest.webmanifest?v=6','./assets/badfish-logo.png?v=6','./assets/icon-192.png?v=6',
  './assets/icon-512.png?v=6','./assets/apple-touch-icon.png?v=6','./assets/favicon-32.png?v=6'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  const isNavigation=event.request.mode==='navigate';
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;}).catch(async()=>{
    const cached=await caches.match(event.request);if(cached)return cached;if(isNavigation)return caches.match('./index.html');return new Response('Offline',{status:503,statusText:'Offline'});
  }));
});
