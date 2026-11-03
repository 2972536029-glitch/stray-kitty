import type {BattleSceneId} from './scene-art';
import {paintDetailedExterior,paintDetailedGardenWall,paintDetailedStructure,paintDetailedWarehousePerimeter,paintDetailedWorkstation,paintRefinedMaterial} from './scene-detailed-exteriors';

export interface PerimeterPropBounds {x:number;y:number;width:number;height:number}
type StructureKind='house'|'soil-bed'|'garden-wall'|'flower-frame'|'counter'|'vent'|'tunnel-service-corner'|'pallet-jack'|'pipe-cradle';
interface Structure {kind:StructureKind;x:number;y:number;width:number;height:number;variant?:number}
interface Material {edge:string;face:string;top:string;light:string;wood:string;leaf:string}
const material:Record<BattleSceneId,Material>={
  prologue:{edge:'#243b45',face:'#3a5059',top:'#526974',light:'#82918c',wood:'#79664d',leaf:'#586d51'},
  alley:{edge:'#253a44',face:'#3c515b',top:'#546a73',light:'#879690',wood:'#77634d',leaf:'#536b51'},
  market:{edge:'#393d34',face:'#625a47',top:'#82745a',light:'#aaa082',wood:'#89704f',leaf:'#6c7951'},
  greenhouse:{edge:'#314638',face:'#55624b',top:'#7b8467',light:'#a6af8b',wood:'#867151',leaf:'#557448'},
  tunnel:{edge:'#213942',face:'#3c5560',top:'#5a7378',light:'#8b9f9b',wood:'#6d644e',leaf:'#496759'},
  finale:{edge:'#303e40',face:'#505c58',top:'#73796a',light:'#a0a592',wood:'#7a6851',leaf:'#5c6d53'},
};

/** Entire silhouettes, including shadows, fit these authored exterior boxes.
 * Coordinates are logical cells, never inferred from the viewport or CELLS mask. */
