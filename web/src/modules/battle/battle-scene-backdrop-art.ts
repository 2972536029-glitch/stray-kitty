import type {BattleSceneId} from './scene-art';
import type {SceneRoomLayout} from './scene-room-layout';
import {paintDetailedBackWall,paintRefinedMaterial} from './scene-detailed-exteriors';

interface BackdropTheme {base:string;wall:string;rim:string;floor:string;wood:string;light:string}
export const BACKDROP_THEMES:Record<BattleSceneId,BackdropTheme>={
  prologue:{base:'#182d39',wall:'#304452',rim:'#59717b',floor:'#273d48',wood:'#654e3c',light:'#e6b76c'},
  alley:{base:'#24363e',wall:'#40545c',rim:'#748781',floor:'#334951',wood:'#765a41',light:'#d9b574'},
  market:{base:'#34392d',wall:'#5b5a43',rim:'#938369',floor:'#4b4938',wood:'#8d6541',light:'#efbf70'},
  greenhouse:{base:'#354738',wall:'#586450',rim:'#94a58a',floor:'#46543d',wood:'#886f51',light:'#d3d4aa'},
  tunnel:{base:'#182b2d',wall:'#33494a',rim:'#6c7f74',floor:'#253c3d',wood:'#625b46',light:'#a6c4aa'},
  finale:{base:'#2c302c',wall:'#4c5048',rim:'#838979',floor:'#3b4038',wood:'#806448',light:'#e8c58b'},
};
const rect=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
// Surface accents retain half-pixel widths; silhouettes keep their existing snapped geometry.
const fine=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
const grain=(x:number,y:number)=>((Math.imul(x+31,73856093)^Math.imul(y+17,19349663))>>>0);

function rivet(ctx:CanvasRenderingContext2D,x:number,y:number){
  fine(ctx,'#162b3080',x,y,2.5,2.5);fine(ctx,'#bdc3a97a',x+.5,y,1.5,.5);
  fine(ctx,'#8a9b8c',x+.5,y+.5,1.5,1);fine(ctx,'#2c48443f',x+1,y+1,.5,1);
}

function masonry(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number,brickWidth=42,brickHeight=18){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();rect(ctx,p.base,x,y,w,h);
  for(let row=0;row<h/brickHeight;row++)for(let column=-1;column<w/brickWidth;column++){
    const bx=x+column*brickWidth+(row%2?brickWidth/2:0),by=y+row*brickHeight,n=grain(column,row);
    rect(ctx,p.wall,bx+1,by+1,brickWidth-2,brickHeight-2);
    rect(ctx,n%3?'#c1c8ae0c':'#101f2c20',bx+2,by+2,brickWidth-4,brickHeight-4);
    rect(ctx,p.rim+'50',bx+3,by+2,brickWidth-7,1);rect(ctx,p.base+'9a',bx+2,by+brickHeight-3,brickWidth-4,1);
    if(n%3===0){rect(ctx,p.rim+'30',bx+8,by+6,5,2);rect(ctx,p.base+'65',bx+brickWidth-9,by+9,3,2);}
    fine(ctx,p.rim+'24',bx+2.5,by+3,.5,brickHeight-7);
    fine(ctx,'#132b3433',bx+brickWidth-2.5,by+3,.5,brickHeight-6);
    // Short chipped arrises and mineral clusters, rather than a uniform noise field.
    if(n%4!==1){
      const sx=bx+6+n%9,sy=by+5+n%4;
      fine(ctx,p.rim+'29',sx,sy,3+n%5,.5);fine(ctx,p.base+'40',sx+2,sy+2,2+n%3,.5);
      fine(ctx,'#b6c4a41a',sx+5,sy+1,.5,.5);
    }
    if(n%7===2){
      fine(ctx,p.base+'72',bx+brickWidth-13,by+2,3,1);
      fine(ctx,p.rim+'30',bx+brickWidth-12,by+3,3,.5);
      fine(ctx,p.base+'54',bx+12,by+brickHeight-7,.5,3);
      fine(ctx,p.base+'45',bx+12.5,by+brickHeight-4,3,.5);
    }
  }
  ctx.restore();
}

