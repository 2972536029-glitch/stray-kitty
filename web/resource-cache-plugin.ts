import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
const allowed=/\.(?:png|webp|jpe?g|avif|gif|svg|woff2?|ttf|otf|mp3|ogg|wav|m4a|mp4|webm|js|css)$/i;
export function resourceCache():Plugin{
 let root='';
 return{name:'stray-kitty-resource-cache',apply:'build',configResolved(config){root=config.root;},generateBundle(_options,bundle){
  const assets=new Map<string,{url:string;revision:string;bytes:number}>();
  const add=(name:string,source:string|Uint8Array)=>{if(!name.startsWith('assets/')||!allowed.test(name))return;const data=Buffer.from(source);assets.set('/'+name,{url:'/'+name,revision:createHash('sha256').update(data).digest('hex').slice(0,20),bytes:data.length});};
  const walk=(folder:string,prefix='')=>{for(const entry of readdirSync(folder,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())walk(path.join(folder,entry.name),name+'/');else add(name,readFileSync(path.join(folder,entry.name)));}};
  walk(path.join(root,'public'));
  for(const [name,item] of Object.entries(bundle))add(name,item.type==='chunk'?item.code:item.source);
  const resources=[...assets.values()].sort((a,b)=>a.bytes-b.bytes||a.url.localeCompare(b.url));
  const version=createHash('sha256').update(JSON.stringify(resources)).digest('hex').slice(0,20);
  this.emitFile({type:'asset',fileName:'resource-manifest.json',source:JSON.stringify({version,resources})});
  const worker=readFileSync(path.join(root,'resource-cache-worker.js'),'utf8').replace('__KITTY_RESOURCES__',JSON.stringify(resources));
  this.emitFile({type:'asset',fileName:'resource-cache-sw.js',source:worker});
 }};
}
