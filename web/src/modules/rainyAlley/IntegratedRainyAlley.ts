import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import {rainyAlleyObjectEligible, rainyAlleyRegistration, rainyAlleySource, type RainyFixedObject} from './assets';
import {findPath, sweepMove} from './collision';
import {
  rainyAlleyFieldClosed, rainyAlleyFieldOpen, rainyAlleyGeometryClosed, rainyAlleyGeometryOpen,
  rainyAlleySqueezeFieldClosed, rainyAlleySqueezeFieldOpen, SQUEEZE_BOUNDS, SQUEEZE_CENTER_X,
  SQUEEZE_OPENING_WIDTH, battleReturnPositionTarget, crateClimbTarget, squeezeExitTarget
} from './runtimeGeometry';
import type {Point, WorldPolygon} from './types';

const spawn = {x: 111, y: 626};
// When a page reloads between rescue and poster discovery, restore near the story anchor.
const pendingPosterReturn = {x: 990, y: 396};
const speed = 96;
const cameraSize = {width: 530, height: 325};
const squeezeSpeed = 58;
const CLIMB_DURATION = 0.55;
type ZoneCheckResult = 'checking' | 'accepted' | 'failed';
interface DebugState {phase: string; eventId?: string; pendingEventSource?: string; randomEligible?: boolean}

