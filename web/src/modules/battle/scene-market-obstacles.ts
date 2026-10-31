import {hasDetailedMarketBanks,paintDetailedMarketBanks,paintRefinedMaterial,hasRefinedMaterials} from './scene-detailed-exteriors';

/** A market stall bank uses one continuous structure, in native 80px tile space.
 * The two western banks wrap the corner; their doors face the central aisle.
 * Only the outer room sides extend beyond the map, by at most 0.4 of a cell. */
export const MARKET_JOINED_OBSTACLE_CELLS:readonly {x:number;y:number}[]=Object.freeze([
  {x:0,y:0},{x:1,y:0},{x:2,y:0},{x:5,y:0},{x:6,y:0},{x:7,y:0},
  {x:0,y:1},{x:0,y:3},
  {x:0,y:4},{x:1,y:4},{x:2,y:4},{x:5,y:4},{x:6,y:4},{x:7,y:4},
]);
type Context=CanvasRenderingContext2D;
type Point=readonly [number,number];
interface Cloth {base:string;fold:string;light:string;hem:string;material:'teal-cloth'|'rust-cloth'|'olive-cloth'|'blue-cloth'}
const cloth={
  tea:{material:'teal-cloth',base:'#506e69',fold:'#405e5c',light:'#849780',hem:'#b2a17a'},
  spice:{material:'rust-cloth',base:'#88624f',fold:'#704e43',light:'#b68b67',hem:'#bca57a'},
  supply:{material:'blue-cloth',base:'#5b6970',fold:'#45565d',light:'#8c9890',hem:'#b6a47e'},
  produce:{material:'olive-cloth',base:'#727653',fold:'#596143',light:'#a2a57b',hem:'#c0af79'},
} satisfies Record<string,Cloth>;
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function path(ctx:Context,points:readonly Point[]){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(const [x,y]of points.slice(1))ctx.lineTo(x,y);
  ctx.closePath();
}
function polygon(ctx:Context,color:string,points:readonly Point[]){path(ctx,points);ctx.fillStyle=color;ctx.fill();}
function bank(ctx:Context,footprint:readonly Point[],draw:()=>void){
  ctx.save();path(ctx,footprint);ctx.clip();draw();ctx.restore();
}
function woodFace(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#322f2a',x,y,w,h);r(ctx,'#6f573f',x+2,y+2,w-4,h-4);
  paintRefinedMaterial(ctx,'wood',x+2,y+2,w-4,h-4,.35);
  r(ctx,'#a58b61',x+2,y+2,w-4,2);r(ctx,'#493e31',x+2,y+h-5,w-4,3);
  // Long grain and a few shallow knots cross the old tile joints.
  for(let yy=y+8,row=0;yy<y+h-5;yy+=8,row++){
    r(ctx,'#453a2c88',x+3,yy,w-6,1);r(ctx,'#b1966938',x+10,yy-2,w*.42,.5);
    const start=x+13+(row%2)*w*.19;
    r(ctx,'#d0ad7830',start,yy-4,w*.27,.5);r(ctx,'#362f292c',start+w*.1,yy-3,w*.31,.5);
    r(ctx,'#9d7c513d',x+w*.69,yy-5,w*.17,.5);
  }
  const knotX=x+w*.35,knotY=y+h*.64;
  r(ctx,'#392f2c60',knotX,knotY,6,1);r(ctx,'#412e2b48',knotX-2,knotY-1,10,.5);
  r(ctx,'#c4a47738',knotX-2,knotY+1.5,11,.5);
  for(const xx of [x+5,x+w-7]){r(ctx,'#d6b88165',xx,y+4,1,1);r(ctx,'#302d2659',xx+.5,y+5,1,1);}
}
function roof(ctx:Context,points:readonly Point[],c:Cloth,x:number,y:number,w:number,h:number,offset=0){
  ctx.save();path(ctx,points);ctx.clip();r(ctx,c.base,x,y,w,h);
  paintRefinedMaterial(ctx,c.material,x,y,w,h,.35);
  for(let xx=x+offset;xx<x+w;xx+=29){
    const fold=ctx.createLinearGradient(xx,y,xx+15,y);
    fold.addColorStop(0,c.fold+'b0');fold.addColorStop(.5,c.fold+'70');fold.addColorStop(.75,c.light+'3d');fold.addColorStop(1,c.light+'00');
    ctx.fillStyle=fold;ctx.fillRect(xx,y,15,h);
    r(ctx,c.fold+'85',xx+27,y,.75,h);r(ctx,c.light+'35',xx+26,y,.5,h);
    // The seam carries fine stitches, rather than noise over the whole fabric.
    for(let yy=y+8;yy<y+h-7;yy+=12){r(ctx,c.hem+'38',xx+7,yy,.5,2.5);r(ctx,'#1e34331c',xx+8,yy+1,.5,2);}
    r(ctx,c.light+'28',xx+12,y+12,7,.5);r(ctx,c.fold+'55',xx+17,y+13,5,.5);
  }
  r(ctx,c.light+'80',x,y+2,w,1);r(ctx,c.light+'35',x,y+3,w,.5);
  const slope=ctx.createLinearGradient(x,y,x,y+h);
  slope.addColorStop(0,'#e2d8af08');slope.addColorStop(.46,'#e2d8af00');slope.addColorStop(1,'#112d2b26');
  ctx.fillStyle=slope;ctx.fillRect(x,y,w,h);
  r(ctx,'#172b2c25',x,y+h-6,w,6);
  ctx.restore();
}
function hem(ctx:Context,c:Cloth,x:number,y:number,w:number){
  r(ctx,'#263936',x,y,w,7);r(ctx,c.base,x,y,w,4);r(ctx,c.hem+'c0',x+1,y+1,w-2,1);
  for(let xx=x+6;xx<x+w-7;xx+=27){r(ctx,c.fold,xx,y+4,13,3);r(ctx,c.light+'45',xx+1,y+4,10,.5);}
  for(let xx=x+3;xx<x+w-3;xx+=5)r(ctx,c.hem+'70',xx,y+2.5,1.5,.5);
}
function post(ctx:Context,x:number,y:number,h:number){
  r(ctx,'#2b342f',x,y,6,h);r(ctx,'#998362',x+1,y,3,h-2);r(ctx,'#c5b18a70',x+1,y+2,.5,h-5);
  r(ctx,'#473e2e70',x+3,y+6,.5,h-10);r(ctx,'#bfaa7859',x+2,y+h-8,.5,4);
  r(ctx,'#d4c094',x+2,y+3,1,1);r(ctx,'#3a4236',x+2,y+4,1,.5);
}
function basket(ctx:Context,x:number,y:number,w:number,h:number,color:string){
  r(ctx,'#353a2d',x-1,y+3,w+2,h-1);r(ctx,'#92784e',x,y+4,w,h-3);
  r(ctx,'#b19a68',x,y+4,w,2);r(ctx,'#514936',x+1,y+h-2,w-2,2);
  for(let xx=x+4;xx<x+w-2;xx+=6){r(ctx,'#564c3466',xx,y+7,.75,Math.max(1,h-9));r(ctx,'#c2a96b45',xx+1,y+7,.5,Math.max(1,h-10));}
  for(let yy=y+9;yy<y+h-2;yy+=3){r(ctx,'#584c3242',x+2,yy,w-4,.5);r(ctx,'#d3b9812c',x+3,yy+1,w-6,.5);}
  for(let xx=x+2,i=0;xx<x+w-4;xx+=8,i++){
    const yy=y+(i%2?1:0);r(ctx,color,xx,yy,6,5);r(ctx,'#d1bf8380',xx+1,yy+.5,2,.5);
    r(ctx,'#32452d55',xx+4,yy+2,1,2);r(ctx,'#d8c99d3b',xx+.5,yy+1.5,.5,1.5);
    if(i%2===0)r(ctx,'#5c663e',xx+3,yy,1,1);
  }
}
function sack(ctx:Context,x:number,y:number,color:string){
  r(ctx,'#30392b',x+1,y+4,19,18);r(ctx,color,x+2,y+3,17,17);
  r(ctx,color,x+5,y,11,6);r(ctx,'#b5a17a88',x+5,y+4,3,13);
  r(ctx,'#554c3280',x+5,y+1,11,2);r(ctx,'#443f2e55',x+14,y+7,1,11);
  for(let yy=y+6;yy<y+18;yy+=3){r(ctx,'#d3c19148',x+3,yy,1,.5);r(ctx,'#66583a5c',x+16,yy+.5,.5,1);}
  r(ctx,'#d0bd8d59',x+7,y+6,3,.5);r(ctx,'#5e52344d',x+8,y+12,4,.5);r(ctx,'#c8b27b66',x+6,y+2,9,.5);
}

