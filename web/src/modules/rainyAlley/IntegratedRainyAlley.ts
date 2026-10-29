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
  // —— 沉浸式视口：滚轮/加减键缩放（世界坐标与碰撞不变，仅取景变化）；标记动画时钟。 ——
  private zoomTarget = 1;
  private zoom = 1;
  private now = 0;
  // 顶栏展开时小地图下移避让的当前/目标位移（canvas 逻辑像素，每帧向目标缓动）。
  private minimapShift = 0;
  private minimapShiftTarget = 0;

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
    this.camera = {x: 0, y: rainyAlleyRegistration.worldHeight - cameraSize.height / this.zoom};
    this.path = []; this.destination = null; this.nearby = null;
    this.zonesInside.clear();
    for (const zone of rainyAlleySource.objects.zones) if (Math.hypot(this.position.x - zone.x, this.position.y - zone.y) <= zone.r) this.zonesInside.add(zone.id);
    this.zoneChecksInFlight.clear(); this.squeezeTargetY = null; this.climbTime = 0; this.climbFrom = null; this.climbTo = null; this.climbCrateId = null;
  }

  toggleDebug() {this.debug = !this.debug;}
  /** 滚轮/加减键调整取景缩放；只影响画面取景，不改变世界坐标、碰撞与点击寻路（click 反解共用 imageView）。 */
  adjustZoom(delta: number) {this.zoomTarget = Math.min(1.75, Math.max(0.8, this.zoomTarget + delta));}
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
    // 顶栏展开时小地图让位：目标位移与当前位移做指数缓动，与 CSS 滑出动画同一节奏感。
    this.minimapShift += (this.minimapShiftTarget - this.minimapShift) * Math.min(1, deltaSeconds * 9);
    return Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
  }

  /** 顶栏展开态通知：小地图整体下移避让（传 0 复位）。 */
  setMinimapShift(shift: number) {this.minimapShiftTarget = shift;}

  click(clientX: number, clientY: number, bounds: DOMRect, canvasWidth: number, canvasHeight: number, cover: boolean) {
    const scale = (cover ? Math.max : Math.min)(bounds.width / canvasWidth, bounds.height / canvasHeight);
    const screenX = (clientX - bounds.left - (bounds.width - canvasWidth * scale) / 2) / scale;
    const screenY = (clientY - bounds.top - (bounds.height - canvasHeight * scale) / 2) / scale;
    // 小地图区域不作为寻路点击目标。
    const mini = this.minimapRect(canvasWidth, canvasHeight);
    if (screenX >= mini.x - 4 && screenX <= mini.x + mini.width + 4 && screenY >= mini.y - 4 && screenY <= mini.y + mini.height + 4) return;
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
    this.now = performance.now();
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
    this.drawMinimap(context, width, height, flags);
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
    // 缩放平滑跟随，与相机同一套指数插值，滚轮放大时画面不突跳。
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-deltaSeconds * 9));
    if (Math.abs(this.zoomTarget - this.zoom) < 0.001) this.zoom = this.zoomTarget;
    const viewWidth = cameraSize.width / this.zoom, viewHeight = cameraSize.height / this.zoom;
    const maxX = Math.max(0, rainyAlleyRegistration.worldWidth - viewWidth);
    const maxY = Math.max(0, rainyAlleyRegistration.worldHeight - viewHeight);
    const targetX = Math.min(maxX, Math.max(0, this.position.x - viewWidth / 2));
    const targetY = Math.min(maxY, Math.max(0, this.position.y - viewHeight / 2));
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
    const viewWidth = registration.sx * cameraSize.width / this.zoom;
    const viewHeight = registration.sy * cameraSize.height / this.zoom;
    const scale = Math.min(width / viewWidth, height / viewHeight);
    return {
      x: registration.tx + registration.sx * this.camera.x,
      y: registration.ty + registration.sy * this.camera.y,
      scale,
      padX: (width - viewWidth * scale) / 2,
      padY: (height - viewHeight * scale) / 2
    };
  }

  /** 交互点标签的像素小图标：让“雨水倒影”“空鱼罐头”这类名字一眼可辨。 */
  private static readonly markerEmoji: Record<string, string> = {
    alley_puddle_reflection: '💧', alley_empty_fish_can: '🥫', alley_fish_dry: '🐟',
    alley_crate: '📦', alley_poster: '📄', alley_scratch_marks: '🐾',
    alley_blanket_stack: '🧺', alley_dog_friend_point: '🐕'
  };

  private drawMarkers(context: CanvasRenderingContext2D, flags: readonly string[]) {
    const completed = (object: RainyFixedObject) =>
      (object.id === 'alley_fish_dry' && flags.includes('alley_fish_collected')) ||
      (object.id === 'alley_crate' && flags.includes('alley_rescued')) ||
      (object.id === 'alley_poster' && flags.includes('lost_poster_found')) ||
      (object.id === 'alley_blanket_stack' && ['blanket_secured', 'blanket_half', 'blanket_lost'].some(flag => flags.includes(flag)));
    // 各类交互点的辉光色（RGB）与主体色：调查=薄荷绿放大镜，其余=彩色像素四芒星。
    const palette = {
      inspection: {glow: '190,232,206', core: '#d9efe2'},
      node_event: {glow: '255,209,102', core: '#ffe9a3'},
      pickup_proposed: {glow: '237,201,121', core: '#ffdf8e'},
      story: {glow: '238,168,209', core: '#ffd3ec'}
    } as const;
    for (const object of rainyAlleySource.objects.fixed) {
      const kind = palette[object.kind];
      const dimmed = completed(object) || !rainyAlleyObjectEligible(object, flags);
      const pulse = 0.5 + 0.5 * Math.sin(this.now / 430 + object.x * 0.031);
      const bob = Math.sin(this.now / 520 + object.x * 0.021) * 2.6;
      context.save();
      context.globalAlpha = dimmed ? 0.42 : 1;
      context.translate(object.x, object.y + bob * 0.4);

      // 主线目标物：呼吸大光晕，指明“下一步在这里”。
      const isObjective = (object.id === 'alley_crate' && !flags.includes('alley_rescued')) ||
        (object.id === 'alley_poster' && flags.includes('alley_rescued') && !flags.includes('lost_poster_found'));
      if (isObjective) {
        const halo = context.createRadialGradient(0, 0, 4, 0, 0, 21 + pulse * 7);
        halo.addColorStop(0, `rgba(248,234,192,${0.42 + pulse * 0.22})`);
        halo.addColorStop(1, 'rgba(248,234,192,0)');
        context.fillStyle = halo;
        context.beginPath(); context.arc(0, 0, 28 + pulse * 7, 0, Math.PI * 2); context.fill();
      }

      // 图标本体的背光，让标记在深浅地面上都醒目。
      const glow = context.createRadialGradient(0, 0, 1, 0, 0, 14 + pulse * 5);
      glow.addColorStop(0, `rgba(${kind.glow},${(dimmed ? 0.14 : 0.3) + pulse * 0.16})`);
      glow.addColorStop(1, `rgba(${kind.glow},0)`);
      context.fillStyle = glow;
      context.beginPath(); context.arc(0, 0, 19 + pulse * 5, 0, Math.PI * 2); context.fill();

      if (object.kind === 'inspection') {
        // 可调查线索 = 微呼吸的发光放大镜。
        const breathe = 5.9 + pulse * 0.9;
        context.fillStyle = `rgba(${kind.glow},0.32)`;
        context.beginPath(); context.arc(-1.5, -1.5, breathe, 0, Math.PI * 2); context.fill();
        context.strokeStyle = kind.core; context.lineWidth = 2.3;
        context.beginPath(); context.arc(-1.5, -1.5, breathe, 0, Math.PI * 2); context.stroke();
        context.lineWidth = 2.6;
        context.beginPath(); context.moveTo(3, 3); context.lineTo(7.6, 7.6); context.stroke();
        context.strokeStyle = 'rgba(255,255,255,.85)'; context.lineWidth = 1.3;
        context.beginPath(); context.arc(-3.3, -3.3, breathe * 0.46, Math.PI * 0.95, Math.PI * 1.45); context.stroke();
      } else {
        // 事件/拾取/剧情 = 闪烁的像素四芒星（纯方块拼出，保持像素气质）。
        const arm = 5.5 + pulse * 4.5;
        context.shadowColor = 'rgba(14,30,34,.85)'; context.shadowBlur = 3;
        context.fillStyle = kind.core;
        const px = (x: number, y: number, w: number, h: number) => context.fillRect(x, y, w, h);
        px(-1.5, -1.5, 3, 3);
        px(-1.5, -arm, 3, arm - 1.5);
        px(-1.5, 2.5, 3, arm - 2.5);
        px(-arm, -1.5, arm - 1.5, 3);
        px(2.5, -1.5, arm - 2.5, 3);
        context.shadowBlur = 0;
        context.fillStyle = '#ffffff';
        px(-0.5, -0.5, 1, 1);
      }

      // 标签：半透明深色圆角胶囊 + emoji 图标，悬浮在交互点上方轻轻浮动。
      const label = `${IntegratedRainyAlley.markerEmoji[object.id] ?? '✦'} ${object.label}`;
      context.font = '700 12.5px system-ui, sans-serif';
      const chipWidth = context.measureText(label).width + 18, chipHeight = 19;
      const chipX = -chipWidth / 2, chipY = -14 - chipHeight - 3 + bob;
      context.fillStyle = 'rgba(13,26,30,.8)';
      this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 6);
      context.fill();
      context.strokeStyle = `rgba(${kind.glow},.5)`; // 描边与辉光同色系
      context.lineWidth = 1.4;
      this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 6);
      context.stroke();
      context.fillStyle = '#f7f2df';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(label, 0, chipY + chipHeight / 2 + 0.5);
      context.restore();
    }
  }

  /** 圆角矩形路径（Canvas 原生 roundRect 的兼容写法）。 */
  private roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  /** 窄缝两侧的“隐形墙”：用堆叠纸箱（左）与灌木丛（右）做出真实阻挡感。覆盖区域与碰撞多边形严格一致。 */
  private drawSqueezeOverlay(context: CanvasRenderingContext2D) {
    const sideWidth = (SQUEEZE_BOUNDS.right - SQUEEZE_BOUNDS.left - SQUEEZE_OPENING_WIDTH) / 2;
    const top = SQUEEZE_BOUNDS.top, bottom = SQUEEZE_BOUNDS.bottom;
    this.drawCrateWall(context, SQUEEZE_BOUNDS.left, top, sideWidth, bottom - top);
    this.drawBushWall(context, SQUEEZE_BOUNDS.right - sideWidth, top, sideWidth, bottom - top);
  }

  /** 左侧阻挡：向上堆叠的废弃纸箱，箱身有胶带与明暗面。 */
  private drawCrateWall(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    context.save();
    // 视觉比碰撞条略宽（向外扩 2px），更敦实；朝窄缝一侧严格对齐，不侵占通过间隙。
    context.beginPath(); context.rect(x - 2, y - 1, width + 2, height + 2); context.clip();
    const boxHeight = 17.5;
    const count = Math.ceil(height / boxHeight);
    for (let index = 0; index < count; index++) {
      const boxY = y + index * boxHeight;
      const inset = (index % 2) * 1.2; // 交错半格，像随手码起来的
      const boxX = x - 1.5 + inset, boxW = width + 1.5 - inset * 2;
      // 箱体三段明暗：受光面 / 主面 / 背光面
      context.fillStyle = '#c2a179'; context.fillRect(boxX, boxY, 2.6, boxHeight - 1);
      context.fillStyle = '#a5825a'; context.fillRect(boxX + 2.6, boxY, boxW - 5.2, boxHeight - 1);
      context.fillStyle = '#7f694e'; context.fillRect(boxX + boxW - 2.6, boxY, 2.6, boxHeight - 1);
      // 顶部翻盖棱线 + 中央胶带
      context.fillStyle = '#d4b48c'; context.fillRect(boxX, boxY, boxW, 1.6);
      context.fillStyle = '#8a6a48'; context.fillRect(boxX + boxW / 2 - 1, boxY, 2, boxHeight - 1);
      // 箱间接缝阴影
      if (index > 0) {context.fillStyle = 'rgba(20,16,10,.4)'; context.fillRect(boxX, boxY, boxW, 1.4);}
    }
    // 落地投影
    context.fillStyle = 'rgba(10,18,20,.35)';
    context.fillRect(x - 3, y + height - 2, width + 4, 4);
    context.restore();
  }

  /** 右侧阻挡：一丛茂密灌木，叶片分层 + 点缀小红果。 */
  private drawBushWall(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    context.save();
    context.beginPath(); context.rect(x, y - 1, width + 2, height + 2); context.clip();
    const centerX = x + width / 2;
    const blobs = Math.ceil(height / 13);
    for (let index = 0; index < blobs; index++) {
      const blobY = y + 7 + index * 13;
      const sway = Math.sin(index * 2.1) * 1.6;
      const radius = 6.4 + (index % 2) * 1.3;
      context.fillStyle = '#2f5a3c';
      context.beginPath(); context.arc(centerX + sway, blobY + 1.4, radius, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#3f7048';
      context.beginPath(); context.arc(centerX + sway, blobY, radius - 0.8, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#5b9a5f';
      context.beginPath(); context.arc(centerX + sway - radius * 0.28, blobY - radius * 0.34, radius * 0.5, 0, Math.PI * 2); context.fill();
      if (index % 3 === 1) {
        context.fillStyle = '#d9534f';
        context.beginPath(); context.arc(centerX + sway + radius * 0.4, blobY + 1, 1.1, 0, Math.PI * 2); context.fill();
      }
    }
    // 顶部受光与底部投影
    context.fillStyle = 'rgba(120,190,125,.5)';
    context.fillRect(x, y - 1, width, 1.6);
    context.fillStyle = 'rgba(10,18,20,.35)';
    context.fillRect(x - 1, y + height - 2, width + 3, 4);
    context.restore();
  }

  /** 右上角像素风小地图：整图概览 + 交互点 + 当前取景框 + 闪烁的玩家位置。画在屏幕坐标，不随世界镜头移动。 */
  private minimapRect(width: number, _height: number) {
    const mapWidth = Math.min(150, width * 0.24);
    const mapHeight = mapWidth * rainyAlleyRegistration.worldHeight / rainyAlleyRegistration.worldWidth;
    // +minimapShift：顶栏展开时整块小地图向下让位（click 的点击排除区共用此矩形，自动跟随）。
    return {x: width - mapWidth - 10, y: 10 + this.minimapShift, width: mapWidth, height: mapHeight};
  }

  private drawMinimap(context: CanvasRenderingContext2D, width: number, height: number, flags: readonly string[]) {
    const mini = this.minimapRect(width, height);
    if (mini.height > height * 0.4) return; // 极窄画布上放弃小地图，避免遮挡主视野
    const registration = rainyAlleyRegistration;
    const geometry = this.gateOpen ? rainyAlleyGeometryOpen : rainyAlleyGeometryClosed;
    context.save();
    // 磨砂底板 + 暖金描边，与 HUD 视觉同语言
    context.fillStyle = 'rgba(9,18,22,.68)';
    this.roundRectPath(context, mini.x, mini.y, mini.width, mini.height, 8);
    context.fill();
    context.strokeStyle = 'rgba(255,226,150,.45)'; context.lineWidth = 2;
    this.roundRectPath(context, mini.x, mini.y, mini.width, mini.height, 8);
    context.stroke();

    context.save();
    this.roundRectPath(context, mini.x + 2, mini.y + 2, mini.width - 4, mini.height - 4, 6);
    context.clip();
    const scale = mini.width / registration.worldWidth;
    context.translate(mini.x, mini.y);
    context.scale(scale, scale);
    // 可行走区域
    context.fillStyle = 'rgba(140,190,164,.42)';
    for (const polygon of geometry.walkable) {polygonPath(context, polygon); context.fill();}
    // 交互点彩点（半径/线宽按缩放后的目标屏幕像素反推：scale≈0.126）
    const dotColors: Record<string, string> = {
      inspection: '#a8dcc0', node_event: '#ffd166', pickup_proposed: '#edc979', story: '#eea8d1'
    };
    for (const object of rainyAlleySource.objects.fixed) {
      if (!rainyAlleyObjectEligible(object, flags)) continue;
      context.fillStyle = dotColors[object.kind];
      context.beginPath(); context.arc(object.x, object.y, 20, 0, Math.PI * 2); context.fill();
    }
    // 当前取景框（随缩放变化，玩家可见“镜头”范围）
    context.strokeStyle = 'rgba(255,255,255,.6)'; context.lineWidth = 12;
    context.strokeRect(this.camera.x, this.camera.y, cameraSize.width / this.zoom, cameraSize.height / this.zoom);
    // 玩家：闪烁暖橙点 + 呼吸外圈
    const blink = 0.55 + 0.45 * Math.sin(this.now / 260);
    context.fillStyle = `rgba(255,182,77,${blink * 0.35})`;
    context.beginPath(); context.arc(this.position.x, this.position.y, 48, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ffb64d'; context.strokeStyle = '#3a2412'; context.lineWidth = 10;
    context.beginPath(); context.arc(this.position.x, this.position.y, 24, 0, Math.PI * 2); context.fill(); context.stroke();
    context.restore();
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
