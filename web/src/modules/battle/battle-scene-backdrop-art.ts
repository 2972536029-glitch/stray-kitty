import type {BattleSceneId} from './scene-art';

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
const grain=(x:number,y:number)=>((Math.imul(x+31,73856093)^Math.imul(y+17,19349663))>>>0);

function masonry(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number,brickWidth=42,brickHeight=18){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();rect(ctx,p.base,x,y,w,h);
  for(let row=0;row<h/brickHeight;row++)for(let column=-1;column<w/brickWidth;column++){
    const bx=x+column*brickWidth+(row%2?brickWidth/2:0),by=y+row*brickHeight,n=grain(column,row);
    rect(ctx,p.wall,bx+1,by+1,brickWidth-2,brickHeight-2);
    rect(ctx,n%3?'#c1c8ae0c':'#101f2c20',bx+2,by+2,brickWidth-4,brickHeight-4);
    rect(ctx,p.rim+'50',bx+3,by+2,brickWidth-7,1);rect(ctx,p.base+'9a',bx+2,by+brickHeight-3,brickWidth-4,1);
    if(n%3===0){rect(ctx,p.rim+'30',bx+8,by+6,5,2);rect(ctx,p.base+'65',bx+brickWidth-9,by+9,3,2);}
  }
  ctx.restore();
}

function timber(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number){
  rect(ctx,'#18262b',x,y,w,h);
  for(let py=y;py<y+h;py+=12){
    const ph=Math.min(10,y+h-py);rect(ctx,p.wood,x,py,w,ph);rect(ctx,'#d7b47a32',x,py,w,1);
    for(let px=x-52;px<x+w;px+=104){
      const start=px+(Math.floor(py/12)%2?47:0),n=grain(start,py);
      rect(ctx,'#292b2780',start,py,2,ph);rect(ctx,'#c8a77b25',start+5,py+3,28+n%31,1);
      rect(ctx,'#352c2c50',start+18,py+6,18+n%22,1);rect(ctx,'#202c2e',start+6,py+3,2,2);
      if(n%4===0)rect(ctx,'#3f342c',start+57,py+5,5,2);
    }
  }
}

function metalBeam(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number){
  rect(ctx,'#102229',x-2,y-2,w+4,h+4);rect(ctx,p.wall,x,y,w,h);
  rect(ctx,p.rim,x+1,y+1,w-2,2);rect(ctx,p.rim+'99',x+1,y+3,2,h-4);
  rect(ctx,'#10232a99',x+w-3,y+3,2,h-3);
  if(h>w)for(let yy=y+9;yy<y+h-3;yy+=26){rect(ctx,'#11252b',x+3,yy,w-6,5);rect(ctx,'#c4c4a2',x+4,yy+1,2,2);}
  else for(let xx=x+10;xx<x+w-3;xx+=34){rect(ctx,'#182c2e',xx,y+3,3,4);rect(ctx,'#b4b6a0',xx,y+3,2,2);}
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
}

function pipe(ctx:CanvasRenderingContext2D,x:number,y:number,length:number,vertical=false){
  const part=(color:string,along:number,across:number,w:number,h:number)=>vertical?rect(ctx,color,x+across,y+along,h,w):rect(ctx,color,x+along,y+across,w,h);
  part('#12262c',0,0,length,14);part('#3f595e',1,2,length-2,10);part('#81928a',1,3,length-2,2);part('#263d45',1,11,length-2,2);
  for(let n=9;n<length-8;n+=52){part('#1c3035',n,-3,8,20);part('#687c75',n+1,-2,5,18);part('#b0ad83',n+2,0,2,2);part('#a17a514d',n+1,11,4,3);}
}

function windowFrame(ctx:CanvasRenderingContext2D,p:BackdropTheme,x:number,y:number,w:number,h:number,warm=false,broken=false,variant=0){
  const dim=grain(variant,37)%5===0;
  rect(ctx,'#132a32',x-5,y-5,w+10,h+12);rect(ctx,p.wood,x-3,y-3,w+6,h+6);
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
  if(broken){
    const dx=variant%3===0?4:variant%3===1?Math.floor(w*.5)-6:w-17;
    const dy=variant%2?Math.max(4,h-23):4;
    rect(ctx,'#192e36',x+dx,y+dy,13,10);rect(ctx,'#192e36',x+dx+4,y+dy+10,9,7);
    rect(ctx,'#b3c7ac',x+dx,y+dy,3,5);rect(ctx,'#b3c7ac88',x+dx+9,y+dy+16,4,2);
  }
  if(warm&&!dim)pool(ctx,x+w/2,y+h+11,w+24);
}

function vine(ctx:CanvasRenderingContext2D,x:number,y:number,height:number,seed=0){
  for(let t=0;t<height;t+=9){
    const xx=x+Math.round(Math.sin((t+seed)/23)*5),left=(t/9+seed)%2===0;
    rect(ctx,'#324e40',xx,y+t,2,10);rect(ctx,'#274c42',xx+(left?-8:1),y+t+2,9,5);
    rect(ctx,'#6f8b5b',xx+(left?-7:2),y+t+2,6,2);rect(ctx,'#a2aa682d',xx+(left?-5:4),y+t+4,3,1);
  }
}

