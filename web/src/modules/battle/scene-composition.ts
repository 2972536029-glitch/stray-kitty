import {SCENE_VIGNETTE_ASPECT} from './scene-vignettes';

export interface SceneryRect {x:number;y:number;width:number;height:number}
interface Placement extends SceneryRect {side:number;row:number}
const overlaps=(a:SceneryRect,b:SceneryRect,gap=10)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;

/** Fit a few complete scenery groups in the margins, never in tactical cells. */
export function planSceneryGroups(width:number,height:number,board:SceneryRect,occupied:readonly SceneryRect[],maxPerSide=1):Placement[]{
  if(width<840)return [];
  const top=154,bottom=height-182;
  if(bottom-top<100)return [];
  const sides=[{left:24,right:Math.max(24,board.x-24)},{left:Math.min(width-24,board.x+board.width+24),right:width-24}];
  const result:Placement[]=[];
  sides.forEach(({left,right},side)=>{
    if(right-left<166)return;
    const count=bottom-top>390?Math.min(2,maxPerSide):1;
    const maxWidth=Math.min(290,right-left-24,(bottom-top-16)*SCENE_VIGNETTE_ASPECT);
    for(let row=0;row<count;row++){
      const centerY=top+(bottom-top)*(row+1)/(count+1);
      let placed=false;
      for(const scale of [1,.88,.76,.64,.56]){
        if(placed)break;
        const w=Math.floor(maxWidth*scale),h=Math.ceil(w/SCENE_VIGNETTE_ASPECT);
        if(w<140)continue;
        const blocked=[...occupied,...result];
        const positions=[centerY-h/2,top,bottom-h,...blocked.flatMap(rect=>[rect.y+rect.height+10,rect.y-h-10])]
          .map(Math.round).sort((a,b)=>Math.abs(a+h/2-centerY)-Math.abs(b+h/2-centerY));
        for(const y of positions){
          if(placed)break;
          for(const fraction of [(side+row)%2?.6:.4,.5,.3,.7]){
            const candidate={x:Math.round(left+(right-left-w)*fraction),y,width:w,height:h,side,row};
            if(candidate.y<top||candidate.y+h>bottom)continue;
            if(blocked.some(rect=>overlaps(candidate,rect)))continue;
            result.push(candidate);placed=true;break;
          }
        }
      }
    }
  });
  return result;
}
