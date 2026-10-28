import source from '../../../../specs/night-market/night_market_v016_spatial_reference.json';

export type MarketFloor = 'L0' | 'L1' | 'Lm1';
type Spatial = {R:Record<MarketFloor,[number,number[][]][]>;solids:({type:'rect';x:number;y:number;w:number;h:number}|{type:'poly';pts:number[][]})[]};
export const nightMarketSpatial = source as unknown as Spatial;
export const marketArt: Record<MarketFloor, string> = {
  L0: '/assets/night-market/night_market_L0_streets_1672x941.png',
  L1: '/assets/night-market/night_market_L1_rooftops_1672x941.png',
  Lm1: '/assets/night-market/night_market_Lminus1_tunnel_1672x941.png',
};

export function distanceToSegment(x:number,y:number,a:number[],b:number[]) {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
}
export function onMarketRoute(floor:MarketFloor,x:number,y:number) {
  if(x<9||y<9||x>1663||y>932)return false;
  return nightMarketSpatial.R[floor].some(([width,points])=>points.slice(1).some((p,i)=>distanceToSegment(x,y,points[i],p)<width/2+4));
}
export function isMarketSolid(floor:MarketFloor,x:number,y:number) {
  if(floor!=='L0')return false;
  return nightMarketSpatial.solids.some(s=>s.type==='rect'
    ? x>s.x-8&&x<s.x+s.w+8&&y>s.y-8&&y<s.y+s.h+8
    : insidePolygon(s.pts,x,y));
}
function insidePolygon(points:number[][],x:number,y:number) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}
  return inside;
}
