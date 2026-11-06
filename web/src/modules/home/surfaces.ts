import definitions from '../../../content/home/surfaces.json' with {type:'json'};
import type {Catalog,GameState,HomeSurface,HomeSurfaces} from '../../contracts';

export const HOME_SURFACES=definitions as HomeSurface[];
export const DEFAULT_SURFACES:HomeSurfaces={wallpaper:'original_wall',floor:'original_floor'};
export function homeSurfaceSelection(state:Pick<GameState,'homeSurfaces'>):HomeSurfaces{return {...DEFAULT_SURFACES,...state.homeSurfaces};}
export function ownsHomeSurface(state:Pick<GameState,'homeSurfacesOwned'>,item:HomeSurface){return !!item.default||!!state.homeSurfacesOwned?.includes(item.id);}
export function surfaceCollectionProgress(state:Pick<GameState,'furniture'>,catalog:Catalog,item:HomeSurface){return catalog.pools.find(pool=>pool.id===item.poolId)?.entries.filter(entry=>state.furniture.includes(entry.furnitureId)).length??0;}
const palettes={original:{wall:'#b17b56',floor:'#a97243',edge:'#815c3d',light:'#cfaa74'},moss:{wall:'#7c8d69',floor:'#bd9e72',edge:'#697655',light:'#cdd6b2'},moon:{wall:'#344d6c',floor:'#93a5af',edge:'#59708b',light:'#dcd6a5'}};
function wallPattern(ctx:CanvasRenderingContext2D,style:HomeSurface['style'],x:number,y:number,w:number,h:number,step=48){
  const p=palettes[style];ctx.fillStyle=p.wall;ctx.fillRect(x,y,w,h);
  if(style==='original'){ctx.fillStyle='#d7bf9a';for(let row=0,yy=y;yy<y+h;yy+=15,row++){ctx.fillRect(x,yy,w,2);for(let xx=x+(row%2)*24;xx<x+w;xx+=48)ctx.fillRect(xx,yy,2,15);}return;}
  for(let xx=x;xx<x+w;xx+=step){ctx.fillStyle=p.edge;ctx.fillRect(xx,y,2,h);ctx.fillStyle=p.light;ctx.globalAlpha=.28;ctx.fillRect(xx+5,y,1,h);ctx.globalAlpha=1;}
  for(let yy=y+step/2;yy<y+h;yy+=step)for(let xx=x+step/2;xx<x+w;xx+=step){
    ctx.fillStyle=p.light;ctx.globalAlpha=.65;
    if(style==='moon'){ctx.fillRect(xx-2,yy-5,3,10);ctx.fillRect(xx-5,yy-2,10,3);}else if(style==='moss'){ctx.beginPath();ctx.ellipse(xx-3,yy-2,5,2,-.7,0,Math.PI*2);ctx.ellipse(xx+3,yy+3,5,2,-.7,0,Math.PI*2);ctx.fill();}else{ctx.fillRect(xx-10,yy-7,20,1);ctx.fillRect(xx,yy-7,1,14);}
  }ctx.globalAlpha=1;
}
export function drawSurfaceSwatch(ctx:CanvasRenderingContext2D,item:HomeSurface,width:number,height:number){
  ctx.save();ctx.clearRect(0,0,width,height);const p=palettes[item.style];
  if(item.kind==='wallpaper')wallPattern(ctx,item.style,0,0,width,height,36);
  else{ctx.fillStyle=p.floor;ctx.fillRect(0,0,width,height);for(let row=0,y=0;y<height;y+=19,row++){ctx.fillStyle=p.edge;ctx.globalAlpha=.35;ctx.fillRect(0,y,width,1);for(let x=(row%2)*42-42;x<width;x+=84){ctx.fillRect(x,y,1,19);ctx.fillStyle=p.light;ctx.globalAlpha=.4;ctx.fillRect(x+7,y+6,65,1);ctx.fillRect(x+15,y+12,42,1);ctx.fillStyle=p.edge;ctx.globalAlpha=.35;}}}
  ctx.restore();
}
/** Replace inner wall finishes only; glazing, ironwork and the exterior remain intact. */
export function paintHomeSurfaces(ctx:CanvasRenderingContext2D,state:Pick<GameState,'homeSurfaces'>){
  const selection=homeSurfaceSelection(state),wall=HOME_SURFACES.find(s=>s.id===selection.wallpaper),floor=HOME_SURFACES.find(s=>s.id===selection.floor);
  if(floor&&floor.style!=='original'){
    ctx.save();ctx.beginPath();ctx.moveTo(183,301);ctx.lineTo(1489,301);ctx.lineTo(1669,717);ctx.lineTo(3,717);ctx.closePath();ctx.clip();
    ctx.globalCompositeOperation='color';ctx.fillStyle=palettes[floor.style].floor;ctx.fillRect(0,290,1672,440);
    ctx.globalCompositeOperation='source-over';ctx.fillStyle=floor.style==='moss'?'#e8d6a64a':'#bad6e666';ctx.fillRect(0,290,1672,440);ctx.restore();
  }
  if(wall&&wall.style!=='original'){
    ctx.save();ctx.beginPath();
    // Keep every registered vertical iron post and both stone borders visible.
    for(const [left,right] of [[187,286],[307,439],[460,592],[613,744],[765,898],[918,1050],[1071,1203],[1224,1357],[1378,1480]])ctx.rect(left,222,right-left,53);
    ctx.clip();wallPattern(ctx,wall.style,180,222,1320,54,43);ctx.restore();
    // The two sloping interior side walls retain their brick texture and posts.
    for(const mirror of [false,true]){ctx.save();if(mirror){ctx.translate(1672,0);ctx.scale(-1,1);}ctx.beginPath();ctx.moveTo(6,514);ctx.lineTo(169,237);ctx.lineTo(169,286);ctx.lineTo(6,614);ctx.closePath();ctx.clip();ctx.globalCompositeOperation='color';ctx.fillStyle=palettes[wall.style].wall;ctx.fillRect(0,220,180,420);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.22;ctx.fillRect(0,220,180,420);ctx.restore();}
  }
}