const structures:Record<BattleSceneId,readonly Structure[]>={
  prologue:[],
  alley:[
    {kind:'house',x:.55,y:-.35,width:2.15,height:3.05},
    {kind:'house',x:5.6,y:.15,width:3.9,height:2.55,variant:1},
  ],
  market:[
    {kind:'counter',x:-2.25,y:.1,width:1.95,height:1.45},
    {kind:'counter',x:8.3,y:4.0,width:1.5,height:1.1,variant:1},
  ],
  greenhouse:[
    {kind:'soil-bed',x:5.25,y:-.4,width:3.35,height:1.1},
    {kind:'flower-frame',x:7.3,y:.9,width:1.45,height:.8},
    {kind:'garden-wall',x:.05,y:2.3,width:.75,height:2.55},
    {kind:'soil-bed',x:.2,y:5.05,width:4.6,height:1.5,variant:1},
  ],
  tunnel:[
    // The entire corner lives in the missing E1–E3 notch, including on narrow screens.
    {kind:'tunnel-service-corner',x:0,y:4,width:2.9,height:1.1},
  ],
  finale:[
    {kind:'pallet-jack',x:.2,y:-.1,width:2.45,height:.8},
    {kind:'pipe-cradle',x:.45,y:6.35,width:2.35,height:.8},
  ],
};
type Context=CanvasRenderingContext2D;
const r=(ctx:Context,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
function shadow(ctx:Context,w:number,h:number){
  r(ctx,'#162a3238',4,h-10,w-8,7);r(ctx,'#162a3255',8,h-14,w-16,8);
}
function brickFace(ctx:Context,p:Material,x:number,y:number,w:number,h:number){
  r(ctx,p.face,x,y,w,h);
  // Small material clusters live on the face itself; no grain over the floor.
  for(let yy=1;yy<h-1;yy+=2.5)for(let xx=2;xx<w-2;xx+=3.5){
    const n=(Math.imul(Math.floor(xx*2)+17,73856093)^Math.imul(Math.floor(yy*2)+23,19349663))>>>0;
    if(n%5===0)r(ctx,p.light+'21',x+xx,y+yy,1+(n%3)*.5,.5);
    else if(n%7===0)r(ctx,p.edge+'2c',x+xx,y+yy,.5,1);
  }
  for(let row=0;row*11<h;row++){
    const yy=y+row*11;r(ctx,p.edge+'75',x,yy,w,1);
    for(let col=(row%2?13:0);col<w;col+=29){r(ctx,p.edge+'85',x+col,yy,1,Math.min(10,h-row*11));if(col+17<w)r(ctx,p.light+'26',x+col+3,yy+2,14,1);}
  }
}
function ledge(ctx:Context,p:Material,x:number,y:number,w:number,h:number){
  r(ctx,p.edge,x,y,w,h);r(ctx,p.top,x+2,y+1,w-4,Math.max(2,h*.42));
  r(ctx,p.light+'a0',x+3,y+1,w-6,1);r(ctx,p.face,x+2,y+h*.5,w-4,h*.5-2);
}
function house(ctx:Context,p:Material,w:number,h:number,variant:number){
  if(paintDetailedExterior(ctx,variant?'wide-home':'narrow-home',w,h))return;
  shadow(ctx,w,h);
  const left=6,right=w-9,roofY=9,roofBottom=h*(variant?.56:.46),floor=h-14;
  // Deep roof and short upright facade read as a low building beside the lane.
  r(ctx,p.edge,left,roofY,right-left,floor-roofY);
  brickFace(ctx,p,left+3,roofBottom,right-left-6,floor-roofBottom);
  r(ctx,variant?'#47585d':'#405764',left+3,roofY+3,right-left-6,roofBottom-roofY-5);
  for(let yy=roofY+9;yy<roofBottom-3;yy+=10){
    r(ctx,'#1e374166',left+4,yy,right-left-8,2);
    for(let xx=left+8+(Math.floor(yy/10)%2)*12;xx<right-8;xx+=26){r(ctx,p.light+'45',xx,yy-5,18,1);r(ctx,p.edge+'aa',xx,yy-5,1,5);}
  }
  ledge(ctx,p,left-1,roofBottom-3,right-left+2,8);
  const doorX=variant?left+18:right-47,doorW=29,doorY=roofBottom+11,doorH=floor-doorY-3;
  r(ctx,p.edge,doorX-3,doorY-3,doorW+6,doorH+5);r(ctx,p.wood,doorX,doorY,doorW,doorH);
  for(let xx=doorX+6;xx<doorX+doorW;xx+=7)r(ctx,'#3c40377a',xx,doorY+2,1,doorH-4);
  r(ctx,'#a59366',doorX+doorW-7,doorY+doorH*.55,2,3);
  const winX=variant?right-74:left+17,winY=doorY+3,winW=43,winH=Math.min(24,doorH-8);
  r(ctx,p.edge,winX-3,winY-3,winW+6,winH+7);r(ctx,'#3d5a60',winX,winY,winW,winH);
  r(ctx,'#8caaa34f',winX+3,winY+2,3,winH-4);
  r(ctx,p.edge,winX+20,winY,3,winH);r(ctx,p.edge,winX,winY+winH*.55,winW,2);
  ledge(ctx,p,left-2,floor-5,right-left+4,8);
  // One gutter and one roof repair distinguish the two masses without new clutter.
  r(ctx,p.edge,variant?right-9:left+6,roofBottom+5,5,floor-roofBottom-8);
  r(ctx,p.light+'65',variant?right-8:left+7,roofBottom+6,1,floor-roofBottom-11);
  if(variant){r(ctx,'#666a58',w*.51,roofY+11,33,19);r(ctx,'#9b9a782d',w*.51+2,roofY+12,28,2);}
}
function leaf(ctx:Context,x:number,y:number,p:Material,size=1){
  plantClump(ctx,p,x,y,'broadleaf',size*.55);
}
type PlantKind='broadleaf'|'shrub'|'dry';
function plantClump(ctx:Context,p:Material,x:number,y:number,kind:PlantKind,size=1){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  if(kind==='dry'){
    r(ctx,'#5b5840',-1,-26,3,27);r(ctx,'#9b9165',-1,-25,1,24);
    for(const [xx,yy,ww,hh] of [[-8,-21,7,2],[-10,-25,3,5],[2,-16,8,2],[8,-22,2,7],[-6,-9,5,2],[-8,-13,2,5]])r(ctx,'#8b8057',xx,yy,ww,hh);
    r(ctx,'#b1a279',-10,-25,2,1);r(ctx,'#b1a279',8,-22,2,1);
  }else{
    const ends=kind==='broadleaf'?[[-19,-14],[-13,-25],[-2,-31],[12,-25],[22,-16],[-13,-7],[14,-7]]:[[-19,-8],[-13,-18],[-5,-25],[8,-22],[18,-12],[8,-5],[-9,-5]];
    for(const [i,[tx,ty]] of ends.entries()){
      const baseY=-3-i%3,dx=tx,dy=ty-baseY,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
      const broad=kind==='broadleaf'?3.5:2.8,mx=tx*.65,my=baseY+dy*.65;
      ctx.beginPath();ctx.moveTo(0,baseY);ctx.lineTo(mx+nx*broad,my+ny*broad);ctx.lineTo(tx,ty);ctx.lineTo(mx-nx*broad*.8,my-ny*broad*.8);ctx.closePath();ctx.fillStyle=i%2?p.leaf:'#456642';ctx.fill();
      ctx.beginPath();ctx.moveTo(0,baseY);ctx.lineTo(tx*.91,baseY+dy*.91);ctx.lineWidth=.65;ctx.strokeStyle=i%2?'#879867':'#6e885a';ctx.stroke();
      for(let j=3;j<7;j++){
        const t=j/8,px=tx*t,py=baseY+dy*t;
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+nx*broad*.6-dx*.05,py+ny*broad*.6-dy*.05);ctx.lineWidth=.4;ctx.strokeStyle='#a6b17b44';ctx.stroke();
      }
    }
    r(ctx,'#849061',0,-8,.75,9);
  }
  ctx.restore();
}
function earthDetail(ctx:Context,x:number,y:number){
  r(ctx,'#302f2466',x-3,y+3,14,3);r(ctx,'#8d8568',x,y,7,4);r(ctx,'#b5aa83',x+1,y,4,1);
  r(ctx,'#655b40',x+10,y+4,5,2);r(ctx,'#9c8b62',x+10,y+4,3,1);
}
function soilBed(ctx:Context,p:Material,w:number,h:number,variant:number){
  if(paintDetailedExterior(ctx,'planted-bed',w,h))return;
  shadow(ctx,w,h);
  const y=10,front=h-25;
  r(ctx,p.edge,6,y,w-14,h-y-12);r(ctx,'#4c4934',12,y+5,w-26,front-y-4);
  r(ctx,'#77674836',17,y+10,w*.37,8);r(ctx,'#313d2b55',w*.58,y+8,w*.28,13);
  brickFace(ctx,p,8,front,w-18,17);ledge(ctx,p,5,y,w-12,7);
  r(ctx,p.top,7,y+6,6,front-y);r(ctx,p.light+'85',7,y+7,2,front-y-1);
  r(ctx,'#384c36',w-15,y+6,6,front-y+4);ledge(ctx,p,7,front-2,w-18,7);
  earthDetail(ctx,w*.22,front-12);earthDetail(ctx,w*.77,front-11);
  const plants:readonly [number,PlantKind,number,number][]=variant
    ?[[.12,'shrub',1.15,3],[.32,'broadleaf',.9,6],[.48,'dry',.9,8],[.68,'broadleaf',1.05,2],[.86,'shrub',.8,5]]
    :[[.14,'dry',.8,8],[.34,'broadleaf',.95,3],[.61,'shrub',1.12,1],[.85,'broadleaf',.74,7]];
  for(const [at,kind,size,lift] of plants)plantClump(ctx,p,18+(w-38)*at,front-lift,kind,size);
  r(ctx,'#9aa47760',w*.48,front+8,11,2);r(ctx,'#34483370',w*.48+6,front+10,8,2);
}
function gardenWall(ctx:Context,p:Material,w:number,h:number){
  if(paintDetailedGardenWall(ctx,w,h))return;
  shadow(ctx,w,h);r(ctx,p.edge,7,10,w-16,h-23);r(ctx,'#494b35',13,16,w-30,h-43);
  brickFace(ctx,p,w-17,17,9,h-34);r(ctx,p.top,w-18,10,8,h-25);r(ctx,p.light+'85',w-18,11,2,h-28);
  r(ctx,p.top,7,10,6,h-25);r(ctx,p.light+'60',8,11,1,h-30);
  ledge(ctx,p,6,9,w-13,7);brickFace(ctx,p,9,h-28,w-21,15);ledge(ctx,p,7,h-30,w-17,7);
  earthDetail(ctx,24,65);earthDetail(ctx,23,119);earthDetail(ctx,26,165);
  plantClump(ctx,p,28,43,'broadleaf',.8);plantClump(ctx,p,30,94,'shrub',.85);
  plantClump(ctx,p,25,139,'dry',.95);plantClump(ctx,p,28,172,'broadleaf',.65);
}
function flowerFrame(ctx:Context,p:Material,w:number,h:number){
  if(paintDetailedExterior(ctx,'glass-frame',w,h))return;
  shadow(ctx,w,h);r(ctx,p.edge,9,5,w-20,h-18);r(ctx,'#344b3d',13,9,w-28,h-27);
  for(let xx=13;xx<w-16;xx+=22){r(ctx,p.wood,xx,8,3,h-24);r(ctx,p.light+'70',xx,8,1,h-24);}
  for(const yy of [12,h*.45,h-25]){r(ctx,p.wood,12,yy,w-26,3);r(ctx,p.light+'60',13,yy,w-28,1);}
  leaf(ctx,w*.27,h*.5,p,.9);leaf(ctx,w*.67,h*.62,p,1.1);
  r(ctx,p.edge,12,h-25,w-27,14);r(ctx,'#886e4b',14,h-23,w-31,10);r(ctx,'#a2946c',14,h-23,w-31,2);
}
function counter(ctx:Context,p:Material,w:number,h:number,variant:number){
  if(paintDetailedStructure(ctx,variant?'market-counter-cloth':'market-counter',w,h))return;
  shadow(ctx,w,h);
  const front=h*.47,foot=h-16;
  r(ctx,p.edge,7,front,w-16,foot-front);r(ctx,'#493e30',11,front+5,w-24,foot-front-7);
  // Open shelves under a deep timber worktop, rather than a tall solid brick face.
  for(const xx of [11,w*.48,w-18]){r(ctx,p.wood,xx,front,5,foot-front+3);r(ctx,p.light+'80',xx,front+1,1,foot-front);}
  const shelf=front+(foot-front)*.58;
  r(ctx,p.wood,10,shelf,w-23,4);r(ctx,p.light+'70',10,shelf,w-23,1);
  for(let i=0;i<3;i++){
    const xx=20+i*(w-50)/3,yy=shelf-16-(i%2)*4;
    r(ctx,'#aa9060',xx,yy,15,15+(i%2)*4);r(ctx,'#d0b17c',xx,yy,15,2);
    r(ctx,'#604b35',xx+4,yy+4,1,8);r(ctx,'#604b35',xx+10,yy+4,1,8);
  }
  r(ctx,p.edge,5,9,w-12,front+1);r(ctx,p.wood,7,11,w-16,front-4);
  paintRefinedMaterial(ctx,'wood',7,11,w-16,front-4,.4);
  for(let yy=13;yy<front;yy+=8){r(ctx,'#c2a77955',9,yy,w-20,1);r(ctx,'#423d3280',9,yy+6,w-20,1);}
  ledge(ctx,p,5,front-2,w-12,7);
  for(let i=0;i<3;i++){
    const xx=16+i*(w-42)/3,yy=16+(i%2)*8;
    r(ctx,'#3b3d2b',xx-2,yy-2,23,16);r(ctx,variant?'#627554':'#9c8056',xx,yy,19,11);
    r(ctx,variant?'#a5ad74':'#c5a26f',xx+2,yy+1,6,4);r(ctx,'#d0bc8d',xx+10,yy+4,6,3);
    r(ctx,'#4b5037',xx+2,yy+9,16,2);
  }
  if(variant){r(ctx,'#6c8178',w*.62,front+5,24,foot-front-8);r(ctx,'#95a59870',w*.62+2,front+6,3,foot-front-11);}
}
function vent(ctx:Context,p:Material,w:number,h:number){
  if(paintDetailedStructure(ctx,'vent',w,h))return;
  shadow(ctx,w,h);brickFace(ctx,p,8,22,w-18,h-36);ledge(ctx,p,5,12,w-12,14);
  paintRefinedMaterial(ctx,'metal',8,22,w-18,h-36,.3);
  r(ctx,p.edge,15,16,w-33,8);
  for(let xx=19;xx<w-23;xx+=9){r(ctx,p.light+'80',xx,16,3,6);r(ctx,p.face,xx+3,17,2,6);}
  const faceY=29,faceH=Math.max(7,h-46);r(ctx,p.edge,22,faceY,w-48,faceH);
  for(let yy=faceY+2;yy<faceY+faceH-1;yy+=5){r(ctx,p.top,24,yy,w-52,2);r(ctx,p.light+'35',25,yy,w-54,1);}
  for(const xx of [12,w-18]){r(ctx,'#a3a78b',xx,16,2,2);r(ctx,'#2d4548',xx,31,2,2);}
}

