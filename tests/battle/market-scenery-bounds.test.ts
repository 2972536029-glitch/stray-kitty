import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP} from '../../web/src/modules/battle/market/config.ts';
import {paintDetailedMarketBanks} from '../../web/src/modules/battle/scene-detailed-exteriors.ts';

type Point=readonly [number,number];
function inside(points:readonly Point[],x:number,y:number){
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,ay]=points[i],[bx,by]=points[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)result=!result;
  }
  return result;
}

test('loaded market artwork keeps both L notches, every route and all seven entrances clear',async()=>{
  const originals=['Image','document'].map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  let allocations=0;
  const images:ImageStub[]=[];
  class ImageStub extends EventTarget {
    complete=false;naturalWidth=0;src='';onload:(()=>void)|null=null;
    constructor(){super();images.push(this);}
    load(){assert.ok(this.src);this.complete=true;this.naturalWidth=1536;this.dispatchEvent(new Event('load'));this.onload?.();}
  }
  const ink={scale(){},drawImage(){}};
  Object.defineProperty(globalThis,'Image',{configurable:true,value:ImageStub});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){allocations++;return {width:0,height:0,getContext:()=>ink};}}});
  let path:Point[]=[],clip:Point[]=[];
  const stack:Point[][]=[],drawn:Point[][]=[];
  const ctx={
    imageSmoothingEnabled:true,
    save(){stack.push(clip);},restore(){clip=stack.pop()!;},
    beginPath(){path=[];},moveTo(x:number,y:number){path.push([x,y]);},lineTo(x:number,y:number){path.push([x,y]);},
    closePath(){},clip(){clip=[...path];},
    drawImage(){assert.equal(this.imageSmoothingEnabled,false);drawn.push([...clip]);},
  };
  try{
    assert.equal(paintDetailedMarketBanks(ctx as unknown as CanvasRenderingContext2D),false,'unloaded art retains the existing fallback');
    assert.equal(allocations,0);
    await Promise.resolve();
    images[0].load();
    assert.equal(paintDetailedMarketBanks(ctx as unknown as CanvasRenderingContext2D),true);
    assert.equal(drawn.length,4);
    const obstacles=new Set(MAP.obstacles.map(cell=>`${cell.x},${cell.y}`));
    for(let y=0;y<MAP.rows*80;y+=4)for(let x=0;x<MAP.columns*80;x+=4){
      const covered=drawn.filter(points=>inside(points,x+2,y+2)).length;
      assert.equal(covered,obstacles.has(`${Math.floor(x/80)},${Math.floor(y/80)}`)?1:0,
        `art footprint at ${x+2},${y+2} must agree with the real obstacle mask`);
    }
    for(const spawn of MAP.spawns)assert.ok(drawn.every(points=>!inside(points,(spawn.x+.5)*80,(spawn.y+.5)*80)));
    assert.equal(stack.length,0);
    const cached=allocations;
    paintDetailedMarketBanks(ctx as unknown as CanvasRenderingContext2D);
    assert.equal(allocations,cached,'paused and live frames reuse the completed rasters');
  }finally{
    ['Image','document'].forEach((name,index)=>{
      if(originals[index])Object.defineProperty(globalThis,name,originals[index]!);
      else Reflect.deleteProperty(globalThis,name);
    });
  }
});