function timber(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number){
  rect(ctx,'#18262b',x,y,w,h);
  for(let py=y;py<y+h;py+=12){
    const ph=Math.min(10,y+h-py);rect(ctx,p.wood,x,py,w,ph);
    paintRefinedMaterial(ctx,'wood',x,py,w,ph,.27);
    rect(ctx,'#d7b47a32',x,py,w,1);
    for(let px=x-52;px<x+w;px+=104){
      const start=px+(Math.floor(py/12)%2?47:0),n=grain(start,py);
      rect(ctx,'#292b2780',start,py,2,ph);rect(ctx,'#c8a77b25',start+5,py+3,28+n%31,1);
      rect(ctx,'#352c2c50',start+18,py+6,18+n%22,1);rect(ctx,'#202c2e',start+6,py+3,2,2);
      if(n%4===0)rect(ctx,'#3f342c',start+57,py+5,5,2);
      const edge=Math.max(x+2,start+4),end=Math.min(x+w-2,start+77);
      if(end-edge>3&&ph>7){
        fine(ctx,'#e5c29320',edge,py+1.5,end-edge,.5);
        fine(ctx,'#202e2c38',edge+1,py+ph-1,Math.max(1,end-edge-2),.5);
        fine(ctx,'#e4c18c24',edge+2,py+4,Math.min(13,end-edge-2),.5);
        fine(ctx,'#29352e70',edge+2,py+2,1,1);fine(ctx,'#cfb88d60',edge+2,py+2,1,.5);
      }
    }
  }
}

function metalBeam(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number){
  rect(ctx,'#102229',x-2,y-2,w+4,h+4);rect(ctx,p.wall,x,y,w,h);
  paintRefinedMaterial(ctx,'metal',x,y,w,h,.25);
  rect(ctx,p.rim,x+1,y+1,w-2,2);rect(ctx,p.rim+'99',x+1,y+3,2,h-4);
  rect(ctx,'#10232a99',x+w-3,y+3,2,h-3);
  if(h>w)for(let yy=y+9;yy<y+h-3;yy+=26){rect(ctx,'#11252b',x+3,yy,w-6,5);rect(ctx,'#c4c4a2',x+4,yy+1,2,2);}
  else for(let xx=x+10;xx<x+w-3;xx+=34){rect(ctx,'#182c2e',xx,y+3,3,4);rect(ctx,'#b4b6a0',xx,y+3,2,2);}
  if(w>4&&h>4){
    fine(ctx,'#d2d9be2e',x+1.5,y+1.5,w-3,.5);fine(ctx,'#0b242e47',x+w-2,y+4,.5,h-4);
    if(h>w){
      fine(ctx,p.rim+'30',x+3,y+4,.5,h-7);
      for(let yy=y+15,index=0;yy<y+h-6;yy+=26,index++){
        fine(ctx,'#c1c6a72a',x+3.5,yy,Math.max(.5,w-7),.5);
        fine(ctx,'#856c5040',x+w-3,yy+2,.5,2+index%3);
        fine(ctx,'#30483d54',x+4,yy-4,.5,1.5);
      }
    }else{
      fine(ctx,'#0b202c44',x+3,y+h-1,w-6,.5);
      for(let xx=x+19,index=0;xx<x+w-8;xx+=34,index++){
        fine(ctx,p.rim+'29',xx,y+3,5+index%4,.5);
        fine(ctx,'#6d624647',xx+4,y+h-2,3,.5);
        fine(ctx,'#243b3b70',xx-8,y+4,.5,1.5);
      }
    }
  }
}

function pool(ctx:CanvasRenderingContext2D,x:number,y:number,width=76){
  rect(ctx,'#f0b85c08',x-width/2,y-15,width,50);rect(ctx,'#ffcc7810',x-width*.38,y-7,width*.76,35);
  rect(ctx,'#ffce8114',x-width*.25,y,width*.5,22);
}

