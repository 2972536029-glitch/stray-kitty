import source from '../../../../specs/night-market/night_market_v016_spatial_reference.json';

export type MarketFloor = 'L0' | 'L1' | 'Lm1';
type Spatial = {R:Record<MarketFloor,[number,number[][]][]>;solids:({type:'rect';x:number;y:number;w:number;h:number}|{type:'poly';pts:number[][]})[];items:{id:string;x:number;y:number;layer:MarketFloor;label:string;kind:string;info?:string}[];portals:{id:string;kind:'climb'|'stairs';key:'c'|'f';label:string;requiresFlag?:string;a:{x:number;y:number;layer:MarketFloor};b:{x:number;y:number;layer:MarketFloor};radius:number}[];actionObstacles:{id:string;a:number[];b:number[];radius:number}[];battleBarrier:{layer:MarketFloor;a:number[];b:number[];radius:number}};
export const nightMarketSpatial = source as unknown as Spatial;
export const marketArt: Record<MarketFloor, string> = {
  L0: '/assets/night-market/night_market_L0_streets_1672x941.png',
  L1: '/assets/night-market/night_market_L1_rooftops_1672x941.png',
  Lm1: '/assets/night-market/night_market_Lminus1_tunnel_1672x941.png',
};
export const marketEntry = {floor:'L0',x:670,y:781} as const;
export const MARKET_CAT_RADIUS = 10;
export const MARKET_INTERACTION_RADIUS = 75;
export const MARKET_BOSS_RADIUS = 58;
export const marketItems = nightMarketSpatial.items;
export const marketPortals = nightMarketSpatial.portals;

export type MarketMoveResult = {position:{x:number;y:number};blocked:boolean;condition:string|null};
export type MarketEAction = {type:'interact';id:string;layer:MarketFloor}|{type:'battle'}|{type:'hint';text:string}|null;
export type MarketPortalDisplay = {visible:boolean;active:boolean;alpha:number;label:string}|null;

export function marketPortalDisplay(portal:Spatial['portals'][number],point:Spatial['portals'][number]['a'],floor:MarketFloor,x:number,y:number,flags:readonly string[]):MarketPortalDisplay {
  if(point.layer!==floor||(portal.requiresFlag&&!flags.includes(portal.requiresFlag)))return null;
  const distance=Math.hypot(x-point.x,y-point.y),active=distance<=44,climb=portal.kind==='climb',visible=!climb||distance<=portal.radius;
  if(!visible)return {visible:false,active:false,alpha:0,label:''};
  const description=portal.id==='exitClimb'?'翻越战后木箱':portal.id==='southCrate'?'越过南侧货箱':portal.kind==='stairs'?(point.layer==='L0'?'进入地下暗道':'返回地面'):point.layer==='L1'?'返回街面':portal.label.split(' · ')[1];
  return {visible,active,alpha:active?1:climb?.72:.22,label:`${portal.key.toUpperCase()} · ${description}`};
}

export function marketEAction(floor:MarketFloor,x:number,y:number,flags:readonly string[],drawnEvents:readonly string[]):MarketEAction {
  const crowDone=flags.includes('market_crow_clue_completed'),pigeonDone=flags.includes('market_pigeon_clue_completed');
  const momoDone=drawnEvents.includes('node:momo_trail_event');
  const story=[{id:'market_crow_stall',floor:'L0' as const,x:910,y:245,done:crowDone},{id:'market_pigeon_perch',floor:'L1' as const,x:1310,y:426,done:pigeonDone}]
    .filter(item=>item.floor===floor&&!item.done&&Math.hypot(x-item.x,y-item.y)<=MARKET_INTERACTION_RADIUS)
    .sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0];
  if(story)return {type:'interact',id:story.id,layer:story.floor};
  const activePortal=marketPortals.flatMap(portal=>[{portal,point:portal.a},{portal,point:portal.b}]).filter(value=>(!value.portal.requiresFlag||flags.includes(value.portal.requiresFlag))&&value.point.layer===floor&&Math.hypot(x-value.point.x,y-value.point.y)<=44).sort((a,b)=>Math.hypot(x-a.point.x,y-a.point.y)-Math.hypot(x-b.point.x,y-b.point.y))[0];
  if(activePortal){const p=activePortal.portal,point=activePortal.point;const description=p.id==='exitClimb'?'翻越战后木箱':p.id==='southCrate'?'越过南侧货箱':p.kind==='stairs'?(point.layer==='L0'?'进入地下暗道':'返回地面'):point.layer==='L1'?'返回街面':p.label.split(' · ')[1];return {type:'hint',text:`${p.key.toUpperCase()} · ${description}`};}
  if(floor==='L0'&&!momoDone&&Math.hypot(x-947,y-160)<=MARKET_INTERACTION_RADIUS)return {type:'interact',id:'market_momo_trace',layer:'L0'};
  if(floor==='L0'&&momoDone&&Math.hypot(x-947,y-160)<=MARKET_INTERACTION_RADIUS)return {type:'hint',text:'墨墨的踪迹已经查看过了。'};
  if(floor==='L0'&&Math.hypot(x-910,y-245)<=MARKET_INTERACTION_RADIUS&&crowDone)return {type:'hint',text:'老黑羽已经把这条情报告诉你们了。'};
  if(floor==='L1'&&Math.hypot(x-1310,y-426)<=MARKET_INTERACTION_RADIUS&&pigeonDone)return {type:'hint',text:'咕咕大盗的传闻已经听过了。'};
  if(floor==='L0'&&Math.hypot(x-1310,y-169)<=MARKET_BOSS_RADIUS){
    if(flags.includes('market_cleared'))return {type:'hint',text:'集市保卫战已经结束。越过北街木箱可以离开。'};
    if(crowDone&&pigeonDone)return {type:'battle'};
    if(!crowDone&&!pigeonDone)return {type:'hint',text:'集市里的传闻还没拼凑完整。先去打听一些消息。'};
    return {type:'hint',text:!crowDone?'关于回家的路，也许该再向熟悉这片街区的老住户打听。':'东侧高处似乎还有人知道另一段传闻。'};
  }
  if(floor==='L0'&&Math.hypot(x-1365,y-78)<=48&&!flags.includes('market_cleared'))return {type:'hint',text:'北街出口被木箱挡住了。先守住集市保卫战。'};
  return null;
}

