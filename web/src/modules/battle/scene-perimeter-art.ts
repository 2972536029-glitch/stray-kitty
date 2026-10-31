import type {BattleSceneId} from './scene-art';
import type {ScenePerimeterLayout} from './scene-perimeter-layout';

const stone:Record<BattleSceneId,{cap:string;light:string;face:string;joint:string}>={
  prologue:{cap:'#6d8286',light:'#a0aaa0',face:'#354b58',joint:'#233943'},
  alley:{cap:'#71838a',light:'#adb7b1',face:'#3a505e',joint:'#223845'},
  market:{cap:'#938875',light:'#c3b79a',face:'#5a5548',joint:'#373b32'},
  greenhouse:{cap:'#89917b',light:'#bcc3a3',face:'#505e48',joint:'#293b30'},
  tunnel:{cap:'#72898c',light:'#a5bdb8',face:'#344d57',joint:'#1e343e'},
  finale:{cap:'#8b8e80',light:'#bdc0a9',face:'#4c5755',joint:'#283a40'},
};
const fill=(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number)=>{
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
};

/** A shallow, masonry edge belongs to the paving, not to a rectangular UI frame.
 * All extrusion goes outside CELLS. Entry thresholds remain flat and walkable.
 * Caller uses the same exterior clip as the scenery, including at concave corners. */
export function paintScenePerimeter(ctx:CanvasRenderingContext2D,scene:BattleSceneId,layout:ScenePerimeterLayout,cellWidth:number,cellHeight:number){
  if(cellWidth<=0||cellHeight<=0)return;
  const p=stone[scene];
  ctx.save();ctx.scale(cellWidth/80,cellHeight/80);
  for(const segment of layout.segments){
    const x=segment.start.x*80,y=segment.start.y*80;
    const horizontal=segment.side==='N'||segment.side==='S';
    const length=(horizontal?segment.end.x-segment.start.x:segment.end.y-segment.start.y)*80;
    // Flat aprons join entrances to the surrounding room, with only worn seams.
    if(segment.opening){
      const apron=22;
      const ax=x+(segment.side==='W'?-apron:0),ay=y+(segment.side==='N'?-apron:0);
      const aw=horizontal?length:apron,ah=horizontal?apron:length;
      fill(ctx,p.face,ax,ay,aw,ah);
      fill(ctx,p.cap+'65',ax+1,ay+1,aw-2,ah-2);
      if(horizontal){
        for(let t=19;t<length;t+=20)fill(ctx,p.joint+'90',x+t,ay,1,ah);
        fill(ctx,p.light+'70',x,segment.side==='N'?y-2:y,length,1);
      }else{
        for(let t=19;t<length;t+=20)fill(ctx,p.joint+'90',ax,y+t,aw,1);
        fill(ctx,p.light+'70',segment.side==='W'?x-2:x,y,1,length);
      }
      continue;
    }
    if(horizontal){
      const north=segment.side==='N',sy=north?y-13:y;
      fill(ctx,'#0b1c2570',x-3,sy+4,length+9,17);
      fill(ctx,'#0b1c2530',x-5,sy+12,length+13,11);
      fill(ctx,p.joint,x-2,sy,length+4,13);
      fill(ctx,p.face,x-1,sy+5,length+2,7);
      fill(ctx,p.cap,x-1,sy+1,length+2,5);
      fill(ctx,p.light,x,sy+1,length,1.5);
      fill(ctx,p.joint+'b0',x,sy+11,length,1);
      for(let t=0;t<length;t+=32){
        fill(ctx,p.joint+'9c',x+t,sy+2,1,10);
        fill(ctx,p.light+'45',x+t+2,sy+7,16,1);
      }
    }else{
      const west=segment.side==='W',sx=west?x-9:x;
      fill(ctx,'#0b1c2550',sx+(west?-5:5),y+3,14,length+8);
      fill(ctx,p.joint,sx,y-2,9,length+4);
      fill(ctx,west?p.cap:p.face,sx+1,y-1,7,length+2);
      fill(ctx,p.light,sx+(west?1:2),y,2,length);
      fill(ctx,p.face,sx+5,y,3,length);
      for(let t=0;t<length;t+=32){
        fill(ctx,p.joint+'a0',sx+1,y+t,7,1);
        fill(ctx,p.light+'40',sx+1,y+t+2,4,1);
      }
    }
  }
  ctx.restore();
}