function lamp(ctx:CanvasRenderingContext2D,x:number,y:number,hanging=false){
  pool(ctx,x,y+22);
  if(hanging){rect(ctx,'#16282d',x-1,y-19,3,20);rect(ctx,'#7d8568',x,y-19,1,15);}
  else {rect(ctx,'#172b31',x-3,y+17,6,31);rect(ctx,'#9a9270',x-2,y+18,2,28);rect(ctx,'#1a2a2d',x-7,y+47,14,4);}
  rect(ctx,'#162930',x-8,y-2,16,21);rect(ctx,'#b17a45',x-6,y,12,16);
  rect(ctx,'#f6bd64',x-4,y+2,8,12);rect(ctx,'#ffe4a0',x-2,y+3,4,8);
  rect(ctx,'#6a6650',x-10,y-4,20,4);rect(ctx,'#b9a06b',x-6,y-5,12,1);rect(ctx,'#293a37',x-8,y+17,16,3);
  fine(ctx,'#fff0bc80',x-2.5,y+3,.5,7);fine(ctx,'#79512c65',x+.5,y+2,.5,13);
  fine(ctx,'#644f386b',x-5,y+8,10,.5);fine(ctx,'#c1b08355',x-7,y+18,13,.5);
  fine(ctx,'#d8c49d46',x-8,y-2,3,.5);fine(ctx,'#162b2d60',x+5,y+3,.5,12);
}

function pipe(ctx:CanvasRenderingContext2D,x:number,y:number,length:number,vertical=false){
  const part=(color:string,along:number,across:number,w:number,h:number)=>vertical?rect(ctx,color,x+across,y+along,h,w):rect(ctx,color,x+along,y+across,w,h);
  part('#12262c',0,0,length,14);part('#3f595e',1,2,length-2,10);part('#81928a',1,3,length-2,2);part('#263d45',1,11,length-2,2);
  for(let n=9;n<length-8;n+=52){part('#1c3035',n,-3,8,20);part('#687c75',n+1,-2,5,18);part('#b0ad83',n+2,0,2,2);part('#a17a514d',n+1,11,4,3);}
  const detail=(color:string,along:number,across:number,w:number,h:number)=>vertical?fine(ctx,color,x+across,y+along,h,w):fine(ctx,color,x+along,y+across,w,h);
  detail('#cad0af36',2,4.5,length-4,.5);detail('#10283355',2,10.5,length-4,.5);
  for(let n=9;n<length-8;n+=52){
    detail('#c1c8ac55',n+1.5,-1,4,.5);detail('#31484180',n+5.5,0,.5,13);
    detail('#e0c68e39',n+2,12,2,.5);detail('#765f4447',n+4,5,.5,5);
    if(n+29<length)detail('#96aca12e',n+15,7,12,.5);
  }
}

function windowFrame(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number,warm=false,broken=false,variant=0){
  const dim=grain(variant,37)%5===0;
  rect(ctx,'#132a32',x-5,y-5,w+10,h+12);rect(ctx,p.wood,x-3,y-3,w+6,h+6);
  paintRefinedMaterial(ctx,'wood',x-3,y-3,w+6,h+6,.25);
  rect(ctx,warm?(dim?'#8b7854':'#b4935b'):(dim?'#354f5a':'#446a72'),x,y,w,h);
  rect(ctx,warm?(dim?'#c4a668':'#e3bd75'):(dim?'#78988a29':'#91b0a13d'),x+3,y+3,w-6,h-6);
  for(let xx=x+4,pane=0;xx<x+w-3;xx+=18,pane++){
    const n=grain(variant,pane+11),top=3+n%5;
    if(n%4===1)rect(ctx,'#20394240',xx,y+3,Math.min(12,x+w-xx-2),h-6);
    if(n%3!==1)rect(ctx,warm?'#ffe5a940':'#b5cfbd36',xx,y+top,2+n%2,h-top-4-n%7);
    rect(ctx,'#203942',xx+11,y,3,h);
  }
  rect(ctx,'#263c3c',x,y+Math.floor(h*.55),w,3);rect(ctx,p.rim,x-6,y+h+4,w+12,3);
  rect(ctx,'#101f2980',x-4,y+h+7,w+10,3);
  fine(ctx,'#d4c7a23f',x-2,y-2,w+3,.5);fine(ctx,'#e0d0aa30',x-2,y+.5,.5,h+1);
  fine(ctx,'#142f365f',x+w+1,y+1,.5,h);fine(ctx,'#d7d5b528',x-4,y+h+4.5,w+8,.5);
  fine(ctx,'#0c273842',x+1,y+h-1,w-2,.5);
  for(let xx=x+15;xx<x+w-2;xx+=18){
    fine(ctx,'#a0b4a43d',xx,y+1,.5,h-2);fine(ctx,'#162e354b',xx+2,y+2,.5,h-3);
  }
  fine(ctx,p.rim+'55',x+1,y+Math.floor(h*.55),w-2,.5);
  for(const [sx,sy] of [[x-2,y-1],[x+w+1,y-1],[x-2,y+h+1],[x+w+1,y+h+1]]){
    fine(ctx,'#1b34376b',sx,sy,1.5,1.5);fine(ctx,'#c4c2a669',sx,sy,1,.5);
  }
  // Local dirt gathers beneath the frame; glass retains large clear areas.
  const stain=x+5+variant%11;
  fine(ctx,'#2f423535',stain,y+h-4,5,.5);fine(ctx,'#b1b9912e',stain+2,y+h-3,7,.5);
  if(broken){
    const dx=variant%3===0?4:variant%3===1?Math.floor(w*.5)-6:w-17;
    const dy=variant%2?Math.max(4,h-23):4;
    rect(ctx,'#192e36',x+dx,y+dy,13,10);rect(ctx,'#192e36',x+dx+4,y+dy+10,9,7);
    rect(ctx,'#b3c7ac',x+dx,y+dy,3,5);rect(ctx,'#b3c7ac88',x+dx+9,y+dy+16,4,2);
  }
  if(warm&&!dim)pool(ctx,x+w/2,y+h+11,w+24);
}

