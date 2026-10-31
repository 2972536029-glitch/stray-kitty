import {readFileSync,writeFileSync} from 'node:fs';
import {tunnelGroundMask,raisedRidgeMask,raisedSurfacePolygons} from '../../../web/src/modules/chapter4/surfaces';
import map from '../../../level_design/chapter4/data/chapter4.map.json';
const base='tools/map-review/chapter4/',source=JSON.parse(readFileSync(base+'source-masks.json','utf8'));
const {width,height}=map.world,step=2,cols=Math.ceil(width/step),rows=Math.ceil(height/step);
const fields={L0:tunnelGroundMask('L0',width,height,Buffer.from(source.L0,'base64'),10),Lm1:tunnelGroundMask('Lm1',width,height,Buffer.from(source.Lm1,'base64'),10),'tank-ridge':raisedRidgeMask('tank-ridge',width,height),'south-ridge':raisedRidgeMask('south-ridge',width,height),'west-ridge':raisedRidgeMask('west-ridge',width,height)};
const surfaces:Record<string,unknown>={};
for(const [id,field] of Object.entries(fields)){
  // Snapshot a copy of the read-only runtime mask for this review tool.
  const raw=(field as unknown as {pixels:Uint8Array}).pixels.slice();
  const effective=new Uint8Array(cols*rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)effective[y*cols+x]=Number(field.isWalkable({x:x*step+1,y:y*step+1}));
  surfaces[id]={raw:Buffer.from(raw).toString('base64'),effective:Buffer.from(effective).toString('base64'),radius:id==='L0'||id==='Lm1'?10:4,depth:3,cornerReach:id==='L0'||id==='Lm1'?12:28};
  console.log(`${id}: ${effective.reduce((n,v)=>n+v,0)} legal review samples`);
}
writeFileSync(base+'current.json',JSON.stringify({width,height,step,cols,rows,surfaces,map,raisedSurfacePolygons}));
