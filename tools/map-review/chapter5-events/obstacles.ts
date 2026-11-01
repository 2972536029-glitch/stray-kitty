import baseline from './baseline-obstacles.json' with {type:'json'};
export type Rect={x:number;y:number;w:number;h:number};
type Component={sourceSprite:string;rotationDegrees:number;drawRect:Rect};
export type ReviewObstacle={solidId:string;zOrder:number;collisionRect:Rect;components:Component[]};
export const replacementIds=baseline.map(record=>record.solidId);
export function baselineBlockers(records:ReviewObstacle[]):ReviewObstacle[]{
  return records.map(record=>{const old=baseline.find(p=>p.solidId===record.solidId);return old?{...record,components:old.components}:record;});
}
