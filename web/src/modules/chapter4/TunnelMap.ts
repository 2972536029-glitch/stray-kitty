import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import mapData from '../../../../level_design/chapter4/data/chapter4.map.json';
import lighting from '../../../../level_design/chapter4/data/chapter4.lighting.json';
import l0Url from '../../../../level_design/chapter4/art/chapter4_L0_approved.png?url';
import lm1Url from '../../../../level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png?url';
import l0MaskUrl from '../../../../level_design/chapter4/collision/chapter4_L0_walkable.png?url';
import lm1MaskUrl from '../../../../level_design/chapter4/collision/chapter4_Lminus1_walkable.png?url';
import {TunnelWalkableMask} from './TunnelWalkableMask';

type Layer = 'L0' | 'Lm1';
type Point = {x: number; y: number};
type Connector = (typeof mapData.portals)[number];
const WIDTH = mapData.world.width, HEIGHT = mapData.world.height, RADIUS = mapData.world.catRadiusFromPreview;
const layers: Layer[] = ['L0', 'Lm1'];
const backgrounds: Record<Layer, string> = {L0: l0Url, Lm1: lm1Url};
const masks: Record<Layer, string> = {L0: l0MaskUrl, Lm1: lm1MaskUrl};
const camera = {width: 1066, height: 640};
const speed = 142;

function loadImage(url: string) {
  const image = new Image(); image.src = url; return image;
}

