import geometry from '../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type:'json'};
type Point={x:number;y:number};
type BaselineRuntime={nearTarget:{id:string;label:string}|null;position:{x:number;y:number};floor:string;drawn:Set<string>;flags:Set<string>};
export function drawBaselineMarkers(this:BaselineRuntime,ctx:CanvasRenderingContext2D){
    const near=this.nearTarget;
    const marker=(point:Point,key:string,color:string,label?:string)=>{ctx.save();ctx.fillStyle=color;ctx.strokeStyle='#172731';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y-12,10,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#172731';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(key,point.x,point.y-8);if(label){ctx.font='13px "Microsoft YaHei",sans-serif';const width=ctx.measureText(label).width+14;ctx.fillStyle='rgba(16,28,38,.93)';ctx.fillRect(point.x-width/2,point.y-47,width,23);ctx.fillStyle='#fff0c4';ctx.fillText(label,point.x,point.y-31);}ctx.restore();};
    for(const climb of geometry.climbs)marker(climb,'C','#9cd8d7',Math.hypot(climb.x-this.position.x,climb.y-this.position.y)<=44?(this.floor==='L0'?'C · 攀上货架':'C · 返回地面'):undefined);
    for(const point of geometry.interactions){if(point.floor!==this.floor||point.kind==='start')continue;const done=point.kind==='fixed_event'?this.drawn.has('node:'+point.id):point.id==='finale_boss'?this.flags.has('finale_boss_victory'):false;
      const locked=point.id==='bunker_exit'&&!this.flags.has('finale_boss_victory');marker(point,done?'✓':locked?'锁':point.kind==='battle'?'!':'E',done?'#a8ba96':'#ead38b',near?.id===point.id?near.label:undefined);
    }
  }
