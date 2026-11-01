import {writeFileSync} from 'node:fs';
import {isMarketTraversable,marketEntry,marketPortals,marketItems,nightMarketSpatial} from '../../../web/src/modules/nightMarket/map';
const width=1672,height=941,step=2,cols=Math.ceil(width/step),rows=Math.ceil(height/step);
const masks:Record<string,string>={};
for(const floor of ['L0','L1','Lm1'] as const){
  const pixels=new Uint8Array(cols*rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)pixels[y*cols+x]=Number(isMarketTraversable(floor,x*step+step/2,y*step+step/2,false));
  masks[floor]=Buffer.from(pixels).toString('base64');console.log(`${floor}: ${pixels.reduce((n,v)=>n+v,0)} current valid samples`);
}
writeFileSync('tools/map-review/chapter2/current.json',JSON.stringify({width,height,step,cols,rows,masks,entry:marketEntry,portals:marketPortals,items:marketItems,spatial:nightMarketSpatial}));
