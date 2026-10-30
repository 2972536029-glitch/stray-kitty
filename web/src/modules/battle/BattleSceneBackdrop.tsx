import {useEffect,useRef,type RefObject} from 'react';
import {paintSceneGround,paintSceneProp,whenSceneArtReady,type BattleSceneId,type ScenePropKind} from './scene-art';
import {BACKDROP_THEMES,paintBackdropArchitecture} from './battle-scene-backdrop-art';
import {paintSceneVignette} from './scene-vignettes';
import {planSceneryGroups,planSceneryAccents,type SceneryRect} from './scene-composition';
import {paintNewSceneProp,planNewSceneProps,whenNewScenePropsReady} from './scene-new-props';
import {getSceneRoomLayout} from './scene-room-layout';
import {paintIllustratedRoom} from './illustrated-room';
import {getScenePerimeterLayout,type ScenePerimeterSide} from './scene-perimeter-layout';
import {paintScenePerimeter} from './scene-perimeter-art';
import {paintPerimeterProps} from './scene-perimeter-props';
import {getJoinedObstacleCells,paintConnectedObstacleScenery} from './scene-connected-obstacles';
import {paintForegroundScenery} from './scene-foreground-art';
import {whenDetailedExteriorsReady} from './scene-detailed-exteriors';

interface Props {scene:BattleSceneId;boardRef:RefObject<HTMLDivElement|null>;columns:number;rows:number;cells?:readonly {x:number;y:number}[];spawns?:readonly {x:number;y:number}[];goal?:{x:number;y:number};darkened?:boolean}
const scrollSelector='.prologue-board-scroll,.chapter-board-scroll,.market-board-scroll,.greenhouse-board-scroll,.tunnel-board-scroll,.finale-board-scroll';
const hudSelector='.btl-head,.btl-wave-status,.battle-hud-mechanic,.btl-playback,.btl-playback>span,.battle-hud-details,.battle-carry-panel,.battle-advisor,.battle-hud-boss,[class$="map-tools"],.btl-board-caption,.btl-retirement-note,.btl-controls';
const rect=(ctx:CanvasRenderingContext2D,c:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};

