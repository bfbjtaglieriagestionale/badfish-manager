const CACHE='badfish-manager-v85';
const SHELL=[
  './','./index.html','./mobile-nav-v81.css?v=85','./mobile-nav-v81.js?v=85','./styles-v65.css?v=76','./config.js?v=62','./boot-v62.js','./drive-v62.js?v=79','./app-v65.js?v=79',
  './qr-engine.js?v=75','./manifest.webmanifest?v=75','./assets/badfish-logo.png?v=64','./assets/icon-192.png?v=64',
  './assets/icon-512.png','./assets/apple-touch-icon.png?v=64','./assets/favicon-32.png?v=64'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&/^badfish-manager-v/i.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const isNavigation=event.request.mode==='navigate';
  event.respondWith(
    fetch(event.request,{cache:'no-store'}).then(response=>{
      if(response && response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});}
      return response;
    }).catch(async()=>{
      const cached=await caches.match(event.request);
      if(cached)return cached;
      if(isNavigation)return caches.match('./index.html');
      return new Response('Offline',{status:503,statusText:'Offline'});
    })
  );
});
