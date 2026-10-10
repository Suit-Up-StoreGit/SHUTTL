const CACHE='shuttl-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/favicon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache authenticated API responses or writes.
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/leagues/')){event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;})));return;}
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/')));
});