function patchSeams(ctx:Context,x:number,y:number,w:number,h:number){
  r(ctx,'#273c3450',x+.5,y+.5,w-1,.5);r(ctx,'#d2c49955',x+1,y+1,w-2,.5);
  for(let xx=x+3;xx<x+w-2;xx+=5){r(ctx,'#d6cb9c65',xx,y+2,1.5,.5);r(ctx,'#253b3159',xx+.5,y+h-2,1.5,.5);}
  for(let yy=y+4;yy<y+h-2;yy+=5){r(ctx,'#c3bd9466',x+1.5,yy,.5,1.5);r(ctx,'#253a3159',x+w-2,yy,.5,1.5);}
  r(ctx,'#c1c5aa24',x+w*.25,y+h*.5,w*.45,.5);
}
function warmLamp(ctx:Context,x:number,y:number){
  // Reflected light stays inside its existing stall bank; no glow crosses a lane.
  ctx.save();ctx.translate(x,y+5);ctx.scale(1,.55);
  const glow=ctx.createRadialGradient(0,0,1,0,0,32);
  glow.addColorStop(0,'#ffd99038');glow.addColorStop(.28,'#efba6520');glow.addColorStop(.7,'#edb25a09');glow.addColorStop(1,'#e6aa5000');
  ctx.fillStyle=glow;ctx.fillRect(-32,-32,64,64);ctx.restore();
  r(ctx,'#253b36',x-.5,y-4,1,4);r(ctx,'#223631',x-3,y-1,6,10);
  r(ctx,'#9d8356',x-2.5,y,5,8);r(ctx,'#dfb974',x-1.5,y+1,3,6);
  r(ctx,'#fff0bc',x-.5,y+1.5,1,4);r(ctx,'#f5d78e9c',x-2,y+1,.5,5);
  r(ctx,'#403f2e',x-3,y+8,6,1);r(ctx,'#c1a873',x-3,y-1,6,.5);
}