function paving(ctx:CanvasRenderingContext2D,p:BackdropTheme,w:number,h:number,scene:BattleSceneId){
  rect(ctx,p.floor,0,0,w,h);
  if(scene==='finale'){
    // Broad, quiet warehouse slabs leave the tactical board as the brightest material.
    for(let y=106;y<h;y+=82)for(let x=-62;x<w;x+=126){
      const xx=x+(Math.floor(y/82)%2?63:0),n=grain(xx,y);
      rect(ctx,n%2?'#46463f32':'#26333625',xx+2,y+2,123,79);
      rect(ctx,'#192b2f33',xx,y,125,1);rect(ctx,'#192b2f26',xx,y,1,81);
      if(n%3===0){rect(ctx,'#ada88a17',xx+20,y+17,17,1);rect(ctx,'#17292d26',xx+72,y+52,9,1);}
      if(n%5===0){rect(ctx,'#1e2c2e30',xx+45,y+28,2,10);rect(ctx,'#1e2c2e30',xx+47,y+37,7,1);}
    }
    // Narrow service decking stays at the perimeter instead of striping the entire room.
    const wood={...p,wood:'#514d41'};
    for(const x of [25,w-65]){timber(ctx,wood,x,106,40,Math.max(0,h-178));rect(ctx,'#16272b26',x,106,40,Math.max(0,h-178));}
    return;
  }
  const step=scene==='greenhouse'?28:24;
  for(let yy=104;yy<h;yy+=step)for(let xx=-step;xx<w;xx+=step*2){
    const x=xx+(Math.floor(yy/step)%2?step:0),n=grain(xx,yy);
    rect(ctx,p.base+'70',x,yy,step*2-1,1);rect(ctx,p.base+'45',x,yy,1,step-1);
    if(n%4===0)rect(ctx,p.rim+'19',x+7,yy+6,8,1);
    if(n%7===0)rect(ctx,'#131f2a25',x+step,yy+14,7,2);
    if((scene==='alley'||scene==='prologue'||scene==='tunnel')&&n%6===0){
      rect(ctx,'#254e6338',x+5,yy+14,25,4);rect(ctx,'#8eafb42d',x+9,yy+15,12,1);
    }
    if(scene==='greenhouse'&&n%5===0){rect(ctx,'#4e674b80',x,yy,8,3);rect(ctx,'#74835950',x+4,yy+2,5,2);}
  }
}

/** All coordinates are CSS pixels. The caller clips this entire environment to
 * the space outside actual deployment cells, including the board's holes. */