function imageMask(image: HTMLImageElement) {
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Unable to read Chapter 4 collision mask');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4];
  return new TunnelWalkableMask(canvas.width, canvas.height, pixels, RADIUS);
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
  private readonly art: Record<Layer, HTMLImageElement> = {L0: loadImage(backgrounds.L0), Lm1: loadImage(backgrounds.Lm1)};
  private readonly maskImages: Record<Layer, HTMLImageElement> = {L0: loadImage(masks.L0), Lm1: loadImage(masks.Lm1)};
  private readonly maskReady: Promise<Record<Layer, TunnelWalkableMask>>;
  private masks: Record<Layer, TunnelWalkableMask> | null = null;
  private position: Point = {x: 845, y: 135};
  private floor: Layer = 'L0';
  private cameraPosition: Point = {x: 0, y: 0};
  private labelsVisible = true;
  private collisionVisible = false;
  private nearby: {id: string; label: string} | null = null;
  private movement: {from: Point; to: Point; elapsed: number; duration: number} | null = null;
  private zonesInside = new Set<string>();
  private debugTrace = '';

  constructor() {
    this.maskReady = Promise.all(layers.map(async floor => {
      const image = this.maskImages[floor];
      if (!image.complete) await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error(`Unable to load ${floor} collision mask`));});
      if (image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT) throw new Error(`Chapter 4 ${floor} collision dimensions mismatch`);
      return [floor, imageMask(image)] as const;
    })).then(entries => {
      const result = Object.fromEntries(entries) as Record<Layer, TunnelWalkableMask>;
      this.masks = result;
      this.position = reachableSpawn(result.L0, this.position);
      for (const portal of mapData.portals) for (const endpoint of [portal.a, portal.b]) {
        if (!result[endpoint.layer as Layer].isWalkable(endpoint)) throw new Error(`Invalid ${portal.key} landing ${portal.id} at ${endpoint.layer} (${endpoint.x},${endpoint.y})`);
      }
      return result;
    });
    this.updateCamera(0);
  }

  get layer() {return this.floor;}
  get isReady() {return !!this.masks;}
  get hint() {return this.movement ? null : this.nearby?.label ?? this.debugTrace;}
  get nearTarget() {return this.nearby;}
  positionNow() {return {...this.position};}
  setCollisionVisible(value: boolean) {this.collisionVisible = value;}
  toggleLabels() {this.labelsVisible = !this.labelsVisible;}
  toggleCollision() {this.collisionVisible = !this.collisionVisible;}
  reset() {
    if (this.masks) this.position = reachableSpawn(this.masks.L0, {x: 845, y: 135});
    this.floor = 'L0'; this.movement = null; this.nearby = null; this.zonesInside.clear(); this.updateCamera(0);
  }
  async ready() {await this.maskReady;}

  update(deltaMs: number, dx: number, dy: number, flags: readonly string[], onRandomZone: (zone: string) => Promise<boolean>, interact: (id: string) => void) {
    if (!this.masks) return;
    if (this.movement) {
      this.movement.elapsed = Math.min(this.movement.duration, this.movement.elapsed + deltaMs);
      const t = this.movement.elapsed / this.movement.duration, eased = t * t * (3 - 2 * t);
      this.position = {x: this.movement.from.x + (this.movement.to.x - this.movement.from.x) * eased, y: this.movement.from.y + (this.movement.to.y - this.movement.from.y) * eased};
      if (t >= 1) {this.position = {...this.movement.to}; this.movement = null;}
    } else if (dx || dy) {
      const length = Math.hypot(dx, dy);
      const result = this.masks[this.floor].move(this.position, {x: dx / length * speed * deltaMs / 1000, y: dy / length * speed * deltaMs / 1000});
      this.position = result.position;
      this.debugTrace = result.blockedX || result.blockedY ? `Blocked by ${this.floor} walkable mask: ${result.blockedX ? 'X ' : ''}${result.blockedY ? 'Y' : ''}` : '';
    } else this.debugTrace = '';
    this.updateNearby(flags);
    this.updateCamera(deltaMs);
    const zone = mapData.events.find(event => event.type === 'random_zone' && event.layer === this.floor && event.id !== 'tunnel_random_lower' && Math.hypot(this.position.x - event.x, this.position.y - event.y) <= ((event as {radius?: number}).radius ?? 28));
    if (zone && !this.zonesInside.has(zone.id) && !this.movement) {
      this.zonesInside.add(zone.id);
      if (flags.includes('tunnel_false_kitten_trap_found') || this.floor !== 'L0') void onRandomZone(zone.id);
    }
    if (this.movement) return;
    if (this.keys.has('e')) {this.keys.delete('e'); if (this.nearby) interact(this.nearby.id);}
    if (flags.includes('tunnel_false_kitten_trap_found') && flags.includes('valve_three_investigated') && this.floor === 'L0' && this.position.x >= 1475 && this.position.x <= 1602 && this.position.y >= 721 && this.position.y <= 798) {
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
    if (key === 'f' && !flags.includes('tunnel_false_kitten_trap_found')) return false;
    const portal = mapData.portals.find(p => p.key.toLowerCase() === key && p.a.layer === this.floor && Math.hypot(this.position.x - p.a.x, this.position.y - p.a.y) <= p.reach)
      ?? mapData.portals.find(p => p.key.toLowerCase() === key && p.bidirectional && p.b.layer === this.floor && Math.hypot(this.position.x - p.b.x, this.position.y - p.b.y) <= p.reach);
    if (!portal) return false;
    const from = portal.a.layer === this.floor ? portal.a : portal.b;
    const to = from === portal.a ? portal.b : portal.a;
    if (key === 'f' && this.floor !== 'L0' && !this.positionNear(portal, from)) return false;
    if (!this.masks[to.layer as Layer].isWalkable(to)) return false;
    const crossFloor = from.layer !== to.layer;
    const landing = {x: to.x, y: to.y};
    this.movement = {from: crossFloor ? landing : {...this.position}, to: landing, elapsed: 0, duration: key === ' ' ? 520 : key === 'c' ? 640 : 420};
    if (crossFloor) {this.floor = to.layer as Layer; this.position = {...landing}; this.zonesInside.clear();}
    this.nearby = null; this.updateCamera(0); return true;
  }
  private positionNear(portal: Connector, point: Point) {return Math.hypot(this.position.x - point.x, this.position.y - point.y) <= portal.reach;}
  private updateNearby(flags: readonly string[]) {
    const candidates = mapData.events.filter(event => event.layer === this.floor && ['story_mandatory', 'fixed_optional'].includes(event.type));
    const found = candidates.map(event => ({event, distance: Math.hypot(this.position.x - event.x, this.position.y - event.y)})).filter(x => x.distance <= 56).sort((a,b) => a.distance-b.distance)[0];
    if (!found) {this.nearby = null; return;}
    if (found.event.id === 'tunnel_valve_three' && !flags.includes('tunnel_false_kitten_trap_found')) {this.nearby = null; return;}
    if (found.event.id === 'tunnel_false_kitten_trap' && flags.includes('tunnel_false_kitten_trap_found')) {this.nearby = null; return;}
    if (found.event.eventId) this.nearby = {id: found.event.id, label: `${found.event.label} · E`};
    else if (found.event.id === 'tunnel_false_kitten_trap') this.nearby = {id: found.event.id, label: `${found.event.label} · E`};
    else this.nearby = null;
  }
  private updateCamera(deltaMs: number) {
    const target = {x: Math.max(0, Math.min(WIDTH - camera.width, this.position.x - camera.width / 2)), y: Math.max(0, Math.min(HEIGHT - camera.height, this.position.y - camera.height / 2))};
    const blend = deltaMs <= 0 ? 1 : Math.min(1, deltaMs / 140);
    this.cameraPosition.x += (target.x - this.cameraPosition.x) * blend; this.cameraPosition.y += (target.y - this.cameraPosition.y) * blend;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number, _flags: readonly string[]) {
    context.save(); context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#100f14'; context.fillRect(0, 0, width, height);
    const scale = Math.min(width / camera.width, height / camera.height);
    const offsetX = (width - camera.width * scale) / 2, offsetY = (height - camera.height * scale) / 2;
    context.translate(offsetX, offsetY); context.scale(scale, scale); context.translate(-this.cameraPosition.x, -this.cameraPosition.y);
    const art = this.art[this.floor]; if (art.complete && art.naturalWidth) context.drawImage(art, 0, 0, WIDTH, HEIGHT);
    if (this.collisionVisible) {context.save(); context.globalAlpha = .45; context.drawImage(this.maskImages[this.floor], 0, 0); context.restore();}
    this.drawLighting(context);
    this.drawMarkers(context);
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
  private drawMarkers(context: CanvasRenderingContext2D) {
    const inView = (point: Point, halfWidth = 56, top = 36, bottom = 8) => point.x - halfWidth >= this.cameraPosition.x && point.x + halfWidth <= this.cameraPosition.x + camera.width && point.y - top >= this.cameraPosition.y && point.y + bottom <= this.cameraPosition.y + camera.height;
    const portals = mapData.portals.filter(portal => [portal.a, portal.b].some(point => point.layer === this.floor && inView(point)));
    const events = mapData.events.filter(event => event.layer === this.floor && inView(event));
    if (this.labelsVisible) {
      for (const event of events) {
        if (event.type === 'random_zone') {
          const radius = (event as {radius?: number}).radius ?? 28;
          context.save(); context.strokeStyle = 'rgba(235,211,150,.34)'; context.setLineDash([8,8]); context.beginPath(); context.arc(event.x,event.y,radius,0,Math.PI*2); context.stroke(); context.restore();
        }
        if (event.type === 'story_mandatory' || event.type === 'fixed_optional' || event.type === 'entry' || event.type === 'battle_exit' || event.type === 'random_zone') {
          context.font = 'bold 18px "Microsoft YaHei", "PingFang SC", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'bottom';
          const label = event.label;
          const w = context.measureText(label).width + 18;
          if (!inView({x:event.x,y:event.y}, w / 2, 38, -10)) continue;
          context.save();
          context.fillStyle = 'rgba(12,13,17,.82)'; context.fillRect(event.x-w/2,event.y-38,w,28);
          context.fillStyle = '#f3e4b6'; context.fillText(label,event.x,event.y-18);
          context.restore();
        }
      }
      for (const portal of portals) {
        const point = portal.a.layer === this.floor ? portal.a : portal.b;
        context.save(); context.fillStyle = '#f7edcf'; context.font = 'bold 16px sans-serif'; context.textAlign='center';
        const width = context.measureText(portal.label).width + 18;
        if (!inView(point, width / 2, 30, -6)) {context.restore(); continue;}
        context.fillStyle = 'rgba(19,24,27,.85)'; context.fillRect(point.x-width/2,point.y-30,width,24);
        context.fillStyle = '#f7edcf'; context.fillText(portal.label,point.x,point.y-12); context.restore();
      }
    }
    context.save(); context.fillStyle = 'rgba(20,22,24,.8)'; context.fillRect(this.cameraPosition.x+12,this.cameraPosition.y+12,105,30);
    context.fillStyle = '#f6e9c5'; context.font='bold 18px sans-serif'; context.textAlign='left'; context.fillText(this.floor === 'L0' ? 'L0 · 主暗渠' : 'L−1 · 下层排水道',this.cameraPosition.x+22,this.cameraPosition.y+33); context.restore();
  }
  private drawCat(context: CanvasRenderingContext2D) {
    context.save(); context.translate(this.position.x,this.position.y);
    if (this.movement) {const t=this.movement.elapsed/this.movement.duration; const lift=this.movement.duration>500?Math.sin(t*Math.PI)*18:0; context.translate(0,-lift);}
    drawPixelCat(context,'miaomiao'); context.restore();
  }
}