function northWest(ctx:Context){
  bank(ctx,[[-32,-32],[240,-32],[240,80],[80,80],[80,160],[-32,160]],()=>{
    polygon(ctx,'#172b2c66',[[-30,-26],[240,-26],[240,80],[80,80],[80,160],[-30,160]]);
    // One L-shaped cabinet and a connected canopy turn the corner at A1/B1.
    woodFace(ctx,-28,46,266,30);woodFace(ctx,-28,132,106,25);
    r(ctx,'#334138',52,46,25,109);r(ctx,'#665a42',55,48,19,104);
    r(ctx,'#9d8d6475',55,50,3,98);r(ctx,'#3e4532',71,51,3,100);
    for(const yy of [78,113]){r(ctx,'#343d2f',58,yy,12,2);r(ctx,'#c0a873',63,yy+4,3,2);}
    roof(ctx,[[-30,-28],[238,-28],[238,46],[52,46],[52,132],[-30,132]],cloth.tea,-30,-28,268,160,7);
    hem(ctx,cloth.tea,52,45,186);hem(ctx,cloth.tea,-30,131,82);
    r(ctx,cloth.tea.light,50,46,2,86);
    post(ctx,230,48,29);post(ctx,-24,134,23);
    basket(ctx,104,50,37,18,'#bca26a');basket(ctx,169,50,29,17,'#7c8c59');
    r(ctx,'#344b46',-16,72,53,33);r(ctx,'#77876b',-13,75,47,27);
    r(ctx,'#a5ae8255',-11,76,2,24);r(ctx,'#2d4540',7,75,2,28);
    r(ctx,'#987e54',-15,111,45,7);r(ctx,'#b7a373',-14,111,43,2);
    // A patch and a rolled cloth interrupt the long roof without dividing it.
    r(ctx,'#607b6d',153,-12,43,27);r(ctx,'#9da78366',154,-11,40,1);
    r(ctx,'#344e49',154,14,41,2);r(ctx,'#b6a47a',-16,20,39,7);r(ctx,'#d3c296',-14,21,35,2);
    patchSeams(ctx,153,-12,43,27);r(ctx,'#7a744957',-12,24,31,.5);r(ctx,'#e0cc9959',-12,22,31,.5);
    warmLamp(ctx,79,57);
  });
}
function northEast(ctx:Context){
  bank(ctx,[[400,-32],[672,-32],[672,80],[400,80]],()=>{
    r(ctx,'#17282d66',400,-26,272,106);woodFace(ctx,402,46,268,31);
    roof(ctx,[[402,-28],[670,-28],[670,46],[402,46]],cloth.spice,402,-28,268,74,18);
    hem(ctx,cloth.spice,402,45,268);post(ctx,404,48,30);post(ctx,662,48,30);
    // Several drawers share one uninterrupted countertop and plinth.
    for(const x of [453,561]){r(ctx,'#3c392d',x,55,1,18);r(ctx,'#b8a071',x+24,57,10,2);}
    basket(ctx,427,49,47,19,'#b68c5e');basket(ctx,520,50,34,18,'#7b8b53');
    sack(ctx,595,50,'#a08c65');sack(ctx,619,51,'#82795a');
    r(ctx,'#bc977030',479,-18,69,22);r(ctx,'#d4b38355',480,-17,66,1);
    r(ctx,'#413b2b',646,-12,13,33);r(ctx,'#987950',648,-10,9,29);r(ctx,'#c2a06e70',649,-8,2,24);
    patchSeams(ctx,479,-18,69,22);r(ctx,'#d6b37859',650,-5,.5,17);r(ctx,'#5e503955',653,2,.5,12);
  });
}
function southWest(ctx:Context){
  bank(ctx,[[-32,240],[80,240],[80,320],[240,320],[240,432],[-32,432]],()=>{
    polygon(ctx,'#172b2b66',[[-30,240],[80,240],[80,320],[240,320],[240,428],[-30,428]]);
    woodFace(ctx,-28,392,266,32);
    r(ctx,'#303d3a',52,242,26,151);r(ctx,'#6e6750',55,245,20,145);
    r(ctx,'#aba17b70',55,246,2,143);r(ctx,'#414737',72,247,3,143);
    roof(ctx,[[-30,242],[52,242],[52,324],[238,324],[238,392],[-30,392]],cloth.supply,-30,242,268,150,19);
    hem(ctx,cloth.supply,-30,391,268);r(ctx,cloth.supply.light,50,244,2,80);
    post(ctx,-24,395,30);post(ctx,230,395,30);
    // Long storage cabinets, with one shelf in the returning wing.
    for(const x of [62,164]){r(ctx,'#3b3c32',x,402,1,18);r(ctx,'#b3a17c',x+20,404,9,2);}
    r(ctx,'#34453e',-16,270,54,35);r(ctx,'#8b7957',-13,273,48,29);
    r(ctx,'#baa577',-12,273,46,2);r(ctx,'#5e5b42',-12,285,46,2);r(ctx,'#4b4e39',8,275,2,25);
    r(ctx,'#667b7d',116,341,46,25);r(ctx,'#9ea69a65',117,342,43,2);
    r(ctx,'#9f9475',171,355,43,8);r(ctx,'#cdc09780',173,356,38,2);
    patchSeams(ctx,116,341,46,25);r(ctx,'#615e4566',174,360,36,.5);r(ctx,'#d5c59b4d',174,358,36,.5);
  });
}
function southEast(ctx:Context){
  bank(ctx,[[400,320],[672,320],[672,432],[400,432]],()=>{
    r(ctx,'#17282d66',400,320,272,108);woodFace(ctx,402,392,268,32);
    roof(ctx,[[402,322],[670,322],[670,392],[402,392]],cloth.produce,402,322,268,70,4);
    hem(ctx,cloth.produce,402,391,268);post(ctx,404,395,30);post(ctx,662,395,30);
    basket(ctx,433,395,43,19,'#a38b59');basket(ctx,491,395,36,19,'#809252');
    sack(ctx,587,397,'#a79a75');sack(ctx,614,396,'#897c5d');
    r(ctx,'#536044',546,338,42,24);r(ctx,'#8a967069',548,339,38,2);
    r(ctx,'#b1a477',641,345,15,29);r(ctx,'#d0bc8955',642,347,2,23);
    patchSeams(ctx,546,338,42,24);r(ctx,'#6b6b4159',650,349,.5,21);r(ctx,'#e0cba24d',645,348,.5,22);
    warmLamp(ctx,560,401);
  });
}