function image(source: string) {const result = new Image(); result.src = source; return result;}
function polygonPath(context: CanvasRenderingContext2D, polygon: WorldPolygon) {
  polygon.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

export class IntegratedRainyAlley {
  private readonly background = image(rainyAlleySource.backgroundUrl);
  private position: Point = {...spawn};
  private camera: Point = {x: 0, y: rainyAlleyRegistration.worldHeight - cameraSize.height};
  private path: Point[] = [];
  private destination: Point | null = null;
  private debug = false;
  private gateOpen = false;
  private nearby: RainyFixedObject | null = null;
  private zonesInside = new Set<string>();
  private lastZoneAttempt: string | null = null;
  private zoneChecksInFlight = new Set<string>();
  private zoneCheckStatus = new Map<string, ZoneCheckResult>();
  private squeezeTargetY: number | null = null;
  private climbTime = 0;
  private climbFrom: Point | null = null;
  private climbTo: Point | null = null;
  private climbCrateId: 'west' | 'east' | null = null;

  reset(flags: readonly string[] = [], battleReturn?: Point) {
    this.gateOpen = flags.includes('alley_rescued');
    const restoreField = rainyAlleyFieldOpen;
    const savedPosition = battleReturnPositionTarget(battleReturn, restoreField);
    const canRestoreBattlePosition = flags.includes('alley_rescued') && !flags.includes('lost_poster_found') && savedPosition;
    this.position = canRestoreBattlePosition
      ? savedPosition
      : flags.includes('alley_rescued') && !flags.includes('lost_poster_found')
        ? (restoreField.nearestTraversable(pendingPosterReturn) ?? {...spawn})
        : {...spawn};
    this.camera = {x: 0, y: rainyAlleyRegistration.worldHeight - cameraSize.height};
    this.path = []; this.destination = null; this.nearby = null;
    this.zonesInside.clear();
    for (const zone of rainyAlleySource.objects.zones) if (Math.hypot(this.position.x - zone.x, this.position.y - zone.y) <= zone.r) this.zonesInside.add(zone.id);
    this.zoneChecksInFlight.clear(); this.squeezeTargetY = null; this.climbTime = 0; this.climbFrom = null; this.climbTo = null; this.climbCrateId = null;
  }

  toggleDebug() {this.debug = !this.debug;}
  nearestInteraction() {return this.nearby;}
  pauseForEvent() {this.path = []; this.destination = null;}
  squeezePromptActive() {return this.squeezeTargetY === null && this.squeezeDirection() !== 0;}
  tryStartSqueeze() {
    const direction = this.squeezeDirection();
    if (!direction || this.squeezeTargetY !== null) return false;
    this.path = []; this.destination = null;
    const normalField = this.gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const squeezeField = this.gateOpen ? rainyAlleySqueezeFieldOpen : rainyAlleySqueezeFieldClosed;
    const exit = squeezeExitTarget(normalField, squeezeField, direction);
    if (!exit) return false;
    this.squeezeTargetY = exit.y;
    return true;
  }

  climbPromptActive() {return this.climbTarget() !== null && this.climbTime <= 0;}
  tryStartCrateClimb() {
    const field = this.gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const crossing = crateClimbTarget(this.position, field, this.gateOpen);
    if (!crossing || this.climbTime > 0) return false;
    this.path = []; this.destination = null;
    this.climbFrom = {...crossing.from}; this.climbTo = {...crossing.to}; this.climbCrateId = crossing.crateId; this.position = {...crossing.from}; this.climbTime = CLIMB_DURATION;
    return true;
  }
  worldPosition(): Point {return {...this.position};}
  private climbTarget() {return crateClimbTarget(this.position, this.gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed, this.gateOpen);}

  move(
    deltaSeconds: number,
    horizontal: number,
    vertical: number,
    flags: readonly string[],
    onZoneEntry: (zoneId: string) => Promise<boolean>
  ) {
    const gateOpen = flags.includes('alley_rescued');
    const previous = {...this.position};
    if (gateOpen !== this.gateOpen) {this.gateOpen = gateOpen; this.path = []; this.destination = null;}
    const field = gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    if (this.climbTime > 0 && this.climbFrom && this.climbTo) {
      this.climbTime = Math.max(0, this.climbTime - deltaSeconds);
      const progress = 1 - this.climbTime / CLIMB_DURATION, eased = progress * progress * (3 - 2 * progress);
      this.position = {x: this.climbFrom.x + (this.climbTo.x - this.climbFrom.x) * eased, y: this.climbFrom.y + (this.climbTo.y - this.climbFrom.y) * eased};
      if (this.climbTime === 0) {this.position = {...this.climbTo}; this.climbFrom = null; this.climbTo = null; this.climbCrateId = null;}
    } else if (this.squeezeTargetY !== null) {
      const squeezeField = gateOpen ? rainyAlleySqueezeFieldOpen : rainyAlleySqueezeFieldClosed;
      const dx = SQUEEZE_CENTER_X - this.position.x, dy = this.squeezeTargetY - this.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1) {this.position = {x: SQUEEZE_CENTER_X, y: this.squeezeTargetY}; this.squeezeTargetY = null;}
      else {
        const amount = Math.min(distance, squeezeSpeed * deltaSeconds);
        this.position = sweepMove(squeezeField, this.position, {x: dx / distance * amount, y: dy / distance * amount}, 2).position;
      }
    } else if (horizontal || vertical) {
      const length = Math.hypot(horizontal, vertical);
      this.path = []; this.destination = null;
      this.position = sweepMove(field, this.position, {
        x: horizontal / length * speed * deltaSeconds,
        y: vertical / length * speed * deltaSeconds
      }).position;
    } else if (this.path.length) {
      const target = this.path[0], dx = target.x - this.position.x, dy = target.y - this.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 2) this.path.shift();
      else {
        const amount = Math.min(distance, speed * deltaSeconds);
        const result = sweepMove(field, this.position, {x: dx / distance * amount, y: dy / distance * amount});
        this.position = result.position;
        if (result.blockedX && result.blockedY) this.path = [];
      }
    }
    this.updateNearby(flags);
    this.updateZones(flags, onZoneEntry);
    this.followCamera(deltaSeconds);
    return Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
  }

  click(clientX: number, clientY: number, bounds: DOMRect, canvasWidth: number, canvasHeight: number, cover: boolean) {
    const scale = (cover ? Math.max : Math.min)(bounds.width / canvasWidth, bounds.height / canvasHeight);
    const screenX = (clientX - bounds.left - (bounds.width - canvasWidth * scale) / 2) / scale;
    const screenY = (clientY - bounds.top - (bounds.height - canvasHeight * scale) / 2) / scale;
    const view = this.imageView(canvasWidth, canvasHeight);
    const imageX = view.x + (screenX - view.padX) / view.scale;
    const imageY = view.y + (screenY - view.padY) / view.scale;
    if (screenX < view.padX || screenY < view.padY || screenX > canvasWidth - view.padX || screenY > canvasHeight - view.padY) return;
    const registration = rainyAlleyRegistration;
    const field = this.gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const target = {x: (imageX - registration.tx) / registration.sx, y: (imageY - registration.ty) / registration.sy};
    let route = findPath(field, this.position, target, 8);
    if (!route.length) {
      const crossesDown = this.position.y < SQUEEZE_BOUNDS.top && target.y > SQUEEZE_BOUNDS.bottom;
      const crossesUp = this.position.y > SQUEEZE_BOUNDS.bottom && target.y < SQUEEZE_BOUNDS.top;
      if (crossesDown || crossesUp) {
        const entrance = {x: SQUEEZE_CENTER_X, y: crossesDown ? SQUEEZE_BOUNDS.top - 8 : SQUEEZE_BOUNDS.bottom + 8};
        route = findPath(field, this.position, entrance, 8);
      }
    }
    this.path = route.slice(1);
    this.destination = route.length ? route[route.length - 1] : null;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number, flags: readonly string[], debugState: DebugState) {
    context.save();
    context.imageSmoothingEnabled = true;
    context.fillStyle = '#061525'; context.fillRect(0, 0, width, height);
    const view = this.imageView(width, height);
    context.translate(view.padX, view.padY);
    context.scale(view.scale, view.scale);
    context.translate(-view.x, -view.y);
    this.drawBackground(context);
    const registration = rainyAlleyRegistration;
    context.translate(registration.tx, registration.ty);
    context.scale(registration.sx, registration.sy);
    this.drawSqueezeOverlay(context);
    this.drawMarkers(context, flags);
    context.save();
    context.translate(this.position.x, this.position.y);
    if (this.squeezeTargetY !== null) context.scale(.7, 1.04);
    if (this.climbTime > 0) {
      const westClimb = this.climbCrateId === 'west';
      const lift = Math.sin(Math.PI * (1 - this.climbTime / CLIMB_DURATION)) * (westClimb ? 12 : 5);
      context.translate(0, -lift); context.scale(westClimb ? .9 : .94, westClimb ? 1.16 : 1.12);
    }
    context.scale(.62, .62);
    context.translate(-26, -32);
    context.scale(.85, .85);
    drawPixelCat(context, 'miaomiao');
    context.restore();
    if (this.debug) this.drawDebug(context, flags, debugState);
    context.restore();
  }

  private updateNearby(flags: readonly string[]) {
    const radius = rainyAlleySource.objects.interactionRadius;
    this.nearby = rainyAlleySource.objects.fixed
      .filter(object => rainyAlleyObjectEligible(object, flags))
      .map(object => ({object, distance: Math.hypot(this.position.x - object.x, this.position.y - object.y)}))
      .filter(candidate => candidate.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0]?.object ?? null;
  }

  private updateZones(_flags: readonly string[], onZoneEntry: (zoneId: string) => Promise<boolean>) {
    const next = new Set<string>();
    for (const zone of rainyAlleySource.objects.zones) {
      if (Math.hypot(this.position.x - zone.x, this.position.y - zone.y) > zone.r) continue;
      next.add(zone.id);
      if (!this.zonesInside.has(zone.id) && !this.zoneChecksInFlight.has(zone.id)) {
        this.lastZoneAttempt = zone.id;
        this.zoneChecksInFlight.add(zone.id); this.zoneCheckStatus.set(zone.id, 'checking');
        void onZoneEntry(zone.id).then(accepted => {
          this.zoneCheckStatus.set(zone.id, accepted ? 'accepted' : 'failed');
        }).finally(() => this.zoneChecksInFlight.delete(zone.id));
      }
    }
    this.zonesInside = next;
  }

  private followCamera(deltaSeconds: number) {
    const maxX = Math.max(0, rainyAlleyRegistration.worldWidth - cameraSize.width);
    const maxY = Math.max(0, rainyAlleyRegistration.worldHeight - cameraSize.height);
    const targetX = Math.min(maxX, Math.max(0, this.position.x - cameraSize.width / 2));
    const targetY = Math.min(maxY, Math.max(0, this.position.y - cameraSize.height / 2));
    const amount = 1 - Math.exp(-deltaSeconds * 9);
    this.camera.x += (targetX - this.camera.x) * amount;
    this.camera.y += (targetY - this.camera.y) * amount;
  }

  private squeezeDirection(): -1 | 0 | 1 {
    if (Math.abs(this.position.x - SQUEEZE_CENTER_X) > 10) return 0;
    if (this.position.y >= SQUEEZE_BOUNDS.top - 18 && this.position.y <= SQUEEZE_BOUNDS.top) return 1;
    if (this.position.y >= SQUEEZE_BOUNDS.bottom && this.position.y <= SQUEEZE_BOUNDS.bottom + 18) return -1;
    return 0;
  }

  private drawBackground(context: CanvasRenderingContext2D) {
    if (!this.background.complete) return;
    const registration = rainyAlleyRegistration;
    context.drawImage(this.background, 0, 0, registration.artWidth, registration.artHeight);
  }

  private imageView(width: number, height: number) {
    const registration = rainyAlleyRegistration;
    const viewWidth = registration.sx * cameraSize.width;
    const viewHeight = registration.sy * cameraSize.height;
    const scale = Math.min(width / viewWidth, height / viewHeight);
    return {
      x: registration.tx + registration.sx * this.camera.x,
      y: registration.ty + registration.sy * this.camera.y,
      scale,
      padX: (width - viewWidth * scale) / 2,
      padY: (height - viewHeight * scale) / 2
    };
  }

  private drawMarkers(context: CanvasRenderingContext2D, flags: readonly string[]) {
    const completed = (object: RainyFixedObject) =>
      (object.id === 'alley_fish_dry' && flags.includes('alley_fish_collected')) ||
      (object.id === 'alley_crate' && flags.includes('alley_rescued')) ||
      (object.id === 'alley_poster' && flags.includes('lost_poster_found')) ||
      (object.id === 'alley_blanket_stack' && ['blanket_secured', 'blanket_half', 'blanket_lost'].some(flag => flags.includes(flag)));
    const style = {
      inspection: {fill: '#9cdacc', icon: '?'}, node_event: {fill: '#e8ae88', icon: '★'},
      pickup_proposed: {fill: '#edc979', icon: '◆'}, story: {fill: '#eea8d1', icon: '▣'}
    } as const;
    for (const object of rainyAlleySource.objects.fixed) {
      const marker = style[object.kind];
      context.save();
      context.globalAlpha = completed(object) || !rainyAlleyObjectEligible(object, flags) ? .42 : 1;
      context.translate(object.x, object.y);
      const isObjective = (object.id === 'alley_crate' && !flags.includes('alley_rescued')) ||
        (object.id === 'alley_poster' && flags.includes('alley_rescued') && !flags.includes('lost_poster_found'));
      if (isObjective) {
        context.beginPath(); context.arc(0, 0, 15, 0, Math.PI * 2);
        context.fillStyle = '#f8eac087'; context.fill();
      }
      context.beginPath(); context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fillStyle = marker.fill; context.fill(); context.strokeStyle = '#153438'; context.lineWidth = 2.5; context.stroke();
      context.fillStyle = '#163337'; context.font = 'bold 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(marker.icon, 0, 1);
      context.font = '12px system-ui, sans-serif'; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
      context.lineWidth = 4; context.lineJoin = 'round'; context.strokeStyle = '#142e37'; context.fillStyle = '#f4e8c2';
      context.strokeText(object.label, 14, -12); context.fillText(object.label, 14, -12);
      context.restore();
    }
  }

  private drawSqueezeOverlay(context: CanvasRenderingContext2D) {
    const sideWidth = (SQUEEZE_BOUNDS.right - SQUEEZE_BOUNDS.left - SQUEEZE_OPENING_WIDTH) / 2;
    context.save(); context.fillStyle = '#243c42dd'; context.strokeStyle = '#95aaa4'; context.lineWidth = 1.5;
    context.fillRect(SQUEEZE_BOUNDS.left, SQUEEZE_BOUNDS.top, sideWidth, SQUEEZE_BOUNDS.bottom - SQUEEZE_BOUNDS.top);
    context.strokeRect(SQUEEZE_BOUNDS.left, SQUEEZE_BOUNDS.top, sideWidth, SQUEEZE_BOUNDS.bottom - SQUEEZE_BOUNDS.top);
    context.fillRect(SQUEEZE_BOUNDS.right - sideWidth, SQUEEZE_BOUNDS.top, sideWidth, SQUEEZE_BOUNDS.bottom - SQUEEZE_BOUNDS.top);
    context.strokeRect(SQUEEZE_BOUNDS.right - sideWidth, SQUEEZE_BOUNDS.top, sideWidth, SQUEEZE_BOUNDS.bottom - SQUEEZE_BOUNDS.top);
    context.restore();
  }

  private drawDebug(context: CanvasRenderingContext2D, _flags: readonly string[], debugState: DebugState) {
    const geometry = this.gateOpen ? rainyAlleyGeometryOpen : rainyAlleyGeometryClosed;
    context.lineWidth = 1.5;
    for (const polygon of geometry.walkable) {
      context.beginPath(); polygonPath(context, polygon); context.strokeStyle = '#00ff73'; context.stroke();
    }
    for (const polygon of geometry.solid) {
      context.beginPath(); polygonPath(context, polygon); context.fillStyle = '#ff174444'; context.fill(); context.strokeStyle = '#ff3d5a'; context.stroke();
    }
    for (const zone of rainyAlleySource.objects.zones) {
      const eligible = debugState.randomEligible !== false;
      const inside = this.zonesInside.has(zone.id);
      context.beginPath(); context.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
      context.fillStyle = eligible ? '#9c7bd033' : '#6f778033'; context.fill();
      context.strokeStyle = eligible ? '#d0a7fa' : '#9ba5ad'; context.setLineDash([6, 5]); context.stroke(); context.setLineDash([]);
      const status = !eligible ? 'no eligible cards' : inside ? 'inside · roll on re-entry' : 'eligible';
      context.font = '10px system-ui, sans-serif'; context.lineWidth = 3; context.strokeStyle = '#122b31'; context.fillStyle = '#f1d9ff';
      context.strokeText(`${zone.id.replace('rainy_random_', '')} · ${status}`, zone.x + zone.r + 5, zone.y - 5);
      context.fillText(`${zone.id.replace('rainy_random_', '')} · ${status}`, zone.x + zone.r + 5, zone.y - 5);
    }
    const currentZone = rainyAlleySource.objects.zones.find(zone => this.zonesInside.has(zone.id));
    const latestStatus = this.lastZoneAttempt ? this.zoneCheckStatus.get(this.lastZoneAttempt) ?? 'none' : 'none';
    const debugX = this.camera.x + 8, debugY = this.camera.y + 16;
    context.font = '10px ui-monospace, monospace'; context.lineWidth = 3; context.strokeStyle = '#10252b'; context.fillStyle = '#f5e7ba';
    const lines = [`x ${this.position.x.toFixed(1)} · y ${this.position.y.toFixed(1)}`, `zone ${currentZone?.id ?? 'none'}`, `latest ${this.lastZoneAttempt ?? 'none'} · ${latestStatus}`, `phase ${debugState.phase} · event ${debugState.eventId || 'none'}`];
    lines.forEach((line, index) => {context.strokeText(line, debugX, debugY + index * 13); context.fillText(line, debugX, debugY + index * 13);});
    if (this.destination) {
      context.beginPath(); context.moveTo(this.position.x, this.position.y); this.path.forEach(point => context.lineTo(point.x, point.y));
      context.strokeStyle = '#ffe066'; context.stroke();
    }
    context.beginPath(); context.arc(this.position.x, this.position.y, rainyAlleySource.geometry.player_test_radius_graybox_pixels, 0, Math.PI * 2);
    context.strokeStyle = '#fff'; context.stroke();
  }
}
