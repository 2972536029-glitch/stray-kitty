import mapData from '../../../level_design/chapter4/data/chapter4.map.json';
import {tunnelEventCompleted,tunnelPortalDisplay,type tunnelConnections} from '../../../web/src/modules/chapter4/navigation';
type Point={x:number;y:number};
type BaselineRuntime={cameraPosition:Point;surface:string;floor:string;labelsVisible:boolean;connections:()=>ReturnType<typeof tunnelConnections>;drawLabel:(context:CanvasRenderingContext2D,label:string,point:Point,movement:boolean)=>void};
const camera={width:1066,height:640};
// Historical canvas labels belong only to this before/after review.
export function drawBaselineLabel(this: Pick<BaselineRuntime, 'cameraPosition'>, context: CanvasRenderingContext2D, label: string, point: Point, movement: boolean) {
  context.font = `${movement ? 12 : 13}px "Microsoft YaHei",system-ui,sans-serif`;
  const width = context.measureText(label).width + 12, height = movement ? 20 : 21;
  const x = Math.max(this.cameraPosition.x + 4, Math.min(point.x + 15, this.cameraPosition.x + camera.width - width - 4));
  const y = Math.max(this.cameraPosition.y + 40, point.y - 23);
  context.fillStyle = 'rgba(16,28,38,.92)'; context.fillRect(x, y, width, height);
  context.strokeStyle = '#f2e4c4'; context.lineWidth = 1; context.strokeRect(x + .5, y + .5, width - 1, height - 1);
  context.fillStyle = '#fff0c4'; context.textAlign = 'left'; context.textBaseline = 'middle'; context.fillText(label, x + 6, y + height / 2);
}
export function drawBaselineMarkers(this: BaselineRuntime, context: CanvasRenderingContext2D, flags: readonly string[], drawnEvents: readonly string[]) {
    const inView = (point: Point) => point.x >= this.cameraPosition.x - 16 && point.x <= this.cameraPosition.x + camera.width + 16 && point.y >= this.cameraPosition.y - 16 && point.y <= this.cameraPosition.y + camera.height + 16;
    // Random encounters are invisible area triggers, as in Chapters 1 and 2.
    // The entry is scenery, not an E interaction.
    for (const event of mapData.events.filter(event => this.surface === 'ground' && event.layer === this.floor && inView(event) && !['layer_connector', 'random_zone', 'entry'].includes(event.type))) {
      const completed = tunnelEventCompleted(event, flags, drawnEvents);
      const locked = event.id === 'tunnel_valve_three' && !flags.includes('tunnel_false_kitten_trap_found')
        || event.type === 'battle_exit' && (!flags.includes('tunnel_false_kitten_trap_found') || !flags.includes('valve_three_investigated'));
      context.save(); context.globalAlpha = completed ? .62 : 1;
      context.beginPath(); context.arc(event.x, event.y, 11, 0, Math.PI * 2);
      context.fillStyle = locked ? '#a6a497' : event.type === 'battle_exit' ? '#ef906a' : '#f0cd79'; context.fill();
      context.lineWidth = 2; context.strokeStyle = '#172630'; context.stroke();
      context.font = 'bold 11px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#172630';
      context.fillText(completed ? '✓' : event.type === 'battle_exit' || event.type === 'story_mandatory' ? '!' : 'E', event.x, event.y + .5);
      if (this.labelsVisible) this.drawLabel(context, `${event.label}${!completed && !locked && event.type !== 'battle_exit' ? ' · E' : ''}${locked ? ' · 未解锁' : completed ? ' · 已完成' : ''}`, event, false);
      context.restore();
    }
    for (const connection of this.connections()) {
      const {from: point, portal} = connection, display = tunnelPortalDisplay(connection, flags);
      if (!display.visible || !inView(point)) continue;
      context.save();
      if (portal.key === 'F') {
        // The same compact timber sign as Chapter 2; the full key prompt appears nearby.
        context.translate(point.x, point.y);
        context.fillStyle = 'rgba(12,18,22,.35)'; context.fillRect(-12, 9, 24, 4);
        context.fillStyle = '#533728'; context.fillRect(-3, 1, 6, 14); context.fillRect(-5, 13, 10, 3);
        context.fillStyle = '#302b2a'; context.fillRect(-15, -15, 30, 17);
        context.fillStyle = '#9a633e'; context.fillRect(-13, -13, 26, 13);
        context.fillStyle = '#d8a85d'; context.fillRect(-12, -12, 24, 2); context.fillRect(-12, -2, 24, 1);
        context.fillStyle = '#f5e3b2'; context.font = 'bold 10px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(connection.to.layer === 'Lm1' ? '↓' : '↑', 0, -6);
        context.translate(-point.x, -point.y);
      }
      context.globalAlpha = display.alpha;
      context.beginPath(); context.arc(point.x, point.y + (portal.key === 'F' ? 22 : 0), 9, 0, Math.PI * 2);
      context.fillStyle = display.locked ? '#a6a497' : display.active ? '#73e1dd' : '#91bab8'; context.fill();
      context.strokeStyle = '#102b38'; context.lineWidth = 2; context.stroke();
      context.fillStyle = '#10232b'; context.font = 'bold 10px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(portal.key === 'Space' ? '↔' : portal.key, point.x, point.y + (portal.key === 'F' ? 22 : 0));
      if (this.labelsVisible && (display.active || portal.key !== 'F')) {
        this.drawLabel(context, `${display.active ? '' : '靠近后 '}${display.label}`, point, true);
      }
      context.restore();
    }
    context.save(); context.fillStyle = 'rgba(16,28,38,.9)'; context.fillRect(this.cameraPosition.x + 12, this.cameraPosition.y + 42, 154, 25);
    context.fillStyle = '#fff0c4'; context.font = '13px "Microsoft YaHei",system-ui,sans-serif'; context.textAlign = 'left'; context.textBaseline = 'middle';
    context.fillText(this.floor === 'L0' ? 'L0 · 主暗渠' : 'L−1 · 下层排水道', this.cameraPosition.x + 20, this.cameraPosition.y + 54.5); context.restore();
  }
