import {rainyAlleyObjectEligible,type RainyFixedObject} from './assets';
import type {Point} from './types';

export const EVENT_PROP_SCALE=.9;
export function rainyEventObjective(flags:readonly string[]){
  return !flags.includes('alley_rescued')?'alley_crate':!flags.includes('lost_poster_found')?'alley_poster':null;
}

/** Quiet ground marks identify discoveries; names and controls live in the HUD. */
export class RainyEventLabels {
  private readonly opacity=new Map<string,number>();
  private previous=0;
  reset(){this.previous=0;this.opacity.clear();}
  draw(context:CanvasRenderingContext2D,objects:readonly RainyFixedObject[],flags:readonly string[],position:Point,activeId:string|undefined,now:number){
    const dt=this.previous?Math.min(.1,Math.max(0,(now-this.previous)/1000)):1/60;this.previous=now;
    const objective=rainyEventObjective(flags);
    for(const object of objects){
      const eligible=rainyAlleyObjectEligible(object,flags);
      const distance=Math.hypot(position.x-object.x,position.y-object.y);
      const target = !eligible ? 0 : object.id === objective ? .72 : Math.max(0,Math.min(.8,(110-distance)/60));
      const before=this.opacity.get(object.id)??0,alpha=before+(target-before)*(1-Math.exp(-dt*10));this.opacity.set(object.id,alpha);
      if(alpha<.01)continue;
      const active=object.id===activeId;
      context.save();context.globalAlpha=alpha;context.lineWidth=active ? .8 : .55;
      context.strokeStyle=object.id===objective?'#ead5a0':'#c0d0c1';
      context.setLineDash(active?[]:[1.5,2.5]);
      context.beginPath();context.ellipse(object.x,object.y+3,active?11:7,active?3:2,0,0,Math.PI*2);context.stroke();
      if(active){context.fillStyle='#f1ddb2';context.fillRect(object.x-1,object.y+2,2,2);}
      context.restore();
    }
  }
}
