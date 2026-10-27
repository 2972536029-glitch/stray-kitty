import {useEffect,useRef,type RefObject} from 'react';
import {paintSceneProp,type BattleSceneId,type ScenePropKind} from './scene-art';

interface Props {scene:BattleSceneId;boardRef:RefObject<HTMLDivElement|null>;columns:number;rows:number;cells?:readonly {x:number;y:number}[];darkened?:boolean}
const themes:Record<BattleSceneId,{base:string;wall:string;rim:string;floor:string;wood:string;light:string;props:ScenePropKind[]}>={
  prologue:{base:'#182d39',wall:'#304452',rim:'#59717b',floor:'#273d48',wood:'#654e3c',light:'#e6b76c',props:['bin','crate','drain']},
  alley:{base:'#24363e',wall:'#40545c',rim:'#748781',floor:'#334951',wood:'#765a41',light:'#d9b574',props:['bin','crate','sacks']},
  market:{base:'#34392d',wall:'#5b5a43',rim:'#938369',floor:'#4b4938',wood:'#8d6541',light:'#efbf70',props:['food-stall','toy-stall','notice-stall','crate']},
  greenhouse:{base:'#354738',wall:'#586450',rim:'#94a58a',floor:'#46543d',wood:'#886f51',light:'#d3d4aa',props:['planter','trellis','broken-pot']},
  tunnel:{base:'#182b2d',wall:'#33494a',rim:'#6c7f74',floor:'#253c3d',wood:'#625b46',light:'#a6c4aa',props:['pipe','valve','drain','barrier']},
  finale:{base:'#2c302c',wall:'#4c5048',rim:'#838979',floor:'#3b4038',wood:'#806448',light:'#e8c58b',props:['warehouse-crates','storage-rack','cable','barrier']},
};
const rect=(ctx:CanvasRenderingContext2D,c:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};