export function marketOptionalHint(floor:MarketFloor,x:number,y:number,completed:boolean) {
  if(floor!=='L0'||completed)return null;
  const distance=Math.hypot(x-947,y-160);
  if(distance>450)return '集市北侧似乎还留着一条熟悉的踪迹。';
  if(distance>260)return '北侧高街的墙面像是留下了新的爪印。';
  if(distance>130)return '离墨墨的踪迹越来越近了，去看看墙边那条路。';
  return null;
}

export function distanceToSegment(x:number,y:number,a:number[],b:number[]) {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
}
export function onMarketRoute(floor:MarketFloor,x:number,y:number) {
  if(x<9||y<9||x>1663||y>932)return false;
  return nightMarketSpatial.R[floor].some(([width,points])=>points.slice(1).some((p,i)=>distanceToSegment(x,y,points[i],p)<width/2+4));
}
function segmentDistance(x:number,y:number,a:number[],b:number[]) {return distanceToSegment(x,y,a,b);}
function solidDistance(pts:number[][],x:number,y:number) {
  if(insidePolygon(pts,x,y))return 0;
  return Math.min(...pts.map((point,index)=>distanceToSegment(x,y,point,pts[(index+1)%pts.length])));
}
export function isMarketTraversable(floor:MarketFloor,x:number,y:number,cleared=false,radius=MARKET_CAT_RADIUS) {
  return marketMovementBlockReason(floor,x,y,cleared,radius)===null;
}
export function marketMovementBlockReason(floor:MarketFloor,x:number,y:number,cleared=false,radius=MARKET_CAT_RADIUS):string|null {
  if(x<radius||y<radius||x>1672-radius||y>941-radius)return 'map boundary';
  const route=nightMarketSpatial.R[floor].some(([width,points])=>points.slice(1).some((point,index)=>distanceToSegment(x,y,points[index],point)<=Math.max(0,width/2-radius)));
  if(!route)return 'outside footprint-clear route';
  if(floor==='L0')for(const solid of nightMarketSpatial.solids){
    if(solid.type==='rect'){
      const dx=Math.max(solid.x-x,0,x-(solid.x+solid.w)),dy=Math.max(solid.y-y,0,y-(solid.y+solid.h));
      if(Math.hypot(dx,dy)<radius)return 'solid building rectangle';
    } else if(solidDistance(solid.pts,x,y)<radius)return 'solid building polygon';
  }
  if(floor==='L0')for(const obstacle of nightMarketSpatial.actionObstacles){if(segmentDistance(x,y,obstacle.a,obstacle.b)<obstacle.radius+radius)return `authored obstacle ${obstacle.id}`;}
  const barrier=nightMarketSpatial.battleBarrier;
  if(floor===barrier.layer&&segmentDistance(x,y,barrier.a,barrier.b)<barrier.radius+radius+(cleared?3:0))return 'battle barricade';
  return null;
}
export function sweepMarketMove(floor:MarketFloor,position:{x:number;y:number},delta:{x:number;y:number},cleared=false,maxStep=2):MarketMoveResult {
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(delta.x),Math.abs(delta.y))/maxStep));
  const step={x:delta.x/steps,y:delta.y/steps},next={...position};
  let blocked=false,condition:string|null=null;
  for(let i=0;i<steps;i++){
    if(isMarketTraversable(floor,next.x+step.x,next.y+step.y,cleared)){next.x+=step.x;next.y+=step.y;continue;}
    blocked=true;condition=marketMovementBlockReason(floor,next.x+step.x,next.y+step.y,cleared)??'blocked';
    if(step.x&&isMarketTraversable(floor,next.x+step.x,next.y,cleared))next.x+=step.x;
    if(step.y&&isMarketTraversable(floor,next.x,next.y+step.y,cleared))next.y+=step.y;
  }
  return {position:next,blocked,condition};
}
export function nearestMarketPosition(floor:MarketFloor,x:number,y:number,cleared=false,maxRadius=48) {
  if(isMarketTraversable(floor,x,y,cleared))return {x,y};
  let best:{x:number;y:number}|null=null,bestDistance=Infinity;
  for(let radius=2;radius<=maxRadius;radius+=2)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24){const candidate={x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius};if(!isMarketTraversable(floor,candidate.x,candidate.y,cleared))continue;if(radius<bestDistance){best=candidate;bestDistance=radius;}}
  return best;
}
export function isMarketSolid(floor:MarketFloor,x:number,y:number) {
  if(floor!=='L0')return false;
  return nightMarketSpatial.solids.some(s=>s.type==='rect'
    ? x>s.x-8&&x<s.x+s.w+8&&y>s.y-8&&y<s.y+s.h+8
    : insidePolygon(s.pts,x,y));
}
export function shouldTriggerMarketBoss(floor:MarketFloor, cluesComplete:boolean, cleared:boolean, x:number, y:number) {
  return floor==='L0'&&cluesComplete&&!cleared&&Math.hypot(x-1310,y-169)<MARKET_BOSS_RADIUS;
}
function insidePolygon(points:number[][],x:number,y:number) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}
  return inside;
}
