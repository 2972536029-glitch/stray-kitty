import geometry from '../../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type:'json'};
import {paintWarehouseProp,propScale} from './eventProps';

export type Point={x:number;y:number};
export type Floor='L0'|'L1';
type Target={id:string;label:string;key:'E'|'C';distance:number}|null;
export type MarkerState={floor:Floor;position:Point;flags:ReadonlySet<string>;drawn:ReadonlySet<string>;near:Target};
export const fixedPoints=geometry.interactions.filter(p=>p.kind!=='start');
export const names:Record<string,string>={entry_lamp:'入口灯',central_spotlight:'中央聚光灯',secondary_lamp:'东侧灯',warehouse_lookout:'货架顶的瞭望位',warehouse_light_crate:'吊在半空的灯具箱',finale_boss:'仓库防线',bunker_exit:'隔间出口'};

export class WarehouseEventMarkers {
  readonly opacity=new Map<string,number>();
  private readonly labels=new Map<string,HTMLCanvasElement>();
  private previous=0;
  reset(){this.opacity.clear();this.previous=0;}

  private tag(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,alpha:number,main=false,small=false) {
    const key=`${text}:${main}:${small}`;let label=this.labels.get(key);
    if(!label){
      label=document.createElement('canvas');const c=label.getContext('2d')!,font=small?'700 10px system-ui':'700 12.5px system-ui';c.font=font;
      label.width=Math.ceil(c.measureText(text).width+20)*2;label.height=(small?20:24)*2;c.scale(2,2);c.font=font;
      const w=label.width/2,h=label.height/2;c.fillStyle=main?'rgba(24,38,30,.92)':'rgba(13,26,30,.84)';c.beginPath();c.roundRect(1,2,w-2,h-4,6);c.fill();
      c.lineWidth=1.2;c.strokeStyle=main?'#e6d194':'#9abdb0';c.stroke();c.fillStyle='#f7f0d8';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2+.5);this.labels.set(key,label);
    }
    ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(label,x-label.width/4,y-label.height/4,label.width/2,label.height/2);ctx.restore();
  }

  draw(ctx:CanvasRenderingContext2D,state:MarkerState,now:number,allNames=false) {
    const dt=Math.min(.05,Math.max(0,(now-this.previous)/1000));this.previous=now;
    const {floor,position,flags,drawn,near}=state,victory=flags.has('finale_boss_victory');
    for(const point of fixedPoints){
      const visible=point.floor===floor,done=point.kind==='fixed_event'?drawn.has('node:'+point.id):point.id==='finale_boss'?victory:false;
      const locked=point.id==='bunker_exit'&&!victory,main=point.id==='finale_boss'&&!victory||point.id==='bunker_exit'&&victory;
      if(visible)paintWarehouseProp(ctx,point.id,point.x,point.y,flags.has(point.id),done?.48:locked?.62:1);
      const distance=Math.hypot(position.x-point.x,position.y-point.y),target=!visible?0:allNames||main?1:Math.max(0,Math.min(1,(160-distance)/60));
      const previous=this.opacity.get(point.id)??0,alpha=previous+(target-previous)*(1-Math.exp(-dt*10));this.opacity.set(point.id,alpha);
      if(visible&&alpha>.005){
        const suffix=done?' · 已完成':near?.id===point.id?' · E':locked?' · 战后解锁':point.kind==='light'?(flags.has(point.id)?' · 已亮':' · 未亮'):'';
        this.tag(ctx,names[point.id]+suffix,point.x,point.y-38*propScale-16+Math.sin(now/520+point.x*.021)*2.6,alpha*(done?.52:1),main);
      }
    }
    // Keep actual nearest-target selection: the labels follow the actual E/C target.
    const eventFocus=near?.key==='E';
    const climbs=geometry.climbs.map(point=>({point,distance:Math.hypot(position.x-point.x,position.y-point.y)})).filter(p=>p.distance<=76).sort((a,b)=>a.distance-b.distance);
    for(const {point,distance} of climbs){
      const active=near?.key==='C'&&distance<=44&&climbs[0].point===point;
      ctx.save();ctx.globalAlpha=eventFocus?.18:active?1:Math.max(.22,.65*(76-distance)/32);ctx.fillStyle=active?'#73e1dd':'#91bab8';ctx.strokeStyle='#102b38';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(point.x,point.y-12,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#10232b';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('C',point.x,point.y-11.5);ctx.restore();
      if(active&&!eventFocus)this.tag(ctx,floor==='L0'?'C · 攀上货架':'C · 返回地面',point.x+74,point.y-32,1,false,true);
    }
  }
}