/** Decorative scene on a separate, noninteractive canvas. The tactical canvas keeps its alpha mask. */
export function BattleSceneBackdrop({scene,boardRef,columns,rows,cells,darkened=false}:Props){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current,stage=canvas?.parentElement;if(!canvas||!stage)return;
    let frame=0,observer:ResizeObserver|undefined;
    const draw=()=>{
      frame=0;
      const full=stage.getBoundingClientRect(),board=boardRef.current?.getBoundingClientRect();
      const w=Math.max(1,Math.ceil(full.width/2)),h=Math.max(1,Math.ceil(full.height/2));
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)return;ctx.imageSmoothingEnabled=false;
      const p=themes[scene];rect(ctx,p.base,0,0,w,h);
      // Walls, side framing and foreground decking establish a room beyond the playable grid.
      for(let y=0;y<h;y+=16)for(let x=-20;x<w;x+=36){
        const offset=(y/16)%2?18:0;
        rect(ctx,(x+y)%3===0?p.wall:p.floor,x+offset+1,y+1,34,14);
        rect(ctx,p.rim+'20',x+offset+2,y+2,30,1);
      }
      rect(ctx,p.base+'bb',0,50,w,Math.max(0,h-110));
      // A foreground ledge puts the adviser closer to the player, outside combat space.
      rect(ctx,'#162725',0,h-60,w,60);
      for(let y=h-58;y<h;y+=11){rect(ctx,p.wood,0,y,w,9);rect(ctx,p.rim+'4d',0,y,w,1);for(let x=0;x<w;x+=91)rect(ctx,'#1e2a29',x+(y%2?41:0),y,2,9);}
      const frameWidth=14;
      rect(ctx,p.wall,0,0,frameWidth,h-60);rect(ctx,p.rim,frameWidth-3,0,2,h-60);
      rect(ctx,p.wall,w-frameWidth,0,frameWidth,h-60);rect(ctx,p.rim,w-frameWidth+1,0,2,h-60);
      if(scene==='greenhouse'){
        for(let x=25;x<w-20;x+=54){rect(ctx,'#8daba03b',x,10,44,43);rect(ctx,p.rim,x,8,3,48);rect(ctx,p.rim,x,29,44,2);rect(ctx,'#d3d7af33',x+5,13,14,25);}
        rect(ctx,p.rim,20,7,w-40,3);rect(ctx,p.rim,20,53,w-40,3);
      }else if(scene==='tunnel'){
        rect(ctx,'#1a292b',0,15,w,20);rect(ctx,'#68796d',0,18,w,11);rect(ctx,'#9aab8f',0,19,w,2);
        for(let x=31;x<w;x+=100){rect(ctx,'#81917c',x,12,8,26);rect(ctx,'#b1ad80',x+2,15,2,3);}
      }else if(scene==='market'){
        // Underground market: hanging lamps and exposed conduit, without street windows.
        rect(ctx,'#28352c',0,12,w,5);rect(ctx,p.rim,0,13,w,1);
        for(let x=42;x<w-20;x+=94){
          rect(ctx,'#26342b',x,15,2,16);rect(ctx,'#7b7151',x-7,28,16,4);
          rect(ctx,p.light+'15',x-23,28,48,29);rect(ctx,p.light+'28',x-14,31,30,20);
          rect(ctx,'#e9b66a',x-5,32,12,9);rect(ctx,'#ffe3a1',x-2,33,6,6);
        }
      }else if(scene==='finale'){
        for(let x=28;x<w;x+=95){rect(ctx,'#222d29',x,0,13,60);rect(ctx,p.rim,x+2,0,3,58);for(let y=6;y<50;y+=14)rect(ctx,'#b4b29a',x+8,y,2,2);}
        rect(ctx,p.rim,0,43,w,5);rect(ctx,'#242d29',0,48,w,6);
      }else{
        for(let x=30;x<w-25;x+=112){
          rect(ctx,'#172a2c',x,12,50,39);rect(ctx,p.wood,x+3,15,44,33);
          rect(ctx,p.light+'a0',x+8,18,32,24);rect(ctx,p.wall,x+22,16,4,28);rect(ctx,p.wall,x+6,29,36,3);
          rect(ctx,p.rim,x-2,51,54,4);
        }
      }
      // Keep all freestanding decoration outside actual deployment cells, including irregular holes.
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);
      if(board){
        const bx=(board.left-full.left)/2,by=(board.top-full.top)/2,cw=board.width/columns/2,ch=board.height/rows/2;
        for(const cell of cells??Array.from({length:columns*rows},(_,i)=>({x:i%columns,y:Math.floor(i/columns)})))ctx.rect(bx+cell.x*cw,by+cell.y*ch,cw,ch);
      }
      ctx.clip('evenodd');
      const prop=(kind:ScenePropKind,x:number,y:number,size:number,index=0)=>paintSceneProp(ctx,scene,kind,x,y,size,index);
      for(let i=0;i<Math.ceil(w/140);i++){
        const size=58+(i%2)*9;prop(p.props[i%p.props.length],30+i*140,42,size,i);
        if(i>0)prop(p.props[(i+1)%p.props.length],50+i*140,h-92,70,i);
      }
      if(board&&cells){
        const actual=new Set(cells.map(c=>c.x+','+c.y));
        const bx=(board.left-full.left)/2,by=(board.top-full.top)/2,cw=board.width/columns/2,ch=board.height/rows/2;
        for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(!actual.has(x+','+y)&&(x*7+y*11)%5===0){
          const size=Math.min(cw,ch)*.9;prop(p.props[(x+y)%p.props.length],bx+x*cw+(cw-size)/2,by+y*ch+(ch-size)/2,size,x+y);
        }
      }
      // The adviser's own foreground seat is scenery, never a cat slot or an attack target.
      prop('crate',16,h-57,66);
      if(scene==='prologue')for(let i=0;i<48;i++){const x=(i*73+31)%w,y=(i*29+16)%Math.max(1,h-70);rect(ctx,'#93bbc029',x,y,1,6);}
      ctx.restore();
      if(darkened)rect(ctx,'#06171bc4',0,0,w,h);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
    observer=new ResizeObserver(schedule);observer.observe(stage);
    const connectBoard=()=>{if(boardRef.current)observer?.observe(boardRef.current);schedule();};
    connectBoard();window.addEventListener('resize',connectBoard);stage.addEventListener('scroll',schedule,true);
    // This frame also catches the board ref after the parent finishes mounting.
    const mounted=requestAnimationFrame(connectBoard);
    return()=>{observer?.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(mounted);window.removeEventListener('resize',connectBoard);stage.removeEventListener('scroll',schedule,true);};
  },[scene,boardRef,columns,rows,cells,darkened]);
  return <canvas ref={ref} className="battle-scene-backdrop" aria-hidden="true"/>;
}
