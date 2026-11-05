import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import {drawPixelDog} from '../../adapters/canvas/pixelDog';
import {followCameraPoint} from '../../adapters/canvas/camera';
import {rainyAlleyObjectEligible, rainyAlleyRegistration, rainyAlleySource, type RainyFixedObject} from './assets';
import {findPath, sweepMove} from './collision';
import {paintSqueezePassage} from './squeezePainter';
import {paintEventProp} from './eventProps';
import {RainyEventLabels, EVENT_PROP_SCALE} from './eventLabels';
import {chapterBackground} from '../map/artwork';
import {
  rainyAlleyFieldClosed, rainyAlleyFieldOpen, rainyAlleyGeometryClosed, rainyAlleyGeometryOpen,
  rainyAlleySqueezeFieldClosed, rainyAlleySqueezeFieldOpen, SQUEEZE_BOUNDS, SQUEEZE_CENTER_X,
  SQUEEZE_OPENING_WIDTH, CRATE_CLIMBS, CRATE_CLIMB_RADIUS, battleReturnPositionTarget, crateClimbTarget, squeezeExitTarget
} from './runtimeGeometry';
import type {Point, WorldPolygon} from './types';

const spawn = {x: 111, y: 626};
// When a page reloads between rescue and poster discovery, restore near the story anchor.
const pendingPosterReturn = {x: 990, y: 396};
const speed = 96;
const cameraSize = {width: 530, height: 325};
const squeezeSpeed = 58;
const CLIMB_DURATION = 0.55;
// —— 巷尾的老黄：比通用标记更宽的靠近提示半径；首次靠近的一次性氛围字幕与交互欢呼（纯表现层）。 ——
const DOG_FRIEND_ID = 'alley_dog_friend_point';
const DOG_FRIEND_RADIUS = 50;
type ZoneCheckResult = 'checking' | 'accepted' | 'failed';
interface DebugState {phase: string; eventId?: string; pendingEventSource?: string; randomEligible?: boolean}

