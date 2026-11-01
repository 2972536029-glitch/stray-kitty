const crateUrl=new URL('../../../../level_design/chapter5/art/source/sprites/crate_one.png',import.meta.url).href;

// Reuse approved pixel artwork; these placements depict the existing capsule,
// without changing its dimensions, C anchors, or traversal logic.
let crate:HTMLImageElement|undefined;
let nativeCrate:HTMLCanvasElement|undefined;
const placements=[
  {x:897,y:702,w:20},
  {x:896,y:721,w:20},
  {x:898,y:740,w:20},
  {x:897,y:759,w:20},
  // The southern end of the capsule continues inside the non-walkable building;
  // keep its visible cargo on the road, with the last crate's feet at the curb.
  {x:1345,y:126,w:20},
  {x:1365,y:126,w:20},
  {x:1385,y:126,w:20},
];
export function paintMarketCargo(ctx:CanvasRenderingContext2D){
  if(!crate){crate=new Image();crate.src=crateUrl;}
  if(!crate.complete||!crate.naturalWidth)return;
  if(!nativeCrate){
    // Match the map's native pixel density rather than magnifying sprite outlines.
    nativeCrate=document.createElement('canvas');nativeCrate.width=20;nativeCrate.height=22;
    const k=nativeCrate.getContext('2d')!;k.drawImage(crate,0,0,20,22);
    k.globalCompositeOperation='source-atop';k.fillStyle='#17293638';k.fillRect(0,0,20,22);
  }
  ctx.save();ctx.imageSmoothingEnabled=true;
  for(const p of placements){
    const h=p.w*22/20;
    ctx.fillStyle='#0a121b33';ctx.beginPath();ctx.ellipse(p.x+1,p.y+h-15,11,3,0,0,Math.PI*2);ctx.fill();
    ctx.drawImage(nativeCrate,p.x-p.w/2,p.y-14,p.w,h);
  }
  ctx.restore();
}