function paintMarketBanks(ctx:Context){northWest(ctx);northEast(ctx);southWest(ctx);southEast(ctx);}
let marketSurface:HTMLCanvasElement|undefined;
let marketSurfaceHasMaterials=false;
let detailedMarketSurface:HTMLCanvasElement|undefined;
/** Pure display only: unchanged obstacle footprint, entrances, routing and collision. */
export function paintMarketObstacleScenery(ctx:CanvasRenderingContext2D):void{
  if(hasDetailedMarketBanks()){
    // Register the art on the tactical canvas's native 80px cell grid first.
    // The backdrop and live board then enlarge the same pixels once; otherwise
    // fractional CSS zoom can give their halves different pixel-step patterns.
    if(!detailedMarketSurface&&typeof document!=='undefined'){
      const surface=document.createElement('canvas');surface.width=704;surface.height=464;
      const ink=surface.getContext('2d');
      if(ink){ink.translate(32,32);if(paintDetailedMarketBanks(ink))detailedMarketSurface=surface;}
    }
    if(detailedMarketSurface){ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(detailedMarketSurface,-32,-32,704,464);ctx.restore();return;}
    if(paintDetailedMarketBanks(ctx))return;
  }
  ctx.save();ctx.imageSmoothingEnabled=false;
  // Static half-pixel stitching and soft local light need rasterizing only once.
  // Node geometry checks keep the direct path, without any DOM requirement.
  const materialsReady=hasRefinedMaterials();
  // Replace the fallback raster once the material atlas is ready.
  if((!marketSurface||marketSurfaceHasMaterials!==materialsReady)&&typeof document!=='undefined'){
    const surface=document.createElement('canvas');surface.width=704*2;surface.height=464*2;
    const ink=surface.getContext('2d');
    if(ink){ink.scale(2,2);ink.translate(32,32);paintMarketBanks(ink);marketSurface=surface;marketSurfaceHasMaterials=materialsReady;}
  }
  if(marketSurface)ctx.drawImage(marketSurface,-32,-32,704,464);
  else paintMarketBanks(ctx);
  ctx.restore();
}