function polygonPath(context: CanvasRenderingContext2D, polygon: WorldPolygon) {
  polygon.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

export class IntegratedRainyAlley {
  private get background() {return chapterBackground('alley');}
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
  private squeezeFeedbackUntil = 0;
  private climbTime = 0;
  private climbFrom: Point | null = null;
  private climbTo: Point | null = null;
  private climbCrateId: 'west' | 'east' | null = null;
  // —— 沉浸式视口：滚轮/加减键缩放（世界坐标与碰撞不变，仅取景变化）；标记动画时钟。 ——
  private zoomTarget = 1;
  private zoom = 1;
  private now = 0;
  private readonly eventLabels = new RainyEventLabels();
  // 老黄的交互欢呼计时。
  private cheerStart = 0;
  private cheerUntil = 0;

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
    this.eventLabels.reset();
    this.zonesInside.clear();
    for (const zone of rainyAlleySource.objects.zones) if (Math.hypot(this.position.x - zone.x, this.position.y - zone.y) <= zone.r) this.zonesInside.add(zone.id);
    this.zoneChecksInFlight.clear(); this.squeezeTargetY = null; this.squeezeFeedbackUntil = 0; this.climbTime = 0; this.climbFrom = null; this.climbTo = null; this.climbCrateId = null;
  }

  toggleDebug() {this.debug = !this.debug;}
  /** 滚轮/加减键调整取景缩放；只影响画面取景，不改变世界坐标、碰撞与点击寻路（click 反解共用 imageView）。 */
  adjustZoom(delta: number) {this.zoomTarget = Math.min(1.75, Math.max(0.8, this.zoomTarget + delta));}
  nearestInteraction() {return this.nearby;}
  /** E 交互老黄后的欢呼（纯表现层）：猫头顶冒出小气泡、像素音符错峰上飘，狗摇尾巴抬头，约 3 秒。 */
  cheer() {
    const now = performance.now();
    if (now < this.cheerUntil) return; // 欢呼进行中不重置，音符动画保持连贯
    this.cheerStart = now;
    this.cheerUntil = now + 3000;
  }
  /** 欢呼是否进行中（进行中让出 [E] 提示气泡，避免两层气泡叠在一起）。 */
  private cheering() {return performance.now() < this.cheerUntil;}
  pauseForEvent() {this.path = []; this.destination = null;}
  squeezePromptActive() {return this.squeezeTargetY === null && this.squeezeDirection() !== 0;}
  squeezeHint() {
    if (this.squeezeTargetY !== null) return '正在侧身挤过狭缝…';
    if (performance.now() < this.squeezeFeedbackUntil) return '已穿过狭缝，可以继续移动。';
    return this.squeezePromptActive() ? '松开移动键，再轻按 Q 挤过狭缝' : null;
  }
  tryStartSqueeze() {
    const direction = this.squeezeDirection();
    if (!direction || this.squeezeTargetY !== null) return false;
    this.path = []; this.destination = null;
    const normalField = this.gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const squeezeField = this.gateOpen ? rainyAlleySqueezeFieldOpen : rainyAlleySqueezeFieldClosed;
    const exit = squeezeExitTarget(normalField, squeezeField, direction);
    if (!exit) return false;
    this.squeezeFeedbackUntil = 0;
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
      if (distance <= 1) {this.position = {x: SQUEEZE_CENTER_X, y: this.squeezeTargetY}; this.squeezeTargetY = null; this.squeezeFeedbackUntil = performance.now() + 1800;}
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
    this.now = performance.now();
    context.save();
    context.imageSmoothingEnabled = false;
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
    this.drawDogFriend(context);
    this.drawMarkers(context, flags, debugState.phase === 'explore');
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
    this.drawCheer(context, width, height);
  }

  /** Front-facing resting pose, matching the cats' outline weight and pixel scale. */
  private drawDogFriend(context: CanvasRenderingContext2D) {
    const dog=rainyAlleySource.objects.fixed.find(o=>o.id===DOG_FRIEND_ID);if(!dog)return;
    const alert=this.cheering()||Math.hypot(this.position.x-dog.x,this.position.y-dog.y)<=DOG_FRIEND_RADIUS;
    context.save();context.translate(dog.x,dog.y);
    context.fillStyle='#0b18234d';context.beginPath();context.ellipse(0,1,17,4,0,0,Math.PI*2);context.fill();
    context.scale(.58,.58);context.translate(-32,-57);drawPixelDog(context,alert,this.now);context.restore();
  }

  /** E 交互老黄后的欢呼气泡与上飘音符（屏幕坐标层，随猫移动）：气泡 1.4s 后隐去，音符错峰升起淡出。 */
  private drawCheer(context: CanvasRenderingContext2D, width: number, height: number) {
    if (!this.cheering()) return;
    const elapsed = performance.now() - this.cheerStart;
    const view = this.imageView(width, height);
    const registration = rainyAlleyRegistration;
    const catX = view.padX + (registration.tx + this.position.x * registration.sx - view.x) * view.scale;
    const catY = view.padY + (registration.ty + this.position.y * registration.sy - view.y) * view.scale;
    const bob = Math.sin(this.now / 300) * 2;
    context.save();
    // 猫头顶的米色小气泡（前 1.5s 显示，随后让位给纯音符）
    if (elapsed < 1500) {
      const bubbleAlpha = Math.min(1, (1500 - elapsed) / 320);
      context.globalAlpha = bubbleAlpha;
      context.font = '700 12px system-ui, sans-serif';
      const text = '汪！♪';
      const textWidth = context.measureText(text).width;
      const bubbleW = textWidth + 20, bubbleH = 22;
      const bubbleX = catX + 16, bubbleY = catY - 58 + bob;
      context.shadowColor = 'rgba(6,14,18,.5)'; context.shadowBlur = 5; context.shadowOffsetY = 2;
      context.fillStyle = '#f4e9cd';
      this.roundRectPath(context, bubbleX, bubbleY, bubbleW, bubbleH, 6); context.fill();
      context.beginPath();
      context.moveTo(bubbleX + 3, bubbleY + bubbleH - 1);
      context.lineTo(bubbleX + 10, bubbleY + bubbleH - 1);
      context.lineTo(bubbleX + 1, bubbleY + bubbleH + 6);
      context.closePath(); context.fill();
      context.shadowBlur = 0; context.shadowOffsetY = 0;
      context.strokeStyle = '#74534d'; context.lineWidth = 1.4;
      this.roundRectPath(context, bubbleX, bubbleY, bubbleW, bubbleH, 6); context.stroke();
      context.fillStyle = '#7a4a22';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(text, bubbleX + bubbleW / 2, bubbleY + bubbleH / 2 + 0.5);
      context.globalAlpha = 1;
    }
    // 像素音符：4 个错峰上飘（♪/♫ 交替），左右轻摆、逐渐淡出
    context.font = '800 13px system-ui, sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    for (let index = 0; index < 4; index++) {
      const life = (elapsed - 240 - index * 300) / 1700;
      if (life <= 0 || life >= 1) continue;
      const ease = 1 - (1 - life) * (1 - life);
      const noteX = catX + 22 + Math.sin(life * Math.PI * 2.4 + index * 1.7) * 7 + index * 5;
      const noteY = catY - 46 - ease * 46;
      context.globalAlpha = (1 - life) * 0.95;
      context.fillStyle = index % 2 ? '#ffd76e' : '#ffe9a8';
      context.fillText(index % 2 ? '♫' : '♪', noteX, noteY);
    }
    context.globalAlpha = 1;
    context.restore();
  }

  private updateNearby(flags: readonly string[]) {
    const baseRadius = rainyAlleySource.objects.interactionRadius;
    this.nearby = rainyAlleySource.objects.fixed
      .filter(object => rainyAlleyObjectEligible(object, flags))
      .map(object => ({object, distance: Math.hypot(this.position.x - object.x, this.position.y - object.y)}))
      // 老黄的靠近提示半径更宽（趴在巷尾，隔着半条巷子就该注意到它）。
      .filter(candidate => candidate.distance <= (candidate.object.id === DOG_FRIEND_ID ? DOG_FRIEND_RADIUS : baseRadius))
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
    // 缩放平滑跟随，与相机同一套指数插值，滚轮放大时画面不突跳；相机插值走公共 followCameraPoint（与集市等场景同手感）。
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-deltaSeconds * 9));
    if (Math.abs(this.zoomTarget - this.zoom) < 0.001) this.zoom = this.zoomTarget;
    const viewWidth = cameraSize.width / this.zoom, viewHeight = cameraSize.height / this.zoom;
    const maxX = Math.max(0, rainyAlleyRegistration.worldWidth - viewWidth);
    const maxY = Math.max(0, rainyAlleyRegistration.worldHeight - viewHeight);
    const targetX = Math.min(maxX, Math.max(0, this.position.x - viewWidth / 2));
    const targetY = Math.min(maxY, Math.max(0, this.position.y - viewHeight / 2));
    const next = followCameraPoint(this.camera, {x: targetX, y: targetY}, deltaSeconds);
    this.camera.x = next.x;
    this.camera.y = next.y;
  }

  private squeezeDirection(): -1 | 0 | 1 {
    if (Math.abs(this.position.x - SQUEEZE_CENTER_X) > 10) return 0;
    if (this.position.y >= SQUEEZE_BOUNDS.top - 18 && this.position.y <= SQUEEZE_BOUNDS.top) return 1;
    if (this.position.y >= SQUEEZE_BOUNDS.bottom && this.position.y <= SQUEEZE_BOUNDS.bottom + 18) return -1;
    return 0;
  }

  private drawBackground(context: CanvasRenderingContext2D) {
    if (!this.background.complete || !this.background.naturalWidth) return;
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

  private drawMarkers(context: CanvasRenderingContext2D, flags: readonly string[], interactive: boolean) {
    if(interactive){this.drawClimbMarkers(context);this.drawSqueezeMarker(context);}
    for (const object of rainyAlleySource.objects.fixed) {
      if (object.id === DOG_FRIEND_ID || (object.requiresFlag && !flags.includes(object.requiresFlag))) continue;
      const completed = !rainyAlleyObjectEligible(object, flags);
      context.save(); context.globalAlpha = completed ? .48 : 1;
      paintEventProp(context, object.id, object.x, object.y, EVENT_PROP_SCALE, completed);
      context.restore();
      if (object.id === 'alley_crate' && !completed) {
        context.save(); context.strokeStyle = 'rgba(225,197,123,.48)'; context.lineWidth = 1;
        context.beginPath(); context.ellipse(object.x, object.y + 3, 19 * EVENT_PROP_SCALE, 5 * EVENT_PROP_SCALE, 0, 0, Math.PI * 2); context.stroke(); context.restore();
      }
    }
    if(interactive)this.eventLabels.draw(context, rainyAlleySource.objects.fixed, flags, this.position, this.nearby?.id, this.now);
  }

  private drawSqueezeMarker(context: CanvasRenderingContext2D) {
    if (this.squeezeTargetY !== null) return;
    const top = {x: SQUEEZE_CENTER_X, y: SQUEEZE_BOUNDS.top - 12}, bottom = {x: SQUEEZE_CENTER_X, y: SQUEEZE_BOUNDS.bottom + 12};
    const point = Math.hypot(this.position.x - top.x, this.position.y - top.y) < Math.hypot(this.position.x - bottom.x, this.position.y - bottom.y) ? top : bottom;
    if (Math.hypot(this.position.x - point.x, this.position.y - point.y) > 72) return;
    context.save(); context.globalAlpha = this.squeezeDirection() ? 1 : .72;
    context.translate(SQUEEZE_BOUNDS.right + 10, point.y);
    context.fillStyle = '#9adbd4'; context.strokeStyle = '#28494b'; context.lineWidth = 1.6;
    context.beginPath(); context.arc(0, 0, 7, 0, Math.PI * 2); context.fill(); context.stroke();
    context.strokeStyle='#d4e0cc';context.lineWidth=1.2;context.beginPath();context.moveTo(-3,-2);context.lineTo(0,1);context.lineTo(3,-2);context.stroke();context.restore();
  }

  private drawClimbMarkers(context: CanvasRenderingContext2D) {
    const crossing = this.climbTarget();
    for (const climb of CRATE_CLIMBS) {
      if (climb.rescueRequired && !this.gateOpen) continue;
      const point = [...climb.ends].sort((a, b) =>
        Math.hypot(this.position.x - a.x, this.position.y - a.y) - Math.hypot(this.position.x - b.x, this.position.y - b.y))[0];
      if (Math.hypot(this.position.x - point.x, this.position.y - point.y) > CRATE_CLIMB_RADIUS + 32) continue;
      const active = crossing?.crateId === climb.crateId && this.climbTime <= 0;
      context.save();
      context.globalAlpha = active ? 1 : 0.72;
      context.translate(point.x - 23, point.y - 17);
      context.fillStyle = '#91d8d4'; context.strokeStyle = '#243f43'; context.lineWidth = 2;
      context.beginPath(); context.arc(0, 0, 8, 0, Math.PI * 2); context.fill(); context.stroke();
      context.strokeStyle='#e6d9b6';context.lineWidth=1.2;context.beginPath();context.moveTo(-3,2);context.lineTo(0,-1);context.lineTo(3,2);context.stroke();
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

  /** Use the surrounding PNG's facade textures; collision and squeeze endpoints stay authored. */
  private drawSqueezeOverlay(context: CanvasRenderingContext2D) {
    paintSqueezePassage(context, this.background, SQUEEZE_BOUNDS, SQUEEZE_OPENING_WIDTH);
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