/** World-anchored L corner: a low sill links the wire footing to the drain.
 * Low portable storage collects below that base, leaving the service floor open.
 * The caller's actual-cell clip protects the nearby route, goal and entrances. */
function tunnelServiceCorner(ctx:Context,p:Material){
  // This eight-unit toe continues the existing footing's bottom at world y322.
  r(ctx,'#0d252c4d',2,9,228,4);
  brickFace(ctx,p,4,4,224,6);
  r(ctx,p.top,4,2,224,2);r(ctx,p.light+'65',6,2,220,1);
  r(ctx,p.edge+'b0',4,9,224,1);
  // Both storage and drain sit below the footing, entirely inside the missing cells.
  ctx.save();ctx.translate(8,6);
  if(!paintDetailedWorkstation(ctx,'tunnel-tools',104,44)){
    // The loading fallback remains portable storage, with no detached machine.
    r(ctx,p.edge,3,14,51,28);r(ctx,p.face,5,16,47,24);
    r(ctx,p.top,7,14,43,3);r(ctx,p.light,22,8,18,3);
    r(ctx,p.edge,60,21,40,20);r(ctx,p.face,62,23,36,16);
    for(let y=26;y<34;y+=3)r(ctx,p.light+'80',66,y,25,1);
  }
  ctx.restore();
  ctx.save();ctx.translate(120,30);vent(ctx,p,108,48);ctx.restore();
  // Sparse grit sits against the sill; the surrounding wet paving stays open.
  r(ctx,p.face+'a0',8,13,4,2);r(ctx,p.top+'90',19,11,3,1);
  r(ctx,p.light+'50',31,15,2,1);r(ctx,p.edge+'70',111,57,5,1);
}
/** The caller has translated to the board origin. Returned boxes are CSS pixels
 * relative to that same origin, including shadows; use them to reserve scenery space. */