/** Decorative scene on a separate, noninteractive canvas. The tactical canvas keeps its alpha mask. */
export function BattleSceneBackdrop({scene,boardRef,columns,rows,cells,spawns,goal,darkened=false}:Props){
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
      const groundX=board?board.left-full.left:0,groundY=board?board.top-full.top:0;
      const illustrated=scene==='finale'&&!!board&&paintIllustratedRoom(ctx,w,h,{x:groundX,y:groundY,width:board!.width,height:board!.height});
      const cellWidth=board?board.width/columns:80,cellHeight=board?board.height/rows:80;
      const room=getSceneRoomLayout(w,h,{x:groundX,y:groundY,width:board?.width??w,height:board?.height??h},
        {x:viewportLeft,y:viewportTop,width:viewportRight-viewportLeft,height:viewportBottom-viewportTop},Math.min(cellWidth,cellHeight));
      // HUD reservation is still open floor, not a deep raised foreground deck.
      room.front=Math.max(room.front,h-Math.min(52,cellHeight*.6));
      // Establish the whole room before the board: floor, then its enclosing
      // walls. Only freestanding furniture uses the tactical-cell cutout.
      if(!illustrated)paintSceneGround(ctx,scene,groundX,groundY,cellWidth,cellHeight,w,h);
      const cellBounds:SceneryRect[]=[];
      const fieldCells=cells??Array.from({length:columns*rows},(_,i)=>({x:i%columns,y:Math.floor(i/columns)}));
      // Keep all freestanding decoration outside actual deployment cells, including irregular holes.
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);
      if(board){
        const bx=board.left-full.left,by=board.top-full.top,cw=board.width/columns,ch=board.height/rows;
        for(const cell of fieldCells){
          // A zoomed board extends past its scrollport. Only its visible cells
          // cut into the backdrop; hidden cells must not erase walls or decking.
          const left=Math.max(viewportLeft,bx+cell.x*cw),top=Math.max(viewportTop,by+cell.y*ch);
          const right=Math.min(viewportRight,bx+(cell.x+1)*cw),bottom=Math.min(viewportBottom,by+(cell.y+1)*ch);
          if(right>left&&bottom>top){ctx.rect(left,top,right-left,bottom-top);cellBounds.push({x:left,y:top,width:right-left,height:bottom-top});}
        }
      }
      ctx.clip('evenodd');
      // A shaded service floor surrounds the lighter, usable paving. This is
      // deliberately a material boundary, anchored to the real irregular map.
      rect(ctx,scene==='greenhouse'?'#182c247d':'#10242e70',0,0,w,h);
      if(board){
        // Wide windows reveal more room, not an equally bright expanse of floor.
        // The light stays on the actual battlefield while distant margins recede.
        ctx.save();ctx.translate(groundX+board.width/2,groundY+board.height/2);ctx.scale(board.width,board.height);
        const falloff=ctx.createRadialGradient(0,0,.4,0,0,1.05);
        falloff.addColorStop(0,'#091b2000');falloff.addColorStop(.55,'#091b2028');falloff.addColorStop(1,'#091b2099');
        ctx.fillStyle=falloff;ctx.fillRect(-w/board.width-1,-h/board.height-1,w*2/board.width+2,h*2/board.height+2);ctx.restore();
      }
      ctx.restore();
      if(!illustrated)paintBackdropArchitecture(ctx,scene,w,h,room);
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);
      for(const bounds of cellBounds)ctx.rect(bounds.x,bounds.y,bounds.width,bounds.height);
      ctx.clip('evenodd');
      const occupied:SceneryRect[]=[...cellBounds];
      if(board){
        const openings=[...(spawns??[]).map(position=>({...position,kind:'spawn' as const,
          side:(scene==='finale'?'E':position.y===0?'N':position.y===rows-1&&scene!=='alley'?'S':'E') as ScenePerimeterSide})),
          ...(goal?[{...goal,kind:'goal' as const,side:'W' as const}]:[])];
        const joined=getJoinedObstacleCells(scene);
        const perimeter=getScenePerimeterLayout(fieldCells,openings,joined);
        ctx.save();ctx.translate(groundX,groundY);
        for(const bounds of paintPerimeterProps(ctx,scene,cellWidth,cellHeight))occupied.push({...bounds,x:bounds.x+groundX,y:bounds.y+groundY});
        ctx.save();ctx.beginPath();ctx.rect(-groundX,-groundY,w,h);
        // Only supplement the true exterior. Hidden cells in a scrolled board
        // must not reappear on the background outside its scrollport.
        for(const cell of fieldCells)ctx.rect(cell.x*cellWidth,cell.y*cellHeight,cellWidth,cellHeight);
        ctx.clip('evenodd');ctx.scale(cellWidth/80,cellHeight/80);paintConnectedObstacleScenery(ctx,scene);ctx.restore();
        // A zoomed-offscreen edge cannot reappear on top of the room's back wall.
        ctx.save();ctx.beginPath();ctx.rect(viewportLeft-groundX-cellWidth*.2,viewportTop-groundY-cellHeight*.2,
          viewportRight-viewportLeft+cellWidth*.4,viewportBottom-viewportTop+cellHeight*.4);ctx.clip();
        paintScenePerimeter(ctx,scene,perimeter,cellWidth,cellHeight);
        ctx.restore();
        // Low foreground objects sit over the outside kerb and attach to the
        // scene's lower edge, while the combat-cell clip keeps routes clear.
        for(const bounds of paintForegroundScenery(ctx,scene,cellWidth,cellHeight))occupied.push({...bounds,x:bounds.x+groundX,y:bounds.y+groundY});
        // Connected roofs, wall feet and shelves may continue half a tile into
        // the room. Reserve that apron before placing freestanding decorations.
        const actual=new Set(fieldCells.map(cell=>`${cell.x},${cell.y}`));
        for(const cell of joined)for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
          const x=cell.x+dx,y=cell.y+dy;
          if(!actual.has(`${x},${y}`))occupied.push({x:groundX+x*cellWidth,y:groundY+y*cellHeight,width:cellWidth,height:cellHeight});
        }
        ctx.restore();
        // Keep an apron clear beside every entrance, not just the red tile.
        for(const edge of perimeter.edges)if(edge.opening)occupied.push({x:groundX+edge.outside.x*cellWidth,y:groundY+edge.outside.y*cellHeight,width:cellWidth,height:cellHeight});
      }
      // Props stand on the floor; they cannot be placed into the wall band.
      if(room.back+12>0)occupied.push({x:0,y:0,width:w,height:room.back+12});
      if(room.front<h)occupied.push({x:0,y:Math.max(0,room.front),width:w,height:h-Math.max(0,room.front)});
      if(room.left>0)occupied.push({x:0,y:0,width:room.left,height:h});
      if(room.right<w)occupied.push({x:Math.max(0,room.right),y:0,width:w-Math.max(0,room.right),height:h});
      const prop=(kind:ScenePropKind,x:number,y:number,size:number,index=0)=>{
        paintSceneProp(ctx,scene,kind,x,y,size,index);occupied.push({x,y,width:size,height:size});
      };
      // The adviser's own foreground seat is scenery, never a cat slot or an attack target.
      if(!illustrated)prop('crate',24,h-111,124);
      if(board&&!illustrated){
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
      if(!illustrated)for(const accent of planSceneryAccents(scene,w,h,occupied))prop(accent.kind,accent.x,accent.y,accent.width,accent.index);
      ctx.restore();
      if(darkened)rect(ctx,'#06171bc4',0,0,w,h);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
    const unsubscribeArt=whenSceneArtReady(schedule);
    const unsubscribeNewProps=whenNewScenePropsReady(schedule);
    const unsubscribeExteriors=whenDetailedExteriorsReady(schedule);
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
    return()=>{observer?.disconnect();hudChanges.disconnect();unsubscribeArt();unsubscribeNewProps();unsubscribeExteriors();cancelAnimationFrame(frame);cancelAnimationFrame(mounted);window.removeEventListener('resize',connectBoard);stage.removeEventListener('scroll',schedule,true);stage.removeEventListener('animationend',settleBoard);stage.removeEventListener('animationcancel',settleBoard);};
  },[scene,boardRef,columns,rows,cells,spawns,goal,darkened]);
  return <canvas ref={ref} className="battle-scene-backdrop" aria-hidden="true"/>;
}
