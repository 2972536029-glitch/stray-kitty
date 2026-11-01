import mapData from '../../../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };
import {tunnelConnections,tunnelEventCompleted,tunnelPortalDisplay,type TunnelLayer,type TunnelPoint} from './navigation';
import {type TunnelSurface} from './surfaces';
import {propIds,propScale,paintTunnelProp} from './eventProps';

type Event=typeof mapData.events[number];
export type TunnelMarkerState={floor:TunnelLayer;surface:TunnelSurface;position:TunnelPoint;flags:readonly string[];drawnEvents:readonly string[];nearTarget:{id:string;label:string}|null;connections:ReturnType<typeof tunnelConnections>};
export const tunnelFixedEvents=mapData.events.filter(e=>propIds.includes(e.id as typeof propIds[number]));
export function tunnelEventObjective(flags:readonly string[]){
  if(flags.includes('tunnel_explored'))return null;
  if(!flags.includes('tunnel_false_kitten_trap_found'))return 'tunnel_false_kitten_trap';
  return flags.includes('valve_three_investigated')?'tunnel_exit_boss':'tunnel_valve_three';
}
export function lockedTunnelEvent(event:Event,flags:readonly string[]){return event.id==='tunnel_valve_three'&&!flags.includes('tunnel_false_kitten_trap_found')||event.type==='battle_exit'&&(!flags.includes('tunnel_false_kitten_trap_found')||!flags.includes('valve_three_investigated'));}
export function nearbyLockedTunnelEvent(state:TunnelMarkerState){return state.surface==='ground'?tunnelFixedEvents.find(e=>e.layer===state.floor&&lockedTunnelEvent(e,state.flags)&&e.type==='story_mandatory'&&Math.hypot(state.position.x-e.x,state.position.y-e.y)<=56):undefined;}
export function tunnelMovementChoices(state:TunnelMarkerState){
  const entries=state.connections.map(connection=>({connection,display:tunnelPortalDisplay(connection,state.flags)})).filter(e=>e.display.visible);
  const eventFocus=!!state.nearTarget||!!nearbyLockedTunnelEvent(state);
  return {entries,eventFocus,labeled:eventFocus?undefined:entries.find(e=>e.display.active)};
}

// One cached atlas and cached label canvases; optional names fade near the cat.
export class TunnelEventMarkers {
  readonly labelOpacity=new Map<string,number>();
  private readonly sprites=new Map<string,HTMLCanvasElement>();
  private previous=0;
  reset(){this.labelOpacity.clear();this.previous=0;}
  private tag(c:CanvasRenderingContext2D,text:string,x:number,y:number,alpha=1,goal=false,small=false){
  const key=`${text}:${goal}:${small}`;let sprite=this.sprites.get(key);
  if(!sprite){sprite=document.createElement('canvas');const s=sprite.getContext('2d')!,font=small?'700 10px system-ui':'700 12.5px system-ui';s.font=font;sprite.width=Math.ceil(s.measureText(text).width+20)*2;sprite.height=(small?20:24)*2;s.scale(2,2);s.font=font;const w=sprite.width/2,h=sprite.height/2;s.fillStyle=goal?'rgba(24,38,30,.92)':'rgba(13,26,30,.84)';s.beginPath();s.roundRect(1,2,w-2,h-4,6);s.fill();s.lineWidth=1.2;s.strokeStyle=goal?'#e6d194':'#9abdb0';s.stroke();s.fillStyle='#f7f0d8';s.textAlign='center';s.textBaseline='middle';s.fillText(text,w/2,h/2+.5);this.sprites.set(key,sprite);}
  c.save();c.globalAlpha*=alpha;c.drawImage(sprite,x-sprite.width/4,y-sprite.height/4,sprite.width/2,sprite.height/2);c.restore();
}
  draw(c:CanvasRenderingContext2D,state:TunnelMarkerState,now:number,allNames=false,showLabels=true){
    const {floor,position, surface,flags,drawnEvents,nearTarget}=state;
    const dt=Math.min(.05,Math.max(0,(now-this.previous)/1000));this.previous=now;
    const opacity=this.labelOpacity,tag=this.tag.bind(this);
    const objective=tunnelEventObjective(flags);
  for(const event of tunnelFixedEvents){
    const onFloor=surface==='ground'&&event.layer===floor,completed=tunnelEventCompleted(event,flags,drawnEvents);
    if(onFloor)paintTunnelProp(c,event.id,event.x,event.y,completed?.48:lockedTunnelEvent(event,flags)?.7:1);
    const mandatory=event.type==='story_mandatory'&&!completed;
    const distance=Math.hypot(position.x-event.x,position.y-event.y),target=!onFloor?0:allNames||mandatory||event.id===objective?1:Math.max(0,Math.min(1,(160-distance)/60));
    const a=opacity.get(event.id)??0,alpha=a+(target-a)*(1-Math.exp(-dt*10));opacity.set(event.id,alpha);
    if(showLabels&&onFloor&&alpha>.005){const suffix=completed?' · 已完成':lockedTunnelEvent(event,flags)?event.id==='tunnel_valve_three'?' · 先调查诱饵':' · 未解锁':nearTarget?.id===event.id?' · E':event.type==='battle_exit'?' · 走入战斗区域':'';tag(c,event.label+suffix,event.x,event.y-38*propScale-16+Math.sin(now/520+event.x*.021)*2.6,alpha*(completed?.52:1),mandatory||event.id===objective);}
  }
  // Reuse the actual current-surface connections and their production gates.
  const choices=tunnelMovementChoices(state);
  for(const entry of choices.entries){
    const {connection,display}=entry,{from:point,portal}=connection;
    c.save();
    if(portal.key==='F'){
      c.translate(point.x,point.y);c.fillStyle='rgba(12,18,22,.35)';c.fillRect(-12,9,24,4);c.fillStyle='#533728';c.fillRect(-3,1,6,14);c.fillRect(-5,13,10,3);c.fillStyle='#302b2a';c.fillRect(-15,-15,30,17);c.fillStyle='#9a633e';c.fillRect(-13,-13,26,13);c.fillStyle='#d8a85d';c.fillRect(-12,-12,24,2);c.fillRect(-12,-2,24,1);c.fillStyle='#f5e3b2';c.font='700 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(connection.to.layer==='Lm1'?'↓':'↑',0,-6);c.translate(-point.x,-point.y);
    }
    const prominent=choices.labeled===entry,y=point.y+(portal.key==='F'?22:0);
    c.globalAlpha=choices.eventFocus?Math.min(display.alpha,.18):prominent?display.alpha:Math.min(display.alpha,.3);
    c.beginPath();c.arc(point.x,y,9,0,Math.PI*2);c.fillStyle=display.locked?'#a6a497':prominent?'#73e1dd':'#91bab8';c.fill();c.strokeStyle='#102b38';c.lineWidth=2;c.stroke();c.fillStyle='#10232b';c.font='700 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(portal.key==='Space'?'↔':portal.key,point.x,y+.5);c.restore();
    if(showLabels&&prominent)tag(c,display.label,point.x+75,point.y-25,1,false,true);
  }
}
}