export function paintBackdropArchitecture(ctx:CanvasRenderingContext2D,scene:BattleSceneId,w:number,h:number){
  const p=BACKDROP_THEMES[scene],wallHeight=Math.min(136,Math.max(100,h*.19));
  paving(ctx,p,w,h,scene);
  if(scene==='prologue'||scene==='alley'){
    masonry(ctx,p,0,0,w,wallHeight,scene==='prologue'?38:46,18);
    metalBeam(ctx,p,0,wallHeight-4,w,7);
    for(let x=34,index=0;x<w-32;x+=scene==='prologue'?182:216,index++){
      const n=grain(index,scene==='prologue'?13:29);
      windowFrame(ctx,p,x,23,scene==='prologue'?64:72,61,n%5<3,false,n%17);
      if(index===0||n%4===1){
        rect(ctx,'#152b34',x+86,21,38,wallHeight-29);rect(ctx,p.wood,x+89,24,32,wallHeight-32);
        for(let yy=32;yy<wallHeight-15;yy+=13)rect(ctx,'#a88c5d35',x+93,yy,23,2);
        rect(ctx,'#d1ac6b',x+111,wallHeight-37,3,3);rect(ctx,p.rim,x+85,wallHeight-7,42,4);
      }
      if(index===1||n%5===0)lamp(ctx,x+142,47+n%3*3,true);
      if(n%5===2)vine(ctx,x+78,9+n%9,32+n%29,index+3);
      if(scene==='alley'){
        if(n%3!==1)pipe(ctx,x+127,84,68);
        if(n%4!==2){rect(ctx,'#152b34',x+5,94,46,20);for(let k=0;k<5;k++)rect(ctx,p.rim+'80',x+9+k*8,97,2,14);}
      }
    }
    pipe(ctx,12,34,Math.max(40,h-161),true);pipe(ctx,w-25,86,Math.max(36,h-190),true);
    if(scene==='prologue'){
      // The rain belongs to the open alley beyond the room's windows, not a sky backdrop.
      for(let i=0;i<Math.ceil(w*h/8500);i++){
        const x=(i*137+27)%Math.max(1,w-2),y=112+(i*71)%Math.max(1,h-219);
        rect(ctx,'#93bdc322',x,y,1,5+i%4);if(i%4===0)rect(ctx,'#d1d8b723',x-3,y+12,8,1);
      }
    }
  }else if(scene==='market'){
    masonry(ctx,p,0,0,w,wallHeight,48,20);pipe(ctx,0,16,w);
    for(let x=24,index=0;x<w;x+=156,index++){
      const n=grain(index,43),striped=n%5!==2;
      const fabric=n%3===0?'#4e7773':n%3===1?'#9c5e49':'#727657';
      metalBeam(ctx,p,x,4,10,wallHeight+24);
      rect(ctx,'#252c2b',x+12,36,132,44);rect(ctx,'#80644a',x+15,35,126,8);
      for(let k=0;k<9;k++){
        const cream=striped&&k%2===1,drop=23+grain(index,k)%4;
        rect(ctx,cream?'#b4a176':fabric,x+16+k*14,43,14,drop);rect(ctx,cream?'#d6bd8b':'#b7a27a',x+17+k*14,43,12,2);
        rect(ctx,'#243332',x+16+k*14,43+drop,13,4);
      }
      rect(ctx,'#251f203d',x+17,75,125,14);
      if(index===0||n%3===0)lamp(ctx,x+68+n%3*11,22,true);
      // Only a few booths keep hanging supplies; clear bays break up the repeated awnings.
      if(n%4===1){rect(ctx,'#182b2c',x+15,93,125,2);for(let k=0;k<3;k++)rect(ctx,k%2?'#aaa27b':'#705e43',x+31+k*31,94,7,5+(k+index)%3*3);}
    }
    timber(ctx,p,0,h-91,w,91);metalBeam(ctx,p,0,h-94,w,7);
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
    for(const x of [16,w-20])metalBeam(ctx,p,x,0,9,h-66);
    vine(ctx,19,wallHeight+22,Math.min(104,Math.max(20,h-wallHeight-108)),3);
    masonry(ctx,p,0,h-58,w,58,34,15);metalBeam(ctx,p,0,h-62,w,7);
  }else if(scene==='tunnel'){
    masonry(ctx,p,0,0,w,wallHeight+8,35,16);
    for(let x=32,index=0;x<w;x+=188,index++){
      const n=grain(index,83);
      rect(ctx,'#142a32',x,42,142,wallHeight-34);
      for(let step=0;step<5;step++){
        const rise=step*7;rect(ctx,'#5e756d',x+step*10,42-rise,142-step*20,7);
        rect(ctx,'#91a19150',x+step*10+2,42-rise,138-step*20,1);
      }
      metalBeam(ctx,p,x,43,9,wallHeight-32);metalBeam(ctx,p,x+133,43,9,wallHeight-32);
      if(n%4!==1)pipe(ctx,x+13,77,115);
      if(index===0||n%3===0)lamp(ctx,x+61+n%3*10,52+n%3*3,true);
      if(n%3===1){rect(ctx,'#183747',x+23+n%37,wallHeight-7,26+n%17,5);rect(ctx,'#7fa7ad55',x+29+n%37,wallHeight-6,15,1);}
      if(n%5===3)vine(ctx,x+(n%2?128:17),45+n%12,23+n%21,index+2);
    }
    pipe(ctx,6,103,Math.max(40,h-180),true);pipe(ctx,w-21,78,Math.max(40,h-153),true);
    masonry(ctx,p,0,h-56,w,56,40,17);pipe(ctx,0,h-47,w);
    for(let x=49;x<w;x+=173){rect(ctx,'#132c39',x,h-73,51,8);rect(ctx,'#4f829056',x+7,h-72,35,1);rect(ctx,'#80acb244',x+15,h-68,21,1);}
  }else{
    rect(ctx,'#252f32',0,0,w,wallHeight);
    for(let x=0;x<w;x+=17){
      rect(ctx,'#4f5c57',x,0,12,wallHeight);rect(ctx,'#8a938044',x+1,0,2,wallHeight);rect(ctx,'#1b2b30',x+12,0,3,wallHeight);
      for(let y=12;y<wallHeight;y+=38)rect(ctx,'#b0ad8559',x+4,y,2,2);
      if(grain(x,2)%3===0)rect(ctx,'#93674550',x+8,wallHeight-22,3,13);
    }
    for(let x=26,index=0;x<w;x+=184,index++){
      const n=grain(index,101);
      metalBeam(ctx,p,x,0,11,wallHeight+19);windowFrame(ctx,p,x+31,26,93,45,false,n%5===1,n%23);
      rect(ctx,'#273c3a',x+28,75,100,8);rect(ctx,'#929780',x+29,75,99,2);
      if(index===1||n%5===2)lamp(ctx,x+151,81+n%3*3,true);
    }
    metalBeam(ctx,p,0,13,w,10);metalBeam(ctx,p,0,wallHeight-4,w,11);
    metalBeam(ctx,p,12,wallHeight,12,Math.max(0,h-wallHeight-63));metalBeam(ctx,p,w-24,wallHeight,12,Math.max(0,h-wallHeight-63));
    timber(ctx,{...p,wood:'#514d41'},0,h-72,w,72);rect(ctx,'#16272b26',0,h-72,w,72);metalBeam(ctx,p,0,h-76,w,8);
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
}
