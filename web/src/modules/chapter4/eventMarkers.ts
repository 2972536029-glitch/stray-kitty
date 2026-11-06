import mapData from '../../../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };
import {tunnelConnections,tunnelEventCompleted,tunnelPortalDisplay,type TunnelLayer,type TunnelPoint} from './navigation';
import {type TunnelSurface} from './surfaces';
import {propIds,paintTunnelProp} from './eventProps';

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

// Text and keycaps are rendered by the shared DOM glass-label overlay.
export class TunnelEventMarkers {
  draw(c:CanvasRenderingContext2D,state:TunnelMarkerState){
    const {floor,surface,flags,drawnEvents}=state;
    for(const event of tunnelFixedEvents){
      if(surface!=='ground'||event.layer!==floor)continue;
      const completed=tunnelEventCompleted(event,flags,drawnEvents);
      paintTunnelProp(c,event.id,event.x,event.y,completed?.48:lockedTunnelEvent(event,flags)?.7:1);
    }
    for(const {connection,display} of tunnelMovementChoices(state).entries){
      const {from:point,portal}=connection;
      c.save();
      if(portal.key==='F'){
        c.translate(point.x,point.y);c.fillStyle='rgba(12,18,22,.35)';c.fillRect(-12,9,24,4);c.fillStyle='#533728';c.fillRect(-3,1,6,14);c.fillRect(-5,13,10,3);c.fillStyle='#302b2a';c.fillRect(-15,-15,30,17);c.fillStyle='#9a633e';c.fillRect(-13,-13,26,13);c.fillStyle='#d8a85d';c.fillRect(-12,-12,24,2);c.fillRect(-12,-2,24,1);c.fillStyle='#f5e3b2';c.font='700 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(connection.to.layer==='Lm1'?'?':'?',0,-6);
      }else{
        c.globalAlpha=display.active?1:.3;c.strokeStyle=display.locked?'#a6a497':'#91bab8';c.lineWidth=1;c.beginPath();c.ellipse(point.x,point.y+4,12,4,0,0,Math.PI*2);c.stroke();
      }
      c.restore();
    }
  }
}
