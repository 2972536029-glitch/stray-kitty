import {HOME_FRAMES} from './assets';
import type {HomePoint,HomeCatBreed} from './layout';
import {homeObjectInteraction,type HomeObject} from './objects';
import {homeWalkable,homeWalkStep} from './navigation';
import {activityMood,currentCatMood,setCatMood,furnitureLine,socialLines,FURNITURE_LINES,type HomeMood} from './dialogue';
import {canChatter} from './reactions';
import {furnitureBlocksCat,homeObjectDepth} from './spatial';

export type SocialKind='nose'|'rub'|'groom'|'play'|'nap';
export interface LifeCat extends HomePoint {
  breed:HomeCatBreed;pose:string|null;action:'sit'|'walk'|'nose'|'rub'|'groom'|'play'|'nap';slot?:string;
  target?:HomePoint;thinkAt:number;facing:1|-1;seed:number;nodeIndex:number;nodes:HomePoint[];
  noseUntil:number;noseCooldownUntil:number;bubble:string|null;bubbleUntil:number;bubbleAt?:number;startledUntil:number;
  scriptedHeight?:number;poseUntil?:number;manualUntil?:number;lastFurniture?:string;activitySerial?:number;
  furnitureArrival?:{from:HomePoint;to:HomePoint;pose:string;started:number};
  mood?:HomeMood;moodUntil?:number;petPressure?:number;lastPetAt?:number;petReactionUntil?:number;
  dialogueTurns?:Record<string,number>;lastDialogue?:string;lastSpokenAt?:number;
  social?:{kind:SocialKind;partner:HomeCatBreed;from:HomePoint;to:HomePoint;started:number;until:number};
}
export const CAT_NAMES:Record<HomeCatBreed,string>={miaomiao:'喵喵',tuanzi:'团子',diandian:'点点',momo:'墨墨',advisor:'阿策'};
export const SOCIAL_KINDS:SocialKind[]=['nose','rub','groom','play','nap'];
export function catOverlap(a:HomePoint,b:HomePoint):boolean{return Math.abs(a.x-b.x)<60&&Math.abs(a.y-b.y)<52;}
export function freeCatPoint(wanted:HomePoint,cats:readonly LifeCat[],objects:readonly HomeObject[],exclude?:HomeCatBreed):HomePoint|undefined {
  const clear=(p:HomePoint)=>homeWalkable(p,objects)&&cats.every(c=>c.breed===exclude||!catOverlap(p,c));
  if(clear(wanted))return {...wanted};
  for(let radius=20;radius<=650;radius+=20)for(let i=0;i<24;i++){const a=i/24*Math.PI*2,p={x:Math.round(wanted.x+Math.cos(a)*radius),y:Math.round(wanted.y+Math.sin(a)*radius)};if(clear(p))return p;}
}
export function furnitureAt(objects:readonly HomeObject[],x:number,y:number):HomeObject|undefined {
  return [...objects].sort((a,b)=>homeObjectDepth(a)-homeObjectDepth(b)).reverse().find(o=>{const f=HOME_FRAMES[o.sprite],h=o.width*f.height/f.width;return Math.abs(x-o.x)<o.width/2&&y>=o.y-h&&y<=o.y+10;});
}
export function furnitureActivity(object:HomeObject){
  const m=homeObjectInteraction(object);
  const pose=object.sprite==='s2.scratcher'?'scratch':object.sprite==='s4.banquet'?'bowl_eat':object.kind==='storage'?'investigate':object.kind==='workbench'?'paw_table':/\.(tinlamp|sunlamp|starlamp)$/.test(object.sprite)?'belly':m.pose;
  return {...m,pose,line:(FURNITURE_LINES[pose]??FURNITURE_LINES.watch).happy[0]};
}
export function endSocial(cat:LifeCat,cats:readonly LifeCat[],now:number){
  for(const other of cats)if(other===cat||other.social?.partner===cat.breed){other.social=undefined;other.action='sit';other.thinkAt=now+2500;}
}
export function releaseFurniture(cat:LifeCat,objects:readonly HomeObject[],cats:readonly LifeCat[],now:number){
  const point=cat.slot?freeCatPoint({x:cat.x,y:Math.max(390,Math.min(680,cat.y+65))},cats,objects,cat.breed):undefined;
  if(cat.slot&&!point)return;
  if(point){cat.x=point.x;cat.y=point.y;}cat.pose=null;cat.slot=undefined;cat.furnitureArrival=undefined;cat.social=undefined;cat.scriptedHeight=0;cat.action='sit';cat.target=undefined;cat.thinkAt=now+2200;
}
export function useFurniture(cat:LifeCat,object:HomeObject,cats:readonly LifeCat[],objects:readonly HomeObject[],now:number,speak=true):boolean {
  const key=object.slot??object.layoutKey,activity=furnitureActivity(object);
  const others=objects.filter(o=>o.layoutKey!==object.layoutKey);
  // Sniff / investigate beside the item, never inside its opaque leaves or side.
  if(['sniff','investigate','paw_table','watch','bat_ball','bat_chime','bowl_eat'].includes(activity.pose)||object.kind==='lamp'){
    const floor=(y:number)=>Math.max(390,Math.min(690,y));
    const points=[{x:object.x+object.width/2+34,y:floor(object.y+25)},
      {x:object.x-object.width/2-34,y:floor(object.y+25)},
      {x:object.x,y:floor(object.y+64)}];
    const point=points.filter(p=>homeWalkable(p,objects)&&cats.every(c=>c===cat||!catOverlap(p,c)))
      .sort((a,b)=>Math.hypot(a.x-cat.x,a.y-cat.y)-Math.hypot(b.x-cat.x,b.y-cat.y))[0];
    if(!point)return false;activity.point=point;
  }else if(others.some(o=>furnitureBlocksCat(o,activity.point)))return false;
  // One reservation per item, including the approach. An occupied seat waits;
  // dragging onto its resident instead starts a shared social activity.
  if(cats.some(c=>c!==cat&&c.slot===key))return false;
  if(cats.some(c=>c!==cat&&catOverlap(activity.point,c)))return false;
  endSocial(cat,cats,now);
  cat.social=undefined;cat.pose=null;cat.slot=key;cat.target=undefined;cat.lastFurniture=object.layoutKey;
  cat.furnitureArrival={from:{x:cat.x,y:cat.y},to:activity.point,pose:activity.pose,started:now};
  cat.poseUntil=now+11000+(cat.seed%3)*1700;cat.manualUntil=now+1500;
  const mood=activityMood(cat,now);setCatMood(cat,mood,now);
  if(speak){for(const other of cats)other.bubbleUntil=now;cat.bubble=furnitureLine(cat,activity.pose,mood,now);cat.bubbleAt=now;cat.bubbleUntil=now+3800;}return true;
}
export function socialize(a:LifeCat,b:LifeCat,kind:SocialKind,cats:readonly LifeCat[],objects:readonly HomeObject[],now:number,speak=true):boolean {
  const outsiders=cats.filter(c=>c!==a&&c!==b),center={x:(a.x+b.x)/2,y:Math.max(425,Math.min(660,(a.y+b.y)/2))};
  let pair:[HomePoint,HomePoint]|undefined;
  for(let radius=0;radius<240&&!pair;radius+=30)for(let i=0;i<(radius?12:1);i++){const t=i/12*Math.PI*2,x=center.x+Math.cos(t)*radius,y=center.y+Math.sin(t)*radius,p={x:x-36,y},q={x:x+36,y};if(homeWalkable(p,objects)&&homeWalkable(q,objects)&&outsiders.every(c=>!catOverlap(p,c)&&!catOverlap(q,c))){pair=[p,q];break;}}
  if(!pair)return false;
  endSocial(a,cats,now);endSocial(b,cats,now);
  if(speak)for(const other of cats)other.bubbleUntil=now;
  setCatMood(a,activityMood(a,now),now);setCatMood(b,activityMood(b,now),now);
  const mood=currentCatMood(a,now)==='irritated'||currentCatMood(b,now)==='irritated'?'irritated':currentCatMood(a,now)==='happy'&&currentCatMood(b,now)==='happy'?'happy':'neutral';
  const lines=speak?socialLines(a,b,kind,mood,now):undefined;
  for(const [i,c] of [a,b].entries()){
    c.x=pair[i].x;c.y=pair[i].y;c.startledUntil=now+400;
    c.pose=null;c.slot=undefined;c.furnitureArrival=undefined;c.target=undefined;c.scriptedHeight=0;
    c.social={kind,partner:(i?a:b).breed,from:{x:c.x,y:c.y},to:pair[i],started:now,until:now+6800};c.action=kind;c.facing=i?-1:1;
    c.manualUntil=now+7000;c.noseCooldownUntil=now+17000;c.noseUntil=now+6000;
    if(lines){c.bubble=lines[i];c.bubbleAt=now+i*3300;c.bubbleUntil=now+(i+1)*3300;}
  }return true;
}
export function settleCats(cats:LifeCat[],objects:readonly HomeObject[],now:number){
  for(const cat of cats){
    if(cat.slot||cat.furnitureArrival||cat.social||homeWalkable(cat,objects))continue;
    const point=freeCatPoint(cat,cats,objects,cat.breed);
    if(point){cat.x=point.x;cat.y=point.y;cat.target=undefined;cat.action='sit';cat.thinkAt=now+1800;}
  }
  for(let i=0;i<cats.length;i++)for(let j=0;j<i;j++){
    const a=cats[i],b=cats[j];if(!catOverlap(a,b))continue;
    const movable=a.slot||a.social?b:b.slot||b.social?a:(a.manualUntil??0)>(b.manualUntil??0)?b:a,point=freeCatPoint({x:movable.x,y:Math.max(395,Math.min(690,movable.y))},cats,objects,movable.breed);
    if(point){movable.x=point.x;movable.y=point.y;movable.pose=null;movable.slot=undefined;movable.furnitureArrival=undefined;movable.social=undefined;movable.scriptedHeight=0;movable.action='sit';movable.thinkAt=now+2500;}
  }
}
export function stepHomeLife(cats:LifeCat[],objects:readonly HomeObject[],now:number,deltaMs:number,stage:number,held?:HomeCatBreed){
  for(const cat of cats){
    if(cat.breed===held)continue;
    if(cat.social){const s=cat.social,p=Math.min(1,(now-s.started)/900),ease=p*p*(3-2*p);cat.x=s.from.x+(s.to.x-s.from.x)*ease;cat.y=s.from.y+(s.to.y-s.from.y)*ease;
      if(now>=s.until){cat.social=undefined;cat.action='sit';cat.thinkAt=now+2500;}continue;}
    if(cat.furnitureArrival){const a=cat.furnitureArrival,p=Math.min(1,(now-a.started)/1100),ease=p*p*(3-2*p),next={x:a.from.x+(a.to.x-a.from.x)*ease,y:a.from.y+(a.to.y-a.from.y)*ease};
      if(objects.some(o=>(o.slot??o.layoutKey)!==cat.slot&&furnitureBlocksCat(o,next))){releaseFurniture(cat,objects,cats,now);continue;}
      cat.x=next.x;cat.y=next.y;cat.scriptedHeight=Math.sin(p*Math.PI)*30;cat.facing=a.to.x>=a.from.x?1:-1;cat.action='walk';if(p>=1){cat.pose=a.pose;cat.furnitureArrival=undefined;cat.scriptedHeight=0;cat.action='sit';}continue;}
    if(cat.pose){if(now>=(cat.poseUntil??Infinity))releaseFurniture(cat,objects,cats,now);continue;}
    if(now<(cat.manualUntil??0))continue;
    if(cat.action==='walk'&&cat.target){const next=homeWalkStep(cat,cat.target,56*deltaMs/1000,objects);
      if(cats.some(c=>c!==cat&&catOverlap(next,c))){cat.action='sit';cat.thinkAt=now+1300;continue;}
      const dx=next.x-cat.x,travel=Math.hypot(dx,next.y-cat.y);cat.x=next.x;cat.y=next.y;if(Math.abs(dx)>.1)cat.facing=dx>0?1:-1;
      if(travel<.1||Math.hypot(cat.x-cat.target.x,cat.y-cat.target.y)<4){cat.action='sit';cat.thinkAt=now+2500;}continue;}
    if(now<cat.thinkAt)continue;
    const serial=cat.activitySerial=(cat.activitySerial??cat.seed%5)+1;
    if(serial%4===0){const partner=cats.find(c=>c!==cat&&!c.social&&!c.furnitureArrival&&!c.slot&&now>=(c.manualUntil??0)&&now>=c.noseCooldownUntil&&Math.hypot(c.x-cat.x,c.y-cat.y)<310);if(partner&&now>=cat.noseCooldownUntil&&socialize(cat,partner,SOCIAL_KINDS[serial%SOCIAL_KINDS.length],cats,objects,now,canChatter(cats,now)))continue;}
    if(serial%5!==0){const candidates=objects.filter(o=>!o.front&&o.layoutKey!==cat.lastFurniture&&Math.hypot(o.x-cat.x,o.y-cat.y)<(stage===1?260:580)).sort((a,b)=>Number(furnitureActivity(b).cat===cat.breed)-Number(furnitureActivity(a).cat===cat.breed)||Math.hypot(a.x-cat.x,a.y-cat.y)-Math.hypot(b.x-cat.x,b.y-cat.y));if(candidates.some(o=>useFurniture(cat,o,cats,objects,now,canChatter(cats,now))))continue;}
    if(serial%3===0){cat.pose=serial%2?'groom_self':'stretch';cat.poseUntil=now+3500;continue;}
    cat.nodeIndex=(cat.nodeIndex+1)%cat.nodes.length;const target=freeCatPoint(cat.nodes[cat.nodeIndex],cats,objects,cat.breed);if(target){cat.target=target;cat.action='walk';}cat.thinkAt=now+3000;
  }
  settleCats(cats,objects,now);
}
