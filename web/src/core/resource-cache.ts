import {imageLoadingBusy,subscribeImageLoading} from './image-loading';
interface Resource{url:string;revision:string;bytes:number}
interface Connection extends EventTarget{saveData?:boolean;effectiveType?:string}
let started=false;
/** Store encoded static files without decoding images or blocking game startup. */
export function startResourceCache(){
 if(started||import.meta.env.DEV||!window.isSecureContext||!('serviceWorker' in navigator)||!('caches' in window))return()=>{};
 started=true;
 const connection=(navigator as Navigator&{connection?:Connection}).connection;
 let stopped=false,timer=0,idle=0,controller:AbortController|undefined,lastBusy=performance.now(),pending:Resource[]|undefined,cache:Cache|undefined;
 const restricted=()=>!!connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType??'');
 const pause=()=>{lastBusy=performance.now();controller?.abort();};
 const activity=()=>{if(imageLoadingBusy())pause();};
 const message=(event:MessageEvent)=>{if(event.data?.type==='kitty-foreground-asset')pause();};
 const unsubscribe=subscribeImageLoading(activity);
 for(const name of ['pointerdown','keydown'])window.addEventListener(name,pause,{passive:true,capture:true});
 document.addEventListener('visibilitychange',pause);window.addEventListener('offline',pause);navigator.serviceWorker.addEventListener('message',message);connection?.addEventListener('change',pause);
 const keyFor=(resource:Resource)=>new URL(resource.url+'?__kitty_revision='+resource.revision,location.origin).href;
 const schedule=()=>{
  if(stopped||pending?.length===0)return;
  timer=window.setTimeout(()=>{if('requestIdleCallback' in window)idle=window.requestIdleCallback(()=>void tick());else void tick();},1500);
 };
 const tick=async()=>{
  if(stopped)return;
  if(document.readyState!=='complete'||document.hidden||!navigator.onLine||restricted()||imageLoadingBusy()||performance.now()-lastBusy<2000){schedule();return;}
  try{
   if(!cache){
    await navigator.serviceWorker.register('/resource-cache-sw.js',{scope:'/',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if(stopped)return;
    if(!navigator.serviceWorker.controller){return;}
    cache=await caches.open('stray-kitty-static-v1');
   }
   if(!pending){
    controller=new AbortController();const response=await fetch('/resource-manifest.json',{cache:'no-cache',priority:'low',signal:controller.signal,credentials:'omit'});
    if(!response.ok)return;
    const manifest=await response.json() as {resources:Resource[]};
    pending=manifest.resources.filter(item=>item.url.startsWith('/assets/')&&item.bytes>0&&typeof item.revision==='string');
   }
   if(imageLoadingBusy()||document.hidden||performance.now()-lastBusy<2000)return;
   let next=pending[0];
   while(next&&await cache.match(keyFor(next))){pending.shift();next=pending[0];}
   if(!next)return;
   const storage=await navigator.storage?.estimate().catch(()=>undefined);
   if(storage?.quota&&storage.quota-(storage.usage??0)<next.bytes+16*1024*1024)return;
   if(imageLoadingBusy()||document.hidden||restricted()||performance.now()-lastBusy<2000)return;
   controller=new AbortController();const timeout=window.setTimeout(()=>controller?.abort(),30000);
   try{
    const response=await fetch(next.url,{cache:'reload',priority:'low',credentials:'omit',headers:{'X-Kitty-Warmup':'1'},signal:controller.signal});
    if(!response.ok||response.headers.get('Content-Type')?.includes('text/html')){pending.shift();return;}
    // Read encoded bytes only. Avoid image decode and GPU upload in the warm lane.
    await cache.put(keyFor(next),response);
    pending.shift();
   }finally{clearTimeout(timeout);}
  }catch{/* Offline, quota and browser cache restrictions leave foreground loading intact. */}
  finally{controller=undefined;schedule();}
 };
 schedule();
 return()=>{stopped=true;clearTimeout(timer);if(idle)window.cancelIdleCallback(idle);controller?.abort();unsubscribe();for(const name of ['pointerdown','keydown'])window.removeEventListener(name,pause,{capture:true});document.removeEventListener('visibilitychange',pause);window.removeEventListener('offline',pause);navigator.serviceWorker.removeEventListener('message',message);connection?.removeEventListener('change',pause);};
}
