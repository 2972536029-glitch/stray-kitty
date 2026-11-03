type PixelRect=readonly [number,number,number,number];
interface ShallowWaterPatch {
  x:number;y:number;width:number;height:number;
  bands:readonly PixelRect[];
  shade:readonly PixelRect[];
  glints:readonly PixelRect[];
  lamplight?:readonly PixelRect[];
}

// Authored in the same 80-unit world space as the paving. Most water collects
// in the service margins; the two tiny board patches hug tile edges, leaving
// the middle of the stones and every actor/label layer clear.
const patches:readonly ShallowWaterPatch[]=[
  {x:16,y:372,width:106,height:24,
    bands:[[18,0,58,2],[8,2,85,4],[2,6,102,6],[0,12,98,4],[9,16,80,4],[23,20,54,2],[32,22,30,2]],
    shade:[[12,5,63,2],[4,10,83,3],[19,16,45,2]],
    glints:[[13,4,16,1],[33,4,7,1],[62,8,22,1],[78,9,12,1],[24,19,11,1]],
    lamplight:[[43,8,9,1],[39,10,17,1],[46,13,6,1]]},
  {x:-93,y:96,width:52,height:16,
    bands:[[15,0,21,2],[6,2,39,3],[0,5,50,5],[5,10,47,2],[13,12,29,2],[22,14,12,2]],
    shade:[[7,7,31,2],[21,11,16,1]],
    glints:[[9,4,12,1],[25,6,7,1],[35,10,6,1]]},
  {x:674,y:201,width:73,height:18,
    bands:[[8,0,36,2],[3,2,55,3],[0,5,68,5],[7,10,66,3],[16,13,45,3],[31,16,19,2]],
    shade:[[10,5,41,2],[18,10,42,2]],
    glints:[[12,3,18,1],[34,7,9,1],[49,11,11,1],[23,15,8,1]]},
  {x:128,y:370,width:88,height:22,
    bands:[[25,0,33,2],[11,2,62,4],[4,6,79,4],[0,10,88,4],[8,14,68,4],[19,18,45,2],[29,20,23,2]],
    shade:[[16,7,48,2],[7,12,58,3],[28,17,25,1]],
    glints:[[17,4,15,1],[39,6,8,1],[61,10,13,1],[25,18,11,1]],
    lamplight:[[48,10,7,1],[43,12,14,1]]},
  {x:248,y:66,width:54,height:10,
    bands:[[12,0,28,2],[3,2,45,2],[0,4,54,2],[7,6,39,2],[20,8,18,2]],
    shade:[[9,4,30,1]],glints:[[14,2,9,1],[32,5,8,1]]},
  {x:426,y:378,width:35,height:12,
    bands:[[9,0,14,2],[3,2,27,2],[0,4,35,4],[6,8,24,2],[13,10,11,2]],
    shade:[[6,5,20,2]],glints:[[8,3,7,1],[21,8,6,1]]},
];

function fillBands(ctx:CanvasRenderingContext2D,color:string,rects:readonly PixelRect[]){
  ctx.fillStyle=color;
  for(const [x,y,w,h] of rects)ctx.fillRect(x,y,w,h);
}

/** Paint only this native ground tile. Both the room and the tactical canvas
 * call this through paintGround, so panning/zooming cannot detach a reflection
 * from its puddle or create a seam at the board's edge. No time/random inputs. */
export function paintTunnelShallowWater(ctx:CanvasRenderingContext2D,cellX:number,cellY:number){
  const left=cellX*80,top=cellY*80;
  for(const patch of patches){
    if(patch.x>=left+80||patch.x+patch.width<=left||patch.y>=top+80||patch.y+patch.height<=top)continue;
    ctx.save();ctx.beginPath();ctx.rect(0,0,80,80);ctx.clip();
    ctx.translate(patch.x-left,patch.y-top);
    // Transparent flat bands keep the floor grain visible; one-pixel broken
    // glints suggest a thin wet film instead of a bright pool or animated rings.
    fillBands(ctx,'#315e6a68',patch.bands);
    fillBands(ctx,'#163e4b42',patch.shade);
    fillBands(ctx,'#9bbbc24d',patch.glints);
    if(patch.lamplight)fillBands(ctx,'#c6ba8d38',patch.lamplight);
    ctx.restore();
  }
}
