const CACHE="punish-f1c33c1892";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith((async()=>{try{const res=await fetch(e.request);if(res.ok){const c=await caches.open(CACHE);c.put(e.request,res.clone());}return res;}catch(err){const hit=await caches.match(e.request);if(hit)return hit;throw err;}})());});
