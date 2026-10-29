import type {HomePoint} from './layout';
import type {HomeObject} from './objects';

// Feet stay on the indoor floor. Cushions, blankets and bowls can be walked on;
// bulky objects reserve their ground footprint, independent of sprite height.
export function homeWalkable(point:HomePoint,objects:readonly HomeObject[]):boolean {
  const edge=228-(point.y-350)*.4;
  if(point.y<365||point.y>720||point.x<edge||point.x>1672-edge)return false;
  return !objects.some(object=>{
    if(!object.solid)return false;
    const half=object.width*.42+16,depth=Math.max(16,object.width*.18);
    return point.x>object.x-half&&point.x<object.x+half&&point.y>object.y-depth-14&&point.y<object.y+18;
  });
}

export function homeWalkStep(from:HomePoint,target:HomePoint,distance:number,objects:readonly HomeObject[]):HomePoint {
  let point={...from};
  for(let remaining=distance;remaining>0;remaining-=6){
    const dx=target.x-point.x,dy=target.y-point.y,length=Math.hypot(dx,dy);
    if(length<.1)break;
    const step=Math.min(6,remaining,length),sx=dx/length*step,sy=dy/length*step;
    const candidates=[{x:point.x+sx,y:point.y+sy},...(Math.abs(dx)>Math.abs(dy)?[{x:point.x+sx,y:point.y},{x:point.x,y:point.y+sy}]:[{x:point.x,y:point.y+sy},{x:point.x+sx,y:point.y}])];
    const next=candidates.find(candidate=>Math.hypot(candidate.x-point.x,candidate.y-point.y)>.01&&homeWalkable(candidate,objects));
    if(!next)break;
    point=next;
  }
  return point;
}
