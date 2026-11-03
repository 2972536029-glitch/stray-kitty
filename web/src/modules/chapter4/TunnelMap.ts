import {TunnelEventMarkers,nearbyLockedTunnelEvent,type TunnelMarkerState} from './eventMarkers';
import {drawTunnelExitBarrier,tunnelBossAt,tunnelExitBlockerPolygon} from './battleExit';
import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import mapData from '../../../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };
import lighting from '../../../../level_design/chapter4/data/chapter4.lighting.json' with { type: 'json' };
import {chapterBackground, preloadChapterArtwork} from '../map/artwork';
import l0MaskUrl from '../../../../level_design/chapter4/collision/chapter4_L0_walkable.png?url';
import lm1MaskUrl from '../../../../level_design/chapter4/collision/chapter4_Lminus1_walkable.png?url';
import {TunnelWalkableMask} from './TunnelWalkableMask';
import {tunnelConnections, tunnelEventCompleted, tunnelPortalDisplay} from './navigation';
import {raisedRidgeMask, raisedSurfacePolygons, tunnelClimbSurface, tunnelGroundMask, tunnelSurfaceConnections, tunnelSurfaces, type TunnelSurface} from './surfaces';

type Layer = 'L0' | 'Lm1';
type Point = {x: number; y: number};
const WIDTH = mapData.world.width, HEIGHT = mapData.world.height, RADIUS = mapData.world.catRadiusFromPreview;
const layers: Layer[] = ['L0', 'Lm1'];
const masks: Record<Layer, string> = {L0: l0MaskUrl, Lm1: lm1MaskUrl};
const camera = {width: 1066, height: 640};
const speed = 142;

function loadImage(url: string) {
  const image = new Image(); image.src = url; return image;
}

function imageMask(image: HTMLImageElement, floor: Layer) {
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Unable to read Chapter 4 collision mask');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4];
  return tunnelGroundMask(floor, canvas.width, canvas.height, pixels, RADIUS);
}

function reachableSpawn(mask: TunnelWalkableMask, point: Point) {
  if (mask.isWalkable(point)) return point;
  for (let r = 4; r < 100; r += 4) for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    const candidate = {x: point.x + Math.cos(a) * r, y: point.y + Math.sin(a) * r};
    if (mask.isWalkable(candidate)) return candidate;
  }
  throw new Error(`Chapter 4 spawn/landing is outside the walkable mask (${point.x},${point.y})`);
}

export class TunnelMap {
  private readonly maskImages: Record<Layer, HTMLImageElement> = {L0: loadImage(masks.L0), Lm1: loadImage(masks.Lm1)};
  private readonly maskReady: Promise<Record<Layer, TunnelWalkableMask>>;
  private masks: Record<Layer, TunnelWalkableMask> | null = null;
  private readonly raisedMasks = {'tank-ridge': raisedRidgeMask('tank-ridge', WIDTH, HEIGHT), 'south-ridge': raisedRidgeMask('south-ridge', WIDTH, HEIGHT), 'west-ridge': raisedRidgeMask('west-ridge', WIDTH, HEIGHT)};
  private surface: TunnelSurface = 'ground';
  private position: Point = {x: 845, y: 135};
  private floor: Layer = 'L0';
  private cameraPosition: Point = {x: 0, y: 0};
  private labelsVisible = true;
  private collisionVisible = false;
  private readonly eventMarkers = new TunnelEventMarkers();
  private eventHint: string | null = null;
  private nearby: {id: string; label: string} | null = null;
  private traversalHint: string | null = null;
  private traversalFeedback: string | null = null;
  private traversalFeedbackMs = 0;
  private movement: {from: Point; to: Point; elapsed: number; duration: number} | null = null;
  private zonesInside = new Set<string>();

