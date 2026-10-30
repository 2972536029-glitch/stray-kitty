import {useEffect,useRef,type RefObject} from 'react';
import {paintSceneGround,paintSceneProp,whenSceneArtReady,type BattleSceneId,type ScenePropKind} from './scene-art';
import {BACKDROP_THEMES,paintBackdropArchitecture} from './battle-scene-backdrop-art';
import {paintSceneVignette} from './scene-vignettes';
import {planSceneryGroups,planSceneryAccents,type SceneryRect} from './scene-composition';
import {paintNewSceneProp,planNewSceneProps,whenNewScenePropsReady} from './scene-new-props';

interface Props {scene:BattleSceneId;boardRef:RefObject<HTMLDivElement|null>;columns:number;rows:number;cells?:readonly {x:number;y:number}[];darkened?:boolean}
const scrollSelector='.prologue-board-scroll,.chapter-board-scroll,.market-board-scroll,.greenhouse-board-scroll,.tunnel-board-scroll,.finale-board-scroll';
const hudSelector='.btl-head,.btl-wave-status,.battle-hud-mechanic,.btl-playback,.btl-playback>span,.battle-hud-details,.battle-carry-panel,.battle-advisor,.battle-hud-boss,[class$="map-tools"],.btl-board-caption,.btl-retirement-note,.btl-controls';
const rect=(ctx:CanvasRenderingContext2D,c:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};

