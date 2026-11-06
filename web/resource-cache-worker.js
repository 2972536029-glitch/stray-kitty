/* Generated from the exact release assets. Never store HTML or API responses. */
const resources=new Map(__KITTY_RESOURCES__.map(item=>[item.url,item]));
const cacheName='stray-kitty-static-v1';
const keyFor=item=>new URL(item.url+'?__kitty_revision='+item.revision,self.location.origin).href;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const cache=await caches.open(cacheName),valid=new Set([...resources.values()].map(keyFor));
 for(const key of await cache.keys())if(!valid.has(key.url))await cache.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),item=resources.get(url.pathname);
 if(url.origin===self.location.origin&&url.pathname.startsWith('/api/'))event.waitUntil(self.clients.matchAll().then(clients=>{for(const client of clients)client.postMessage({type:'kitty-foreground-asset'});}));
 if(request.method!=='GET'||url.origin!==self.location.origin||!item||request.headers.has('Authorization')||request.headers.has('Range'))return;
 // Page-owned warm requests keep an abortable network stream and write their
 // own cache entry; foreground fetches use this worker as a read-through cache.
 if(request.headers.get('X-Kitty-Warmup')==='1')return;
 event.respondWith((async()=>{
  let cache;try{cache=await caches.open(cacheName);const hit=await cache.match(keyFor(item));if(hit)return hit;}catch{/* Cache denial must not stop an ordinary asset request. */}
  event.waitUntil(self.clients.matchAll().then(clients=>{for(const client of clients)client.postMessage({type:'kitty-foreground-asset'});}));
  const response=await fetch(request,/[-_][A-Za-z0-9_-]{8}\.[a-z0-9]+$/i.test(url.pathname)?{}:{cache:'reload'});
  if(cache&&response.ok&&response.status===200&&!response.headers.get('Content-Type')?.includes('text/html')&&!/no-store/i.test(response.headers.get('Cache-Control')??'')){
   const copy=response.clone();event.waitUntil(cache.put(keyFor(item),copy).catch(()=>{}));
  }
  return response;
 })());
});