export function paintPerimeterProps(ctx:Context,scene:BattleSceneId,cellWidth:number,cellHeight:number):PerimeterPropBounds[]{
  if(!Number.isFinite(cellWidth)||!Number.isFinite(cellHeight)||cellWidth<=0||cellHeight<=0)return [];
  const result:PerimeterPropBounds[]=[],p=material[scene];
  ctx.save();ctx.scale(cellWidth/80,cellHeight/80);ctx.imageSmoothingEnabled=false;
  for(const plan of structures[scene]){
    const w=plan.width*80,h=plan.height*80;
    ctx.save();ctx.translate(plan.x*80,plan.y*80);
    switch(plan.kind){
      case 'house':house(ctx,p,w,h,plan.variant??0);break;
      case 'soil-bed':soilBed(ctx,p,w,h,plan.variant??0);break;
      case 'garden-wall':gardenWall(ctx,p,w,h);break;
      case 'flower-frame':flowerFrame(ctx,p,w,h);break;
      case 'counter':counter(ctx,p,w,h,plan.variant??0);break;
      case 'vent':vent(ctx,p,w,h);break;
      case 'tunnel-service-corner':tunnelServiceCorner(ctx,p);break;
      case 'pallet-jack':case 'pipe-cradle':paintDetailedWarehousePerimeter(ctx,plan.kind,w,h);break;
    }
    ctx.restore();result.push({x:plan.x*cellWidth,y:plan.y*cellHeight,width:plan.width*cellWidth,height:plan.height*cellHeight});
  }
  ctx.restore();return result;
}
