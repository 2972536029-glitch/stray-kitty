import {marketEAction,marketInteractionTarget,marketItems,type MarketFloor} from './map';
import {icons,iconScale,paintMarketEvent} from './eventProps';

type Point={x:number;y:number};
type Item=typeof marketItems[number];
export const marketFixedEvents=marketItems.filter(item=>icons.includes(item.id as typeof icons[number]));

export function marketEventObjective(flags:readonly string[]){
  return flags.includes('market_cleared')?'exit':!flags.includes('market_crow_clue_completed')?'crow':!flags.includes('market_pigeon_clue_completed')?'pigeon':'boss';
}
export function marketEventAppearance(item:Item,flags:readonly string[],drawn:readonly string[]){
  const cleared=flags.includes('market_cleared');
  const completed=item.id==='crow'?flags.includes('market_crow_clue_completed'):item.id==='pigeon'?flags.includes('market_pigeon_clue_completed'):item.id==='momo'?drawn.includes('node:momo_trail_event'):item.id==='boss'?cleared:false;
  const locked=item.id==='boss'&&(!flags.includes('market_crow_clue_completed')||!flags.includes('market_pigeon_clue_completed'))||item.id==='exit'&&!cleared;
  const title=item.id==='exit'?(cleared?'北街出口 · 第三章花房':'北街出口 · 战后开启'):item.id==='momo'?'墨墨的踪迹 · 可选':item.label;
  return {completed,locked,title};
}

/** Reuse rasterized text across frames, with bounded keys from fixed map labels. */
export class MarketLabelCache {
  private readonly sprites=new Map<string,HTMLCanvasElement>();
  draw(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,alpha=1,objective=false,small=false){
    const key=`${text}:${objective}:${small}`;let sprite=this.sprites.get(key);
    if(!sprite){
      sprite=document.createElement('canvas');const c=sprite.getContext('2d')!,font=small?'700 10px system-ui':'700 12.5px system-ui';c.font=font;
      sprite.width=Math.ceil(c.measureText(text).width+20)*2;sprite.height=(small?20:24)*2;c.scale(2,2);c.font=font;
      const w=sprite.width/2,h=sprite.height/2;c.fillStyle=objective?'rgba(24,38,30,.92)':'rgba(13,26,30,.84)';c.beginPath();c.roundRect(1,2,w-2,h-4,6);c.fill();c.lineWidth=1.2;c.strokeStyle=objective?'#e6d194':'#9abdb0';c.stroke();c.fillStyle='#f7f0d8';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2+.5);this.sprites.set(key,sprite);
    }
    ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(sprite,x-sprite.width/4,y-sprite.height/4,sprite.width/2,sprite.height/2);ctx.restore();
  }
}

export class MarketEventMarkers {
  readonly labels=new MarketLabelCache();
  private readonly opacity=new Map<string,number>();
  private previous=0;
  reset(){this.previous=0;this.opacity.clear();}
  get labelOpacity(){return Object.fromEntries(this.opacity);}
  draw(ctx:CanvasRenderingContext2D,floor:MarketFloor,position:Point,flags:readonly string[],drawn:readonly string[],now:number,allNames=false){
    const dt=this.previous?Math.min(.1,Math.max(0,(now-this.previous)/1000)):1/60;this.previous=now;
    const objective=marketEventObjective(flags),activeId=marketInteractionTarget(floor,position.x,position.y,flags,drawn)?.id;
    const battleActive=marketEAction(floor,position.x,position.y,flags,drawn)?.type==='battle';
    const interactions:Record<string,string>={crow:'market_crow_stall',pigeon:'market_pigeon_perch',momo:'market_momo_trace'};
    for(const item of marketFixedEvents){
      const {completed,locked,title}=marketEventAppearance(item,flags,drawn),onFloor=item.layer===floor;
      if(onFloor)paintMarketEvent(ctx,item.id,item.x,item.y,completed?.48:locked?.7:1);
      const distance=Math.hypot(position.x-item.x,position.y-item.y),target=!onFloor?0:allNames||item.id===objective?1:Math.max(0,Math.min(1,(160-distance)/60));
      const before=this.opacity.get(item.id)??0,alpha=before+(target-before)*(1-Math.exp(-dt*10));this.opacity.set(item.id,alpha);
      if(!onFloor||alpha<.005)continue;
      const active=!!interactions[item.id]&&interactions[item.id]===activeId||item.id==='boss'&&battleActive;
      if(allNames)this.labels.draw(ctx,title,item.x,item.y-38*iconScale-16,alpha*(completed?.52:1),item.id===objective);
      else {ctx.save();ctx.globalAlpha=alpha*(completed?.35:1);ctx.strokeStyle=item.id===objective?'#e4cf98':'#bacabb';ctx.lineWidth=active?1.1:.7;ctx.setLineDash(active?[]:[2,3]);ctx.beginPath();ctx.ellipse(item.x,item.y+4,active?14:9,active?4:3,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
  }
}
