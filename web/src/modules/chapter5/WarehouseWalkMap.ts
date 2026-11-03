import {WarehouseEventMarkers} from './eventMarkers';
import geometry from '../../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with { type: 'json' };
import manifest from '../../../../level_design/chapter5/review/warehouse_L0_asset_placement_manifest.json' with { type: 'json' };
import groundUrl from './assets/warehouse_L0_ground.lossless.webp?url';
import legacyGroundUrl from '../../../../level_design/chapter5/art/warehouse_L0_ground.png?url';
import l1Url from '../../../../level_design/chapter5/art/warehouse_L1_surfaces.png?url';
import l1SideUrl from '../../../../level_design/chapter5/art/warehouse_L1_undersides.png?url';
import l1MaskUrl from '../../../../level_design/chapter5/art/warehouse_L1_walkable_mask.png?url';
import floorMaskUrl from '../../../../level_design/chapter5/art/warehouse_L0_floor_mask.png?url';
import grayboxUrl from '../../../../level_design/chapter5/source/v07/warehouse_L0_graybox_v07.svg?url';
import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import {FollowCamera, cameraFrameFor} from '../../adapters/canvas/camera';
// Reuse the existing swept, circular-footprint raster movement implementation.
import {TunnelWalkableMask as RasterWalkableMask} from '../chapter4/TunnelWalkableMask';
import type {GameState} from '../../contracts';

type Point = {x: number; y: number};
type Floor = 'L0' | 'L1';
export interface WarehouseReviewOptions {collision: boolean; overview: boolean; graybox: boolean}
const {width: W, height: H, catRadius} = geometry.world;
const entry = geometry.interactions.find(point => point.id === 'warehouse_entry')!;
const spriteUrls = import.meta.glob<string>([
  '../../../../level_design/chapter5/art/source/sprites/*.png',
  '../../../../level_design/chapter5/art/variants/*.png',
  '../../../../level_design/chapter5/art/source/stateful/*.png',
], {eager: true, query: '?url', import: 'default'});

// Reuse immutable artwork across scene reentries; masks and gameplay stay per instance.
const decodedImages = new Map<string, Promise<HTMLImageElement>>();
function image(url: string) {
  let cached = decodedImages.get(url);
  if (!cached) {
    const result = new Image(); result.src = url;
    cached = result.decode().then(() => result).catch(error => {decodedImages.delete(url);throw error;});
    decodedImages.set(url, cached);
  }
  return cached;
}

/** Shared warehouse map renderer/movement. Commands and outcomes stay in App/service. */
export class WarehouseWalkMap {
  private readonly eventMarkers=new WarehouseEventMarkers();
  private position: Point = {x: entry.x, y: entry.y};
  private camera = new FollowCamera();
  private mask: RasterWalkableMask | null = null;
  private ground: HTMLImageElement | null = null;
  private l1: HTMLImageElement | null = null;
  private l1Side: HTMLImageElement | null = null;
  private l1Mask: RasterWalkableMask | null = null;
  private basePixels: Uint8Array | null = null;
  private floor: Floor = 'L0';
  private flags = new Set<string>();
  private drawn = new Set<string>();
  private revision = 0;
  private lightPreview: {id:string;lit:boolean;revision:number} | null = null;
  private gateKey = '';
  private climbing: {from: Point; to: Point; floor: Floor; elapsed: number} | null = null;
  private seenZones = new Set<string>();
  private zonePending = false;
  private darkness = document.createElement('canvas');
  private darknessKey = '';
  private graybox: HTMLImageElement | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();
  private facing = 1;
  private walkTime = 0;
  private moving = false;
  private snapCamera = true;
  private options: WarehouseReviewOptions = {collision: false, overview: false, graybox: false};
  private loading: Promise<void>;
  private records = [...manifest.solids].sort((a, b) => a.zOrder - b.zOrder || a.solidId.localeCompare(b.solidId));

