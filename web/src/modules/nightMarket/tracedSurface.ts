import trace from '../../../../specs/night-market/night_market_traced_mask.json';
type Floor='L0'|'L1'|'Lm1';
const fields=Object.fromEntries(Object.entries(trace.floors).map(([floor,runs])=>{
  const values=new Uint8Array(trace.columns*trace.rows);
  for(const [start,end] of runs)values.fill(1,start,end);
  return[floor,values];
})) as Record<Floor,Uint8Array>;

/** Already includes the reviewed 10px footprint; do not erode the street twice. */
export function onTracedMarketSurface(floor:Floor,x:number,y:number){
  const column=Math.floor(x/trace.resolution),row=Math.floor(y/trace.resolution);
  return column>=0&&row>=0&&column<trace.columns&&row<trace.rows&&fields[floor][row*trace.columns+column]===1;
}