function sideWallDetail(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number,rightFacing:boolean){
  if(w<4||h<6)return;
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  const edge=rightFacing?x+1:x+w-2;
  fine(ctx,p.rim+'2c',edge,y+2,.5,h-4);
  for(let yy=y+18,index=0;yy<y+h-4;yy+=34,index++){
    const span=Math.min(w-3,12+index%3*5),start=rightFacing?x+2:x+w-span-2;
    fine(ctx,'#101f2b38',start,yy,span,.5);fine(ctx,p.rim+'1d',start+1,yy+.5,Math.max(1,span-2),.5);
    if(index%3===1){
      fine(ctx,'#70806622',rightFacing?x+4:x+w-6,yy-9,1,6);
      fine(ctx,'#131e282e',rightFacing?x+5:x+w-7,yy-8,.5,9);
    }
  }
  ctx.restore();
}

function vine(ctx:CanvasRenderingContext2D,x:number,y:number,height:number,seed=0){
  for(let t=0;t<height;t+=9){
    const xx=x+Math.round(Math.sin((t+seed)/23)*5),left=(t/9+seed)%2===0;
    rect(ctx,'#324e40',xx,y+t,2,10);rect(ctx,'#274c42',xx+(left?-8:1),y+t+2,9,5);
    rect(ctx,'#6f8b5b',xx+(left?-7:2),y+t+2,6,2);rect(ctx,'#a2aa682d',xx+(left?-5:4),y+t+4,3,1);
  }
}