  constructor() {this.loading = this.load();}
  async ready() {await this.loading;}
  get isReady() {return !!this.mask && !!this.ground;}
  get layer() {return this.floor;}
  get nearTarget() {
    const targets: Array<{id: string; label: string; key: 'E'|'C'; distance: number}> = [];
    for (const climb of geometry.climbs) {
      const distance = Math.hypot(this.position.x-climb.x,this.position.y-climb.y);
      if (distance<=44) targets.push({id:'warehouse_climb',key:'C',label:this.floor==='L0'?'C · 攀上货架':'C · 回到地面',distance});
    }
    const labels: Record<string,string> = {entry_lamp:this.flags.has('entry_lamp')?'关闭入口灯':'打开入口灯',central_spotlight:this.flags.has('central_spotlight')?'关闭聚光灯':'打开聚光灯',secondary_lamp:this.flags.has('secondary_lamp')?'关闭东侧灯':'打开东侧灯',warehouse_lookout:'调查瞭望位',warehouse_light_crate:'调查灯具箱',finale_boss:'集结伙伴，守住仓库',bunker_exit:'打开隔间，护送伙伴回家'};
    for (const point of geometry.interactions) {
      if (point.floor!==this.floor || point.kind==='start') continue;
      if (point.kind==='fixed_event' && this.drawn.has('node:'+point.id)) continue;
      if (point.id==='finale_boss' && this.flags.has('finale_boss_victory')) continue;
      if (point.id==='bunker_exit' && !this.flags.has('finale_boss_victory')) continue;
      const distance=Math.hypot(this.position.x-point.x,this.position.y-point.y);
      if(distance<=58)targets.push({id:point.id,label:labels[point.id]+' · E',key:'E',distance});
    }
    return this.climbing ? null : targets.sort((a,b)=>a.distance-b.distance)[0] ?? null;
  }
  get hint() {return this.nearTarget?.label ?? null;}
  syncState(state: Pick<GameState,'flags'|'drawnEvents'> & {revision?:number}) {
    if(state.revision!==undefined){
      if(this.lightPreview&&state.revision>this.lightPreview.revision)this.lightPreview=null;
      this.revision=state.revision;
    }
    this.flags=new Set(state.flags); this.drawn=new Set(state.drawnEvents??[]);
    const key=['entry_lamp','secondary_lamp','finale_boss_victory'].map(flag=>Number(this.flags.has(flag))).join('');
    if(key!==this.gateKey&&this.basePixels){this.gateKey=key;this.rebuildGroundMask();}
  }
  previewLight(id:string) {
    if(!geometry.interactions.some(p=>p.id===id&&p.kind==='light'))return;
    this.lightPreview={id,lit:!this.flags.has(id),revision:this.revision};
  }
  cancelLightPreview() {this.lightPreview=null;}
  private lightIsOn(id:string) {return this.lightPreview?.id===id?this.lightPreview.lit:this.flags.has(id);}
  positionNow() {return {...this.position};}
  setOptions(options: Partial<WarehouseReviewOptions>) {this.options = {...this.options, ...options}; this.snapCamera = true;}
  reset() {this.eventMarkers.reset();this.position = this.flags.has('finale_boss_victory')?{x:1302,y:294}:{x: entry.x, y: entry.y}; this.floor='L0';this.climbing=null;this.snapCamera = true; this.moving = false;}
  climb() {
    if(!this.mask||!this.l1Mask||this.climbing)return false;
    const anchor=geometry.climbs.find(point=>Math.hypot(point.x-this.position.x,point.y-this.position.y)<=44);
    if(!anchor||!this.mask.isWalkable(anchor)||!this.l1Mask.isWalkable(anchor))return false;
    this.climbing={from:{...this.position},to:{x:anchor.x,y:anchor.y},floor:this.floor==='L0'?'L1':'L0',elapsed:0};return true;
  }
  private rebuildGroundMask() {
    if(!this.basePixels)return;
    const pixels=this.basePixels.slice();
    for(const gate of [geometry.dynamicGates.boss,...geometry.dynamicGates.shadow])if(!this.flags.has(gate.unlock))for(let y=gate.y;y<gate.y+gate.h;y++)pixels.fill(0,y*W+gate.x,y*W+gate.x+gate.w);
    this.mask=new RasterWalkableMask(W,H,pixels,catRadius);
  }

