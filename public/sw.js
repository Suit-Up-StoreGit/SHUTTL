const CACHE='shuttl-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/favicon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache authenticated API responses or writes.
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/leagues/')){event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;})));return;}
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/')));
});
self.addEventListener('push',event=>{
  let payload;try{payload=event.data.json();}catch{payload={title:'SHUTTL',body:'There is an update in your inbox.',url:'/inbox',tag:'shuttl-update'};}
  const url=new URL(payload.url||'/inbox',self.location.origin);
  const safe=url.origin===self.location.origin&&['/inbox','/friends','/home'].includes(url.pathname)?url.pathname+url.search:'/inbox';
  event.waitUntil(self.registration.showNotification('SHUTTL',{body:payload.body||'There is an update in your inbox.',icon:'/favicon.svg',badge:'/favicon.svg',tag:payload.tag||'shuttl-update',data:{url:safe},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=new URL(event.notification.data?.url||'/inbox',self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate(url.href);await existing.focus();}else await self.clients.openWindow(url.href);}));
});