/** Architecture surrounds one shared floor plane; it is never cut into the tactical cell mask. */
export function paintBackdropArchitecture(ctx:CanvasRenderingContext2D,scene:BattleSceneId,w:number,h:number,room:SceneRoomLayout){
  const p=BACKDROP_THEMES[scene],wallHeight=room.wallHeight;
  // Crop the upper wall naturally when the camera is close. Its foot always
  // remains behind the battlefield, including during zooming and scrolling.
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,Math.max(0,room.back+10));ctx.clip();
  ctx.translate(0,room.back-wallHeight);
  if(paintDetailedBackWall(ctx,scene,w,wallHeight)){
    // The complete material face replaces the old flat wall/window blocks.
  }else if(scene==='prologue'||scene==='alley'){
    masonry(ctx,p,0,0,w,wallHeight,scene==='prologue'?38:46,18);
    metalBeam(ctx,p,0,wallHeight-4,w,7);
    for(let x=34,index=0;x<w-32;x+=scene==='prologue'?182:216,index++){
      const n=grain(index,scene==='prologue'?13:29);
      windowFrame(ctx,p,x,23,scene==='prologue'?64:72,61,n%5<3,false,n%17);
      if(index===0||n%4===1){
        rect(ctx,'#152b34',x+86,21,38,wallHeight-29);rect(ctx,p.wood,x+89,24,32,wallHeight-32);
        paintRefinedMaterial(ctx,'wood',x+89,24,32,wallHeight-32,.32);
        for(let yy=32;yy<wallHeight-15;yy+=13)rect(ctx,'#a88c5d35',x+93,yy,23,2);
        rect(ctx,'#d1ac6b',x+111,wallHeight-37,3,3);rect(ctx,p.rim,x+85,wallHeight-7,42,4);
        fine(ctx,'#c3ab7f36',x+90,25,.5,wallHeight-36);fine(ctx,'#192d2c66',x+119,26,.5,wallHeight-37);
        for(let yy=37;yy<wallHeight-20;yy+=19){fine(ctx,'#3c3b3040',x+96,yy,17,.5);fine(ctx,'#d2b78a24',x+98,yy+.5,10,.5);}
        fine(ctx,'#222e2c70',x+110,wallHeight-38,5,6);fine(ctx,'#cbb88a8a',x+111,wallHeight-37,2,2);
        fine(ctx,'#d5bb822d',x+92,27,26,.5);rivet(ctx,x+88,29);
      }
      if(index===1||n%5===0)lamp(ctx,x+142,47+n%3*3,true);
      if(n%5===2)vine(ctx,x+78,9+n%9,32+n%29,index+3);
      if(scene==='alley'){
        if(n%3!==1)pipe(ctx,x+127,84,68);
        if(n%4!==2){rect(ctx,'#152b34',x+5,94,46,20);for(let k=0;k<5;k++)rect(ctx,p.rim+'80',x+9+k*8,97,2,14);}
      }
    }


  }else if(scene==='market'){
    masonry(ctx,p,0,0,w,wallHeight,48,20);pipe(ctx,0,16,w);
    for(let x=24,index=0;x<w;x+=156,index++){
      const n=grain(index,43),striped=n%5!==2;
      const fabric=n%3===0?'#4e7773':n%3===1?'#9c5e49':'#727657';
      metalBeam(ctx,p,x,4,10,wallHeight+2);
      rect(ctx,'#252c2b',x+12,36,132,44);rect(ctx,'#80644a',x+15,35,126,8);
      for(let k=0;k<9;k++){
        const cream=striped&&k%2===1,drop=23+grain(index,k)%4;
        rect(ctx,cream?'#b4a176':fabric,x+16+k*14,43,14,drop);rect(ctx,cream?'#d6bd8b':'#b7a27a',x+17+k*14,43,12,2);
        rect(ctx,'#243332',x+16+k*14,43+drop,13,4);
        fine(ctx,'#172d2b24',x+28+k*14,46,.5,drop-4);
        fine(ctx,'#ddc69c36',x+18+k*14,43+drop-1.5,9,.5);
        if(k%3===1){fine(ctx,'#d7c09542',x+19+k*14,45,1,.5);fine(ctx,'#d7c09542',x+24+k*14,45,1,.5);}
      }
      rect(ctx,'#251f203d',x+17,75,125,14);
      if(index===0||n%3===0)lamp(ctx,x+68+n%3*11,22,true);
      // Only a few booths keep hanging supplies; clear bays break up the repeated awnings.
      if(n%4===1){rect(ctx,'#182b2c',x+15,93,125,2);for(let k=0;k<3;k++)rect(ctx,k%2?'#aaa27b':'#705e43',x+31+k*31,94,7,5+(k+index)%3*3);}
    }

  }else if(scene==='greenhouse'){
    masonry(ctx,p,0,wallHeight-35,w,43,32,14);
    for(let x=25,index=0;x<w-20;x+=96,index++){
      // One altered opening per seven bays, at a different fixed offset in each
      // group. The load-bearing columns stay regular; the glazing does not.
      const group=Math.floor(index/7),patched=index%7===3+(grain(group,149)%3===0?1:0);
      const n=grain(index,67),broken=!patched&&(n%5===1||n%7===3);
      if(patched){
        const glassHeight=wallHeight-58;
        rect(ctx,'#263e3e',x-2,12,78,glassHeight+5);
        if(group%2===0){
          for(let plank=0;plank<4;plank++){
            const px=x+2+plank*18,top=15+(plank+group)%3;
            rect(ctx,plank%3===0?'#62694f':plank%3===1?'#737357':'#697054',px,top,17,glassHeight-3);
            rect(ctx,'#a8a38142',px+1,top+1,1,glassHeight-6);
            rect(ctx,'#354b3c70',px+10,top+8,1,Math.max(8,glassHeight-18));
            rect(ctx,'#35483c',px+3,top+4,2,2);
          }
          rect(ctx,'#4c5b43',x+1,22+Math.floor(glassHeight*.5),72,5);
          rect(ctx,'#a5a08038',x+2,22+Math.floor(glassHeight*.5),70,1);
        }else{
          // An open frame has only one surviving corner of glass, not another
          // full-height row of mullions and reflections.
          rect(ctx,'#36564e',x+3,16,26,Math.min(22,glassHeight-8));
          rect(ctx,'#99b8a346',x+5,17,3,Math.min(16,glassHeight-12));
          rect(ctx,'#adc4a96b',x+26,18,2,8);rect(ctx,'#adc4a94d',x+22,26,5,2);
          rect(ctx,'#152e3155',x+33,17,36,glassHeight-6);
        }
        rect(ctx,p.rim+'80',x-3,glassHeight+18,80,3);
      }else windowFrame(ctx,p,x,14,74,wallHeight-58,false,broken,n%19);
      metalBeam(ctx,p,x-9,0,7,wallHeight+8);
      if(index===1||n%5===0)vine(ctx,x+(n%2?71:-1),9+n%13,39+n%36,index+5);
      if(n%3===0){rect(ctx,'#d6dfab15',x+17,wallHeight+15,43+n%17,4);rect(ctx,'#d6dfab0e',x+23,wallHeight+19,51+n%13,4);}
      if(broken&&n%2===0){rect(ctx,'#a7c9bb55',x+12+n%21,wallHeight-5,5,2);rect(ctx,'#a7c9bb42',x+27+n%13,wallHeight+2,3,2);}
    }
    metalBeam(ctx,p,0,6,w,7);metalBeam(ctx,p,0,wallHeight-38,w,6);



  }else if(scene==='tunnel'){
    masonry(ctx,p,0,0,w,wallHeight+8,35,16);
    for(let x=32,index=0;x<w;x+=188,index++){
      const n=grain(index,83);
      rect(ctx,'#142a32',x,42,142,wallHeight-34);
      for(let step=0;step<5;step++){
        const rise=step*7;rect(ctx,'#5e756d',x+step*10,42-rise,142-step*20,7);
        rect(ctx,'#91a19150',x+step*10+2,42-rise,138-step*20,1);
        fine(ctx,'#bac4a42a',x+step*10+3,43-rise,132-step*20,.5);
        fine(ctx,'#102f3439',x+step*10+2,47.5-rise,138-step*20,.5);
        for(let joint=x+step*10+19;joint<x+142-step*10-5;joint+=27){
          fine(ctx,'#293f3b66',joint,43-rise,.5,5);fine(ctx,'#a8b89b2c',joint+1,43-rise,.5,4);
        }
      }
      metalBeam(ctx,p,x,43,9,wallHeight-32);metalBeam(ctx,p,x+133,43,9,wallHeight-32);
      if(n%4!==1)pipe(ctx,x+13,77,115);
      if(index===0||n%3===0)lamp(ctx,x+61+n%3*10,52+n%3*3,true);
      if(n%3===1){rect(ctx,'#183747',x+23+n%37,wallHeight-7,26+n%17,5);rect(ctx,'#7fa7ad55',x+29+n%37,wallHeight-6,15,1);}
      if(n%5===3)vine(ctx,x+(n%2?128:17),45+n%12,23+n%21,index+2);
    }



  }else{
    rect(ctx,'#252f32',0,0,w,wallHeight);
    for(let x=0;x<w;x+=17){
      rect(ctx,'#4f5c57',x,0,12,wallHeight);
      paintRefinedMaterial(ctx,'metal',x,0,12,wallHeight,.28);
      rect(ctx,'#8a938044',x+1,0,2,wallHeight);rect(ctx,'#1b2b30',x+12,0,3,wallHeight);
      for(let y=12;y<wallHeight;y+=38)rect(ctx,'#b0ad8559',x+4,y,2,2);
      if(grain(x,2)%3===0)rect(ctx,'#93674550',x+8,wallHeight-22,3,13);
      fine(ctx,'#c3ceac25',x+2.5,2,.5,wallHeight-4);fine(ctx,'#0c283238',x+10.5,1,.5,wallHeight-2);
      for(let y=18;y<wallHeight-6;y+=38){
        fine(ctx,'#9fa88b25',x+4,y,4,.5);fine(ctx,'#2d454252',x+5,y-5,.5,1.5);
        if(grain(x,y)%3===1)fine(ctx,'#ad8b5d2e',x+8,y+3,.5,3);
      }
    }
    for(let x=26,index=0;x<w;x+=184,index++){
      const n=grain(index,101);
      metalBeam(ctx,p,x,0,11,wallHeight+4);windowFrame(ctx,p,x+31,26,93,45,false,n%5===1,n%23);
      rect(ctx,'#273c3a',x+28,75,100,8);rect(ctx,'#929780',x+29,75,99,2);
      if(index===1||n%5===2)lamp(ctx,x+151,81+n%3*3,true);
    }
    metalBeam(ctx,p,0,13,w,10);metalBeam(ctx,p,0,wallHeight-4,w,11);


  }
  // Fine contact shadow keeps the structure dimensional without dimming the tactical canvas.
  rect(ctx,'#0c1f2826',0,wallHeight+8,w,5);
  if(scene==='prologue'||scene==='alley'){
    // Keep the open title / statistics legible over warm windows. This shade is
    // confined to the top architecture and fades away before the battlefield.
    ctx.save();
    const topShade=ctx.createLinearGradient(0,0,0,95);
    topShade.addColorStop(0,'#0c202b2b');topShade.addColorStop(.6,'#0c202b17');topShade.addColorStop(1,'#0c202b00');
    ctx.fillStyle=topShade;ctx.fillRect(0,0,w,95);
    const titleShade=ctx.createLinearGradient(0,0,290,0);
    titleShade.addColorStop(0,'#0b1d25a6');titleShade.addColorStop(.65,'#0b1d25a6');titleShade.addColorStop(1,'#0b1d2500');
    ctx.fillStyle=titleShade;
    for(let y=0;y<95;y+=5){ctx.globalAlpha=y<50?.78:.78*(95-y)/45;ctx.fillRect(0,y,290,5);}
    ctx.restore();
  }

  ctx.restore();

  // The continuous plinth establishes a wall / floor junction independently
  // of which cells are playable. Its shadow fades across the shared ground.
  const baseY=room.back+7;
  rect(ctx,p.base,0,baseY,w,3);rect(ctx,p.rim+'90',0,baseY,w,1);
  const contact=ctx.createLinearGradient(0,baseY+3,0,baseY+23);
  contact.addColorStop(0,'#0b182a5c');contact.addColorStop(1,'#0b182a00');
  ctx.fillStyle=contact;ctx.fillRect(0,baseY+3,w,20);

  // Structure may naturally leave the camera frame; never pull it in over
  // the board merely to fit the screen.
  const floorTop=room.back+10,floorBottom=room.front;
  const left=Math.min(w,Math.max(0,room.left)),right=Math.min(w,Math.max(0,room.right));
  if(room.left>0){rect(ctx,p.base,0,floorTop,left,Math.max(0,h-floorTop));sideWallDetail(ctx,p,0,floorTop,left,Math.max(0,h-floorTop),false);metalBeam(ctx,p,left-9,floorTop,7,Math.max(0,floorBottom-floorTop));}
  if(room.right<w){rect(ctx,p.base,right,floorTop,w-right,Math.max(0,h-floorTop));sideWallDetail(ctx,p,right,floorTop,w-right,Math.max(0,h-floorTop),true);metalBeam(ctx,p,right+2,floorTop,7,Math.max(0,floorBottom-floorTop));}
  if(room.front<h){
    const front=Math.max(0,room.front);
    if(scene==='market'){timber(ctx,p,left,front,right-left,h-front);rect(ctx,p.base+'70',left,front,right-left,h-front);}
    else masonry(ctx,p,left,front,right-left,h-front,scene==='greenhouse'?34:42,16);
    metalBeam(ctx,p,left,front,right-left,6);
  }
}