  private async load() {
    // Start props alongside the floor images instead of a second network wave.
    const [[ground, floor, graybox, l1, l1Side, upperMask], originalEntries] = await Promise.all([
      // Keep the old PNG emitted for open tabs and use it if WebP decoding fails.
      Promise.all([image(groundUrl).catch(()=>image(legacyGroundUrl)),...[floorMaskUrl, grayboxUrl,l1Url,l1SideUrl,l1MaskUrl].map(image)]),
      Promise.all(Object.entries(spriteUrls).map(async ([path,url]) => ['art/'+path.split('/art/')[1],await image(url)] as const))
    ]);
    const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
    const context = scratch.getContext('2d', {willReadFrequently: true})!;
    context.drawImage(floor, 0, 0);
    const rgba = context.getImageData(0, 0, W, H).data;
    const pixels = new Uint8Array(W * H);
    for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4];
    // Initial closed gates have independent authored rectangles. Never infer
    // movement from prop alpha: the irregular groups are cosmetic only.
    // Manifest collision rectangles include the explicit local playtest insets.
    for (const record of this.records) {
      const rect = record.collisionRect;
      for (let y = rect.y; y < rect.y + rect.h; y++) pixels.fill(0, y * W + rect.x, y * W + rect.x + rect.w);
    }
    this.basePixels=pixels;this.rebuildGroundMask();
    context.clearRect(0,0,W,H);context.drawImage(upperMask,0,0);
    const upper=context.getImageData(0,0,W,H).data, upperPixels=new Uint8Array(W*H);
    for(let i=0;i<upperPixels.length;i++)upperPixels[i]=upper[i*4];
    this.l1Mask=new RasterWalkableMask(W,H,upperPixels,catRadius);
    this.reset();
    if (!this.mask!.isWalkable(this.position)) throw new Error('仓库入口不在原始可行走区域内');
    for(const anchor of geometry.climbs)if(!this.mask!.isWalkable(anchor)||!this.l1Mask.isWalkable(anchor))throw new Error('攀爬锚点不在原始双层通路内：'+anchor.id);
    const originals = new Map(originalEntries);
    for(const [path,original] of originals){const canvas=document.createElement('canvas');canvas.width=original.width;canvas.height=original.height;canvas.getContext('2d')!.drawImage(original,0,0);this.sprites.set(path+':0',canvas);}
    for (const record of this.records) for (const component of record.components) {
      const key = component.sourceSprite + ':' + component.rotationDegrees;
      if (this.sprites.has(key)) continue;
      const original = originals.get(component.sourceSprite)!;
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = component.rotatedNaturalSize;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(component.rotationDegrees * Math.PI / 180);
      ctx.drawImage(original, -original.width / 2, -original.height / 2);
      this.sprites.set(key, canvas);
    }
    this.ground = ground; this.graybox = graybox;this.l1=l1;this.l1Side=l1Side;
    this.darkness.width=W;this.darkness.height=H;
  }

  update(deltaMs: number, dx: number, dy: number, onZone?: (id:string,floor:Floor,point:Point)=>Promise<boolean>) {
    this.moving = false;
    if (!this.mask||!this.ground) return;
    if(this.climbing){const move=this.climbing;move.elapsed=Math.min(450,move.elapsed+deltaMs);const t=move.elapsed/450;this.position={x:move.from.x+(move.to.x-move.from.x)*t,y:move.from.y+(move.to.y-move.from.y)*t};if(t===1){this.floor=move.floor;this.climbing=null;}return;}
    if(dx||dy){const length=Math.hypot(dx,dy),distance=142*deltaMs/1000,before=this.position;
      this.position=(this.floor==='L0'?this.mask:this.l1Mask!).move(before,{x:dx/length*distance,y:dy/length*distance}).position;
      this.moving=Math.hypot(this.position.x-before.x,this.position.y-before.y)>.01;
      if(dx)this.facing=dx>0?1:-1;if(this.moving)this.walkTime+=deltaMs;
    }
    // One roll per entry, with a small exit margin to prevent border jitter.
    // Missed rolls and old saved zone-attempt markers never consume a spot.
    for(const zone of geometry.randomZones){
      if(this.floor!=='L0'||Math.hypot(zone.x-this.position.x,zone.y-this.position.y)>zone.r+12)this.seenZones.delete(zone.id);
    }
    if(onZone&&this.floor==='L0'&&!this.zonePending){
      const zone=geometry.randomZones.find(point=>Math.hypot(point.x-this.position.x,point.y-this.position.y)<=point.r&&!this.seenZones.has(point.id));
      if(zone){
        this.seenZones.add(zone.id);this.zonePending=true;
        void onZone(zone.id,'L0',this.positionNow()).then(ok=>{if(!ok)this.seenZones.delete(zone.id);}).finally(()=>{this.zonePending=false;});
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, deltaMs: number) {
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#09141d'; ctx.fillRect(0, 0, width, height);
    if (!this.ground) {ctx.fillStyle = '#f3e4c5'; ctx.font = '18px sans-serif'; ctx.fillText('正在铺开仓库地图…', 28, 44); ctx.restore(); return;}
    const viewport = {x: 0, y: 0, width, height};
    const frame = cameraFrameFor(viewport, viewport, 680 * 400, W, H);
    if (this.snapCamera) {this.camera.snap(this.position, frame, W, H); this.snapCamera = false;}
    else this.camera.update(this.position, frame, W, H, deltaMs / 1000);
    if (this.options.overview) {
      const scale = Math.min(width / W, height / H);
      ctx.translate((width - W * scale) / 2, (height - H * scale) / 2); ctx.scale(scale, scale);
    } else {ctx.scale(frame.scale, frame.scale); ctx.translate(-this.camera.x, -this.camera.y);}
    if (this.options.graybox) ctx.drawImage(this.graybox!, 0, 0);
    else {ctx.drawImage(this.ground!, 0, 0);ctx.drawImage(this.l1Side!,0,0);this.drawHardware(ctx);}
    let catDrawn = false;
    for (const record of this.records) {
      if (this.floor==='L0'&&!catDrawn && this.position.y < record.zOrder) {this.drawCat(ctx); catDrawn = true;}
      if (!this.options.graybox) for (const component of record.components) {
        const bounds = component.drawRect;
        ctx.drawImage(this.sprites.get(component.sourceSprite + ':' + component.rotationDegrees)!, bounds.x, bounds.y, bounds.w, bounds.h);
      }
    }
    if(this.floor==='L0'&&!catDrawn)this.drawCat(ctx);
    if(!this.options.graybox){ctx.save();ctx.globalAlpha=this.floor==='L0'&&this.l1Mask!.isWalkable(this.position)?0.4:1;ctx.drawImage(this.l1!,0,0);ctx.restore();this.drawOutcomes(ctx);}
    if(this.floor==='L1')this.drawCat(ctx);
    this.drawLighting(ctx);this.drawMarkers(ctx);
    if (this.options.collision) {
      ctx.lineWidth = 1; ctx.strokeStyle = '#ffbc6e';
      for (const record of this.records) {const rect=record.collisionRect;ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);}
      ctx.strokeStyle='#c5a1ff';for(const rect of geometry.l1WalkableRectangles)ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
      ctx.strokeStyle = '#80eadc';
      for (const polygon of geometry.walkable.L0) {ctx.beginPath(); polygon.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();}
      ctx.strokeStyle = '#ff8897';
      for (const gate of [geometry.dynamicGates.boss, ...geometry.dynamicGates.shadow]) ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);
      ctx.strokeStyle = '#c6f4ff'; ctx.beginPath(); ctx.arc(this.position.x, this.position.y, catRadius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.fillStyle = '#eaddbd'; ctx.font = '13px monospace';
    ctx.fillText(`${this.floor} · ${Math.round(this.position.x)}, ${Math.round(this.position.y)}`, 18, height - 18); ctx.restore();
  }

  private drawHardware(ctx:CanvasRenderingContext2D){
    for(const record of manifest.initialHardware){
      if('sourceGate' in record&&record.sourceGate&&this.flags.has(record.sourceGate.unlock))continue;
      if(record.id==='bunker_exit'&&this.flags.has('finale_boss_victory'))continue;
      const sprite=this.sprites.get(record.sourceSprite+':0');if(!sprite)continue;
      const [x,y,w,h]=record.drawRect,rotation='rotationDegrees'in record?record.rotationDegrees??0:0;
      ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(sprite,-(rotation%180?h:w)/2,-(rotation%180?w:h)/2,rotation%180?h:w,rotation%180?w:h);ctx.restore();
    }
  }
  private drawOutcomes(ctx:CanvasRenderingContext2D){
    for(const [flag,outcome] of Object.entries(geometry.visualOutcomeMapping)){if(outcome.floor!==this.floor||!this.flags.has(flag))continue;
      const asset=outcome.sourceEvent==='box_haul_event'?'crate_pallet_mixed':outcome.sourceEvent==='warehouse_light_crate'?'machine_power_big':'pallet_low';
      const sprite=this.sprites.get('art/source/sprites/'+asset+'.png:0')??this.sprites.get('art/variants/'+asset+'.png:0');
      if(sprite)ctx.drawImage(sprite,outcome.anchor[0]-17,outcome.anchor[1]-30,34,sprite.height*34/sprite.width);
    }
  }
  private drawLighting(ctx:CanvasRenderingContext2D){
    const tint:Record<string,string>={entry_lamp:'147,193,120',central_spotlight:'174,190,119',secondary_lamp:'232,139,78'};
    const lights=[
      ...geometry.ambientLamps.filter(p=>p.floor===this.floor).map((p,i)=>({...p,r:p.r*1.25,strength:.72,color:i%2?'201,139,89':'132,177,137'})),
      ...geometry.interactions.filter(p=>p.kind==='light'&&p.floor===this.floor&&this.lightIsOn(p.id)).map(p=>({...p,r:285,strength:1,color:tint[p.id]})),
    ];
    const key=this.floor+geometry.interactions.filter(p=>p.kind==='light').map(p=>Number(this.lightIsOn(p.id))).join('');
    const darknessKey=`${key}:${this.position.x}:${this.position.y}`;
    // Reuse the existing mask while stationary; movement and light/floor
    // changes still paint the same authored pools, without another canvas.
    if(this.darknessKey!==darknessKey){
      this.darknessKey=darknessKey;
      const shade=this.darkness.getContext('2d')!;
      shade.clearRect(0,0,W,H);shade.globalCompositeOperation='source-over';
      shade.fillStyle='rgba(2,5,9,.96)';shade.fillRect(0,0,W,H);shade.globalCompositeOperation='destination-out';
      // A faint, short paw-level pool keeps the cat readable without lighting the aisle.
      const pools=[{...this.position,r:68,strength:.38},...lights];
      for(const pool of pools){
        const glow=shade.createRadialGradient(pool.x,pool.y,8,pool.x,pool.y,pool.r);
        glow.addColorStop(0,`rgba(0,0,0,${pool.strength})`);
        glow.addColorStop(.42,`rgba(0,0,0,${pool.strength*.88})`);
        glow.addColorStop(1,'rgba(0,0,0,0)');
        shade.fillStyle=glow;shade.beginPath();shade.arc(pool.x,pool.y,pool.r,0,Math.PI*2);shade.fill();
      }
    }
    ctx.drawImage(this.darkness,0,0);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const lamp of lights){
      const glow=ctx.createRadialGradient(lamp.x,lamp.y,4,lamp.x,lamp.y,lamp.r);
      glow.addColorStop(0,`rgba(${lamp.color},${lamp.strength*.58})`);
      glow.addColorStop(.35,`rgba(${lamp.color},${lamp.strength*.24})`);
      glow.addColorStop(1,`rgba(${lamp.color},0)`);
      ctx.fillStyle=glow;ctx.fillRect(lamp.x-lamp.r,lamp.y-lamp.r,lamp.r*2,lamp.r*2);
    }
    ctx.restore();
  }
  private drawMarkers(ctx:CanvasRenderingContext2D){
    const flags=this.lightPreview?new Set(this.flags):this.flags;
    if(this.lightPreview){if(this.lightPreview.lit)flags.add(this.lightPreview.id);else flags.delete(this.lightPreview.id);}
    this.eventMarkers.draw(ctx,{floor:this.floor,position:this.position,flags,drawn:this.drawn,near:this.nearTarget},performance.now());
  }

  private drawCat(ctx: CanvasRenderingContext2D) {
    const bob = this.moving ? Math.sin(this.walkTime * .02) * .7 : 0;
    ctx.save(); ctx.translate(this.position.x, this.position.y);
    ctx.fillStyle = 'rgba(5,10,16,.42)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Larger review sprite; the authored radius-13 collision stays at the paws.
    ctx.translate(0, -bob-(this.climbing?Math.sin(this.climbing.elapsed/450*Math.PI)*14:0)); ctx.scale(this.facing * .75, .75); ctx.translate(-32, -58);
    drawPixelCat(ctx, 'miaomiao', 'idle'); ctx.restore();
  }
}
