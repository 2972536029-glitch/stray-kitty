import {rainyAlleyObjectEligible,type RainyFixedObject} from './assets';
import type {Point} from './types';

export const EVENT_PROP_SCALE=.9;
const emoji:Record<string,string>={alley_puddle_reflection:'💧',alley_empty_fish_can:'🥫',alley_fish_dry:'🐟',alley_crate:'📦',alley_poster:'📄',alley_scratch_marks:'🐾',alley_blanket_stack:'🧺',alley_dog_friend_point:'🐕'};
export function rainyEventObjective(flags:readonly string[]){
  return !flags.includes('alley_rescued')?'alley_crate':!flags.includes('lost_poster_found')?'alley_poster':null;
}

/** Bounded label cache: animation reuses text sprites instead of rasterizing each frame. */
export class RainyEventLabels {
  private readonly sprites=new Map<string,HTMLCanvasElement>();
  private readonly opacity=new Map<string,number>();
  private previous=0;
  reset(){this.previous=0;this.opacity.clear();}
  draw(context:CanvasRenderingContext2D,objects:readonly RainyFixedObject[],flags:readonly string[],position:Point,activeId:string|undefined,now:number){
    const dt=this.previous?Math.min(.1,Math.max(0,(now-this.previous)/1000)):1/60;this.previous=now;
    const objective=rainyEventObjective(flags);
    for(const object of objects){
      const eligible=!object.requiresFlag||flags.includes(object.requiresFlag);
      const distance=Math.hypot(position.x-object.x,position.y-object.y);
      const target=!eligible?0:object.id===objective?1:Math.max(0,Math.min(1,(95-distance)/30));
      const before=this.opacity.get(object.id)??0,alpha=before+(target-before)*(1-Math.exp(-dt*10));this.opacity.set(object.id,alpha);
      if(!eligible||alpha<.005)continue;
      const active=object.id===activeId,isObjective=object.id===objective;
      const key=`${object.id}:${active}:${isObjective}`;
      let sprite=this.sprites.get(key);
      if(!sprite){
        const text=`${emoji[object.id]??'✦'} ${object.label}${active?' · E':''}`;
        sprite=document.createElement('canvas');const s=sprite.getContext('2d')!;s.font='700 12.5px system-ui, sans-serif';
        sprite.width=Math.ceil(s.measureText(text).width+22)*2;sprite.height=46;
        s.scale(2,2);s.font='700 12.5px system-ui, sans-serif';const width=sprite.width/2;
        s.fillStyle=isObjective?'rgba(24,38,30,.92)':'rgba(13,26,30,.8)';s.beginPath();s.roundRect(1,2,width-2,19,6);s.fill();
        s.strokeStyle=isObjective?'rgba(255,222,130,.95)':object.kind==='inspection'?'rgba(190,232,206,.5)':object.kind==='story'?'rgba(238,168,209,.5)':'rgba(255,209,102,.5)';
        s.lineWidth=1.4;s.stroke();s.fillStyle='#f7f2df';s.textAlign='center';s.textBaseline='middle';s.fillText(text,width/2,12);this.sprites.set(key,sprite);
      }
      const bob=Math.sin(now/520+object.x*.021)*2.6,width=sprite.width/2,height=sprite.height/2;
      context.save();context.globalAlpha=alpha*(rainyAlleyObjectEligible(object,flags)?1:.42);
      const labelOffset=Math.max(44.8,(object.id==='alley_crate'?63:32)*EVENT_PROP_SCALE);
      context.drawImage(sprite,object.x-width/2,object.y-labelOffset-height-6+bob,width,height);context.restore();
    }
  }
}