/** Decorative scene on a separate, noninteractive canvas. The tactical canvas keeps its alpha mask. */
export function BattleSceneBackdrop({scene,boardRef,columns,rows,cells,darkened=false}:Props){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current,stage=canvas?.parentElement;if(!canvas||!stage)return;
    let frame=0,observer:ResizeObserver|undefined;
    const observedHud=new Set<Element>();
    const currentHud=()=>{
      const elements=[...stage.querySelectorAll(hudSelector)];
      for(const old of observedHud)if(!stage.contains(old)){observer?.unobserve(old);observedHud.delete(old);}
      for(const element of elements)if(!observedHud.has(element)){observer?.observe(element);observedHud.add(element);}
      return elements;
    };
    const draw=()=>{
      frame=0;
      const full=stage.getBoundingClientRect(),board=boardRef.current?.getBoundingClientRect();
      const scroll=boardRef.current?.closest<HTMLElement>(scrollSelector);
      const scrollBounds=scroll?.getBoundingClientRect();
      const viewportLeft=Math.max(full.left,scrollBounds?scrollBounds.left+scroll!.clientLeft:full.left)-full.left;
      const viewportTop=Math.max(full.top,scrollBounds?scrollBounds.top+scroll!.clientTop:full.top)-full.top;
      const viewportRight=Math.min(full.right,scrollBounds?scrollBounds.left+scroll!.clientLeft+scroll!.clientWidth:full.right)-full.left;
      const viewportBottom=Math.min(full.bottom,scrollBounds?scrollBounds.top+scroll!.clientTop+scroll!.clientHeight:full.bottom)-full.top;
      const w=Math.max(1,Math.ceil(full.width)),h=Math.max(1,Math.ceil(full.height));
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)return;ctx.imageSmoothingEnabled=false;
      // One backing pixel per CSS pixel keeps fine material clusters sharp at normal zoom.
      const p=BACKDROP_THEMES[scene];rect(ctx,p.base,0,0,w,h);
      const cellBounds:SceneryRect[]=[];
      // Keep all freestanding decoration outside actual deployment cells, including irregular holes.
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);
      if(board){
        const bx=board.left-full.left,by=board.top-full.top,cw=board.width/columns,ch=board.height/rows;
        for(const cell of cells??Array.from({length:columns*rows},(_,i)=>({x:i%columns,y:Math.floor(i/columns)}))){
          // A zoomed board extends past its scrollport. Only its visible cells
          // cut into the backdrop; hidden cells must not erase walls or decking.
          const left=Math.max(viewportLeft,bx+cell.x*cw),top=Math.max(viewportTop,by+cell.y*ch);
          const right=Math.min(viewportRight,bx+(cell.x+1)*cw),bottom=Math.min(viewportBottom,by+(cell.y+1)*ch);
          if(right>left&&bottom>top){ctx.rect(left,top,right-left,bottom-top);cellBounds.push({x:left,y:top,width:right-left,height:bottom-top});}
        }
      }
      ctx.clip('evenodd');
      const groundX=board?board.left-full.left:0,groundY=board?board.top-full.top:0;
      paintSceneGround(ctx,scene,groundX,groundY,board?board.width/columns:80,board?board.height/rows:80,w,h);
      paintBackdropArchitecture(ctx,scene,w,h);
      const occupied:SceneryRect[]=[...cellBounds];
      const prop=(kind:ScenePropKind,x:number,y:number,size:number,index=0)=>{
        paintSceneProp(ctx,scene,kind,x,y,size,index);occupied.push({x,y,width:size,height:size});
      };
      // The adviser's own foreground seat is scenery, never a cat slot or an attack target.
      prop('crate',24,h-111,124);
      if(board){
        for(const element of currentHud()){
          const bounds=element.getBoundingClientRect();
          if(bounds.width&&bounds.height)occupied.push({x:bounds.left-full.left,y:bounds.top-full.top,width:bounds.width,height:bounds.height});
        }
        // Whole groups stay clear of the visible board bounds. The existing cell
        // mask remains a second safeguard while zooming or scrolling the map.
        const left=Math.max(viewportLeft,board.left-full.left),right=Math.min(viewportRight,board.right-full.left);
        const boardBounds={x:left,y:board.top-full.top,width:Math.max(0,right-left),height:board.height};
        for(const prop of planNewSceneProps(scene,w,h,board.width/columns,occupied)){
          paintNewSceneProp(ctx,prop);occupied.push(prop);
        }
        for(const group of planSceneryGroups(scene,w,h,boardBounds,occupied)){
          paintSceneVignette(ctx,scene,group.kind,group.x,group.y,group.width,group.index);occupied.push(group);
        }
      }
      for(const accent of planSceneryAccents(scene,w,h,occupied))prop(accent.kind,accent.x,accent.y,accent.width,accent.index);
      ctx.restore();
      if(darkened)rect(ctx,'#06171bc4',0,0,w,h);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
    const unsubscribeArt=whenSceneArtReady(schedule);
    const unsubscribeNewProps=whenNewScenePropsReady(schedule);
    observer=new ResizeObserver(schedule);observer.observe(stage);
    const connectBoard=()=>{
      if(boardRef.current){
        observer?.observe(boardRef.current);
        const scroll=boardRef.current.closest<HTMLElement>(scrollSelector);
        if(scroll)observer?.observe(scroll);
      }
      currentHud();
      schedule();
    };
    connectBoard();window.addEventListener('resize',connectBoard);stage.addEventListener('scroll',schedule,true);
    // A resize during the boss shake can sample a transient board translation.
    // Re-anchor once it settles; unit/energy animations do not repaint scenery.
    const settleBoard=(event:AnimationEvent)=>{if(event.target===boardRef.current)schedule();};
    stage.addEventListener('animationend',settleBoard);stage.addEventListener('animationcancel',settleBoard);
    // Only HUD element insertion/removal matters here, not per-frame health,
    // timers or other text/attribute updates in the running battle.
    const hudChanges=new MutationObserver(changes=>{
      if(changes.some(change=>[...change.addedNodes,...change.removedNodes].some(node=>node instanceof Element&&(node.matches(hudSelector)||node.querySelector(hudSelector)))))schedule();
    });
    hudChanges.observe(stage,{childList:true,subtree:true});
    // This frame also catches the board ref after the parent finishes mounting.
    const mounted=requestAnimationFrame(connectBoard);
    return()=>{observer?.disconnect();hudChanges.disconnect();unsubscribeArt();unsubscribeNewProps();cancelAnimationFrame(frame);cancelAnimationFrame(mounted);window.removeEventListener('resize',connectBoard);stage.removeEventListener('scroll',schedule,true);stage.removeEventListener('animationend',settleBoard);stage.removeEventListener('animationcancel',settleBoard);};
  },[scene,boardRef,columns,rows,cells,darkened]);
  return <canvas ref={ref} className="battle-scene-backdrop" aria-hidden="true"/>;
}
