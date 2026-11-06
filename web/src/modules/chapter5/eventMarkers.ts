import geometry from '../../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type:'json'};
import {paintWarehouseProp} from './eventProps';

export type Point={x:number;y:number};
export type Floor='L0'|'L1';
type Target={id:string;label:string;key:'E'|'C';distance:number}|null;
export type MarkerState={floor:Floor;position:Point;flags:ReadonlySet<string>;drawn:ReadonlySet<string>;near:Target};
export const fixedPoints=geometry.interactions.filter(p=>p.kind!=='start');
export const names:Record<string,string>={entry_lamp:'入口灯',central_spotlight:'中央聚光灯',secondary_lamp:'东侧灯',warehouse_lookout:'货架顶的瞭望位',warehouse_light_crate:'吊在半空的灯具箱',finale_boss:'仓库防线',bunker_exit:'隔间出口'};

// Preserve map props and anchors; the shared glass overlay owns every label/key.
export class WarehouseEventMarkers {
  draw(ctx:CanvasRenderingContext2D,state:MarkerState) {
    const {floor,flags,drawn}=state,victory=flags.has('finale_boss_victory');
    for(const point of fixedPoints){
      if(point.floor!==floor)continue;
      const done=point.kind==='fixed_event'?drawn.has('node:'+point.id):point.id==='finale_boss'?victory:false;
      const locked=point.id==='bunker_exit'&&!victory;
      paintWarehouseProp(ctx,point.id,point.x,point.y,flags.has(point.id),done?.48:locked?.62:1);
    }
    for(const point of geometry.climbs){
      const distance=Math.hypot(state.position.x-point.x,state.position.y-point.y);
      if(distance>76)continue;
      ctx.save();ctx.globalAlpha=state.near?.key==='C'&&distance<=44?1:.3;ctx.strokeStyle='#91bab8';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(point.x,point.y+4,12,4,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
}
