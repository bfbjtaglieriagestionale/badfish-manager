const CACHE='badfish-manager-v4-account-picker';
const ASSETS=['./','./index.html','./styles.css?v=4','./config.js?v=4','./drive.js?v=4','./app.js?v=4','./manifest.webmanifest?v=4','./assets/badfish-logo.png?v=4','./assets/icon-192.png?v=4','./assets/icon-512.png?v=4'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;}).catch(()=>caches.match('./index.html'))));
});