  constructor() {
    preloadChapterArtwork('tunnel');
    this.maskReady = Promise.all(layers.map(async floor => {
      const image = this.maskImages[floor];
      if (!image.complete) await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error(`Unable to load ${floor} collision mask`));});
      if (image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT) throw new Error(`Chapter 4 ${floor} collision dimensions mismatch`);
      return [floor, imageMask(image, floor)] as const;
    })).then(entries => {
      const result = Object.fromEntries(entries) as Record<Layer, TunnelWalkableMask>;
      this.masks = result;
      this.position = reachableSpawn(result.L0, this.position);
      for (const portal of mapData.portals) for (const endpoint of [portal.a, portal.b]) {
        const raised = tunnelClimbSurface(portal.id);
        const mask = raised && endpoint === portal.b ? this.raisedMasks[raised] : result[endpoint.layer as Layer];
        if (!mask.isWalkable(endpoint)) throw new Error(`Invalid ${portal.key} landing ${portal.id} at ${endpoint.layer} (${endpoint.x},${endpoint.y})`);
      }
      return result;
    });
    this.updateCamera(0);
  }

  get layer() {return this.floor;}
  get isReady() {return !!this.masks;}
  get hint() {return this.movement ? null : this.nearby?.label ?? this.eventHint ?? this.traversalFeedback ?? this.traversalHint;}
  get nearTarget() {return this.nearby;}
  positionNow() {return {...this.position};}
  setCollisionVisible(value: boolean) {this.collisionVisible = value;}
  toggleLabels() {this.labelsVisible = !this.labelsVisible;}
  toggleCollision() {this.collisionVisible = !this.collisionVisible;}
  reset() {
    this.eventMarkers.reset(); this.eventHint = null;
    this.traversalFeedback = null; this.traversalFeedbackMs = 0;
    if (this.masks) this.position = reachableSpawn(this.masks.L0, {x: 845, y: 135});
    this.floor = 'L0'; this.surface = 'ground'; this.movement = null; this.nearby = null; this.traversalHint = null; this.keys.clear(); this.zonesInside.clear(); this.updateCamera(0);
  }
  async ready() {await this.maskReady;}

  update(deltaMs: number, dx: number, dy: number, flags: readonly string[], onRandomZone: (zone: string) => Promise<boolean>, interact: (id: string) => void, drawnEvents: readonly string[] = []) {
    if (!this.masks) return;
    this.traversalFeedbackMs = Math.max(0, this.traversalFeedbackMs - deltaMs);
    if (!this.traversalFeedbackMs) this.traversalFeedback = null;
    if (this.movement) {
      this.movement.elapsed = Math.min(this.movement.duration, this.movement.elapsed + deltaMs);
      const t = this.movement.elapsed / this.movement.duration, eased = t * t * (3 - 2 * t);
      this.position = {x: this.movement.from.x + (this.movement.to.x - this.movement.from.x) * eased, y: this.movement.from.y + (this.movement.to.y - this.movement.from.y) * eased};
      if (t >= 1) {this.position = {...this.movement.to}; this.movement = null;}
    } else if (dx || dy) {
      const length = Math.hypot(dx, dy);
      const mask = this.surface !== 'ground' ? this.raisedMasks[this.surface] : this.masks[this.floor];
      const result = mask.move(this.position, {x: dx / length * speed * deltaMs / 1000, y: dy / length * speed * deltaMs / 1000});
      this.position = result.position;
    }
    this.updateNearby(flags, drawnEvents);
    this.updateCamera(deltaMs);
    const zone = this.surface === 'ground' && mapData.events.find(event => event.type === 'random_zone' && event.layer === this.floor && event.id !== 'tunnel_random_lower' && Math.hypot(this.position.x - event.x, this.position.y - event.y) <= ((event as {radius?: number}).radius ?? 28));
    if (zone && !this.zonesInside.has(zone.id) && !this.movement) {
      this.zonesInside.add(zone.id);
      if (flags.includes('tunnel_false_kitten_trap_found') || this.floor !== 'L0') void onRandomZone(zone.id);
    }
    if (this.movement) return;
    if (this.keys.has('e')) {this.keys.delete('e'); if (this.nearby) interact(this.nearby.id);}
    if (tunnelBossAt(this.floor, this.surface, this.position, flags)) {
      if (!this.bossRequested) {this.bossRequested = true; interact('tunnel_exit_boss');}
    } else this.bossRequested = false;
  }

  private keys = new Set<string>();
  private bossRequested = false;
  keyDown(key: string, development = false) {
    if (key === 'm') {this.toggleLabels(); return true;}
    if (key === 'v' && development) {this.toggleCollision(); return true;}
    this.keys.add(key); return false;
  }
  keyUp(key: string) {this.keys.delete(key);}
  interactKeyPressed() {return this.keys.has('e');}
  traverse(key: 'f' | 'c' | ' ', flags: readonly string[]) {
    if (!this.masks || this.movement) return false;
    const feedback = (text: string) => {this.traversalFeedback = text; this.traversalFeedbackMs = 3500; return false;};
    if (key === 'f' && !flags.includes('tunnel_false_kitten_trap_found')) return feedback('先调查假猫叫诱饵，再靠近木梯按 F');
    const authoredKey = key === ' ' ? 'space' : key;
    const connection = this.connections().find(value => value.portal.key.toLowerCase() === authoredKey && value.distance <= value.portal.reach);
    if (!connection) return feedback(key === 'f' ? '靠近木梯后按 F；石脊上请先按 C 回到地面' : key === 'c' ? '靠近石脊端点的 C 标记' : '靠近水沟两岸的 Space 标记');
    const {from, to} = connection;
    const nextSurface = to === connection.portal.b ? tunnelClimbSurface(connection.portal.id) ?? 'ground' : 'ground';
    const landingMask = nextSurface !== 'ground' ? this.raisedMasks[nextSurface] : this.masks[to.layer as Layer];
    if (!landingMask.isWalkable(to)) return false;
    this.traversalFeedback = null; this.traversalFeedbackMs = 0;
    const crossFloor = from.layer !== to.layer;
    const landing = {x: to.x, y: to.y};
    this.movement = {from: crossFloor ? landing : {...this.position}, to: landing, elapsed: 0, duration: key === ' ' ? 520 : key === 'c' ? 640 : 420};
    this.surface = nextSurface;
    if (crossFloor) {this.floor = to.layer as Layer; this.position = {...landing}; this.zonesInside.clear();}
    this.nearby = null; this.updateCamera(0); return true;
  }
  private connections() {return tunnelSurfaceConnections(this.floor, this.surface, tunnelConnections(this.floor, this.position));}
  private markerState(flags: readonly string[], drawnEvents: readonly string[]): TunnelMarkerState {
    return {floor:this.floor,surface:this.surface,position:this.position,flags,drawnEvents,nearTarget:this.nearby,connections:this.connections()};
  }
  private updateNearby(flags: readonly string[], drawnEvents: readonly string[]) {
    this.eventHint = nearbyLockedTunnelEvent(this.markerState(flags, drawnEvents)) ? '先调查假猫叫诱饵与绊线，再调查第三泄洪阀' : null;
    const connection = this.connections()[0];
    this.traversalHint = connection && connection.distance <= connection.portal.reach ? tunnelPortalDisplay(connection, flags).label : null;
    if (this.surface !== 'ground') {this.nearby = null; return;}
    const candidates = mapData.events.filter(event => event.layer === this.floor && ['story_mandatory', 'fixed_optional'].includes(event.type)
      && !tunnelEventCompleted(event, flags, drawnEvents)
      && (event.id !== 'tunnel_valve_three' || flags.includes('tunnel_false_kitten_trap_found')));
    const found = candidates.map(event => ({event, distance: Math.hypot(this.position.x - event.x, this.position.y - event.y)})).filter(x => x.distance <= 56).sort((a,b) => a.distance-b.distance)[0];
    if (!found) {this.nearby = null; return;}
    if (found.event.eventId) this.nearby = {id: found.event.id, label: `${found.event.label} · E`};
    else if (found.event.id === 'tunnel_false_kitten_trap') this.nearby = {id: found.event.id, label: `${found.event.label} · E`};
    else this.nearby = null;
  }
  private updateCamera(deltaMs: number) {
    const target = {x: Math.max(0, Math.min(WIDTH - camera.width, this.position.x - camera.width / 2)), y: Math.max(0, Math.min(HEIGHT - camera.height, this.position.y - camera.height / 2))};
    const blend = deltaMs <= 0 ? 1 : Math.min(1, deltaMs / 140);
    this.cameraPosition.x += (target.x - this.cameraPosition.x) * blend; this.cameraPosition.y += (target.y - this.cameraPosition.y) * blend;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number, flags: readonly string[], drawnEvents: readonly string[] = []) {
    context.save(); context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#100f14'; context.fillRect(0, 0, width, height);
    const scale = Math.min(width / camera.width, height / camera.height);
    const offsetX = (width - camera.width * scale) / 2, offsetY = (height - camera.height * scale) / 2;
    context.translate(offsetX, offsetY); context.scale(scale, scale); context.translate(-this.cameraPosition.x, -this.cameraPosition.y);
    const art = chapterBackground('tunnel', this.floor); if (art.complete && art.naturalWidth) context.drawImage(art, 0, 0, WIDTH, HEIGHT);
    if (this.floor === 'L0') drawTunnelExitBarrier(context);
    if (this.collisionVisible) {
      context.save(); context.globalAlpha = .45;
      const paint = (polygon: number[][], color: string) => {
        context.fillStyle = color; context.beginPath();
        polygon.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
        context.closePath(); context.fill();
      };
      if (this.surface !== 'ground') for (const polygon of raisedSurfacePolygons[this.surface]) paint(polygon, '#fff');
      else {
        context.drawImage(this.maskImages[this.floor], 0, 0);
        for (const polygon of tunnelSurfaces[this.floor].blocked) paint(polygon, '#000');
        if (this.floor === 'L0') for (const polygons of Object.values(raisedSurfacePolygons)) for (const polygon of polygons) paint(polygon, '#000');
        for (const polygon of tunnelSurfaces[this.floor].walkable) paint(polygon, '#fff');
        if (this.floor === 'L0') paint(tunnelExitBlockerPolygon, '#000');
      }
      context.restore();
    }
    this.drawLighting(context);
    this.drawMarkers(context, flags, drawnEvents);
    if (this.traversalFeedback && !this.movement && !this.nearby && !this.eventHint) this.drawLabel(context, this.traversalFeedback, this.position, true);
    this.drawCat(context);
    context.restore();
  }
  private drawLighting(context: CanvasRenderingContext2D) {
    const lamps = (lighting.lamps as Record<Layer, Array<{x:number;y:number;radius:number}>>)[this.floor];
    const darkness = context.createRadialGradient(this.position.x, this.position.y, 26, this.position.x, this.position.y, lighting.playerRadius[this.floor]);
    darkness.addColorStop(0, `rgba(3,5,12,0)`); darkness.addColorStop(.55, `rgba(3,5,12,${lighting.baseOpacity[this.floor] * .38})`); darkness.addColorStop(1, `rgba(3,5,12,${lighting.baseOpacity[this.floor]})`);
    context.save(); context.globalCompositeOperation = 'source-over'; context.fillStyle = darkness; context.fillRect(this.cameraPosition.x, this.cameraPosition.y, camera.width, camera.height);
    for (const lamp of lamps) {
      const glow = context.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
      glow.addColorStop(0, 'rgba(255,190,90,.24)'); glow.addColorStop(.5, 'rgba(255,175,75,.1)'); glow.addColorStop(1, 'rgba(255,155,45,0)');
      context.globalCompositeOperation = 'screen'; context.fillStyle = glow; context.beginPath(); context.arc(lamp.x, lamp.y, lamp.radius, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
  private drawMarkers(context: CanvasRenderingContext2D, flags: readonly string[], drawnEvents: readonly string[]) {
    this.eventMarkers.draw(context,this.markerState(flags,drawnEvents),performance.now(),false,this.labelsVisible);
    context.save(); context.fillStyle = 'rgba(16,28,38,.9)'; context.fillRect(this.cameraPosition.x + 12, this.cameraPosition.y + 42, 154, 25);
    context.fillStyle = '#fff0c4'; context.font = '13px "Microsoft YaHei",system-ui,sans-serif'; context.textAlign = 'left'; context.textBaseline = 'middle';
    context.fillText(this.floor === 'L0' ? 'L0 · 主暗渠' : 'L−1 · 下层排水道', this.cameraPosition.x + 20, this.cameraPosition.y + 54.5); context.restore();
  }
  private drawLabel(context: CanvasRenderingContext2D, label: string, point: Point, movement: boolean) {
    context.font = `${movement ? 12 : 13}px "Microsoft YaHei",system-ui,sans-serif`;
    const width = context.measureText(label).width + 12, height = movement ? 20 : 21;
    // Keep readable labels inside the camera, including events at the edge.
    const x = Math.max(this.cameraPosition.x + 4, Math.min(point.x + 15, this.cameraPosition.x + camera.width - width - 4));
    const y = Math.max(this.cameraPosition.y + 40, point.y - 23);
    context.fillStyle = movement ? 'rgba(16,28,38,.92)' : 'rgba(16,28,38,.9)'; context.fillRect(x, y, width, height);
    context.strokeStyle = '#f2e4c4'; context.lineWidth = 1; context.strokeRect(x + .5, y + .5, width - 1, height - 1);
    context.fillStyle = '#fff0c4'; context.textAlign = 'left'; context.textBaseline = 'middle'; context.fillText(label, x + 6, y + height / 2);
  }
  private drawCat(context: CanvasRenderingContext2D) {
    context.save();
    context.fillStyle = 'rgba(10,16,22,.38)'; context.beginPath(); context.ellipse(this.position.x, this.position.y + 3, 9, 3, 0, 0, Math.PI * 2); context.fill();
    context.translate(this.position.x - 16, this.position.y - 30);
    if (this.movement) {const t=this.movement.elapsed/this.movement.duration; const lift=this.movement.duration>500?Math.sin(t*Math.PI)*18:0; context.translate(0,-lift);}
    // Match Chapter 2: the center of the paws is the collision/interaction anchor.
    context.scale(.5, .5); drawPixelCat(context,'miaomiao'); context.restore();
  }
}
