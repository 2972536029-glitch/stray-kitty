import type {ParcelPool} from './types';
import {paintParcelFurniture,parcelWidth,type ParcelArtwork} from './furnitureArt';

/** A close room vignette: real furniture at a shared scale, styled display walls and floor. */
export function paintCollectionPreview(ctx:CanvasRenderingContext2D,pool:ParcelPool,art:ParcelArtwork,room:HTMLImageElement,width=1000,height=720){
  const moon=pool.currency==='tuna';
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.scale(width/1000,height/720);
  // Crop the original indoor materials; the facade and entrance never enter this photograph.
  ctx.filter=moon?'saturate(.22) brightness(.65)':'saturate(.75) brightness(.88)';
  ctx.drawImage(room,280,32,1110,270,0,0,1000,270);ctx.filter='none';
  if(moon){ctx.fillStyle='#304e7d38';ctx.fillRect(0,0,1000,193);}
  ctx.fillStyle=moon?'#293e55':'#6e7b5d';ctx.fillRect(0,193,1000,107);
  for(let x=0;x<1000;x+=65){ctx.fillStyle=moon?'#435567':'#96a080';ctx.fillRect(x,200,2,88);ctx.fillRect(x+6,206,52,1);ctx.fillRect(x+6,281,52,1);ctx.fillStyle=moon?'#203448':'#59684e';ctx.fillRect(x+61,200,2,88);}
  ctx.fillStyle=moon?'#b8a27a':'#c3b382';ctx.fillRect(0,191,1000,4);ctx.fillRect(0,295,1000,6);
  ctx.filter=moon?'saturate(.24) brightness(1.28)':'saturate(.7) brightness(1.08)';ctx.drawImage(room,255,310,1160,395,0,301,1000,419);ctx.filter='none';
  ctx.fillStyle=moon?'#7a95ad25':'#c4b26e14';ctx.fillRect(0,301,1000,419);
  // Light pools and glazing make the two themes feel distinct while preserving the source art.
  const light=ctx.createRadialGradient(moon?720:320,moon?240:160,10,500,390,620);light.addColorStop(0,moon?'#c9dcf024':'#ffeac13d');light.addColorStop(1,'#ffffff00');ctx.fillStyle=light;ctx.fillRect(0,0,1000,720);
  if(moon){ctx.fillStyle='#eee1b1';ctx.beginPath();ctx.arc(727,75,29,0,Math.PI*2);ctx.fill();ctx.fillStyle='#314a60';ctx.beginPath();ctx.arc(739,66,26,0,Math.PI*2);ctx.fill();for(let i=0;i<22;i++){const x=310+(i*79)%650,y=28+(i*47)%132;ctx.fillStyle=i%3?'#d4ddcf88':'#ead6a6';ctx.fillRect(x,y,2,5);ctx.fillRect(x-2,y+2,6,1);}}
  ctx.restore();ctx.save();ctx.imageSmoothingEnabled=false;
  const fit=Math.min(width/1000,height/650);ctx.translate((width-1000*fit)/2,(height-720*fit)/2);ctx.scale(fit,fit);
  const ids=pool.entries.map(entry=>entry.furnitureId),scale=1.42;
  const furniture=(i:number,x:number,y:number)=>paintParcelFurniture(ctx,ids[i],x,y,parcelWidth(ids[i])*scale,art);
  furniture(4,465,634);
  // Back wall: correspondence cabinet and work table; lounge to the left, reading nook to the right.
  const layout=[
    [9,437,222],[7,877,350],[6,674,378],[0,145,412],[1,291,552],
    [5,408,467],[11,695,515],[2,862,619],[3,153,624],[8,661,658],
    [10,moon?378:336,moon?235:627]
  ];
  for(const [i,x,y]of layout.sort((a,b)=>a[2]-b[2])){
    if(i!==9&&!(moon&&i===10)){ctx.fillStyle='#3f352523';ctx.beginPath();ctx.ellipse(x,y-2,parcelWidth(ids[i])*scale*.38,7,0,0,Math.PI*2);ctx.fill();}
    furniture(i,x,y);
  }
  ctx.restore();
  const shade=ctx.createLinearGradient(0,height*.8,0,height);shade.addColorStop(0,'#23302d00');shade.addColorStop(1,'#23302d55');ctx.fillStyle=shade;ctx.fillRect(0,height*.8,width,height*.2);
}
