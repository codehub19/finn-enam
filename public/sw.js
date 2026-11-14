const cacheName='finn-shell-26';
const shell=['/','/app.js','/styles.css','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('finn-shell-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.startsWith('/logos/')){
    event.respondWith(caches.open(cacheName).then(async cache=>{
      const saved=await cache.match(event.request);
      if(saved)return saved;
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }));return;
  }
  if(!shell.includes(url.pathname))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)));
});
self.addEventListener('push',event=>{
  if(!event.data)return;
  const data=event.data.json();
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icon-192.png',data:{url:'/#briefing'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const existing=clients.find(c=>new URL(c.url).origin===location.origin);
    return existing?existing.navigate('/#briefing').then(c=>c?.focus()):self.clients.openWindow('/#briefing');
  }));
});
