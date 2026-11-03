import {drawPixelCat} from '../../adapters/canvas/pixelCat';
import {followCameraPoint} from '../../adapters/canvas/camera';
import {rainyAlleyObjectEligible, rainyAlleyRegistration, rainyAlleySource, type RainyFixedObject} from './assets';
import {findPath, sweepMove} from './collision';
import {paintSqueezePassage} from './squeezePainter';
import {paintEventProp} from './eventProps';
import {RainyEventLabels, EVENT_PROP_SCALE} from './eventLabels';
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
const DOG_FRIEND_STORY_KEY = 'stray-kitty.story.laoHuang';
const DOG_FRIEND_STORY_MS = 6200;
const DOG_FRIEND_STORY_TEXT = '老黄趴在巷尾，看了你一眼……尾巴在湿漉漉的石板上轻轻拍了两下。';
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
  // 顶栏展开时小地图下移避让的当前/目标位移（canvas 逻辑像素，每帧向目标缓动）。
  private minimapShift = 0;
  private minimapShiftTarget = 0;
  // —— 老黄表现层：交互欢呼（猫头顶气泡 + 音符上飘）与一次性剧情字幕的时钟。 ——
  private cheerStart = 0;
  private cheerUntil = 0;
  private storyUntil = 0;
  private storySeen = false;

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
    context.save();
    const dog = rainyAlleySource.objects.fixed.find(object => object.id === DOG_FRIEND_ID);
    if (dog) {context.translate(dog.x, dog.y); context.scale(EVENT_PROP_SCALE, EVENT_PROP_SCALE); context.translate(-dog.x, -dog.y);}
    this.drawDogFriend(context, flags);
    context.restore();
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
    this.drawInteractBubble(context, width, height);
    this.drawCheer(context, width, height);
    this.drawStoryCaption(context, width, height);
    this.drawMinimap(context, width, height, flags);
  }

  /** 老黄像素画调色板：k 深棕轮廓（像素画的骨架，色块全靠它收边）/ l 背部受光 / m 主面 / d 腹侧暗面 / s 垂耳与爪尖 / e 眼黑 / w 口鼻与眉间白毛。 */
  private static readonly dogPalette: Readonly<Record<string, string>> = {
    k: '#3c3038', l: '#fff2d2', m: '#ead9b4', d: '#a47e66', s: '#74534d', e: '#211f25', w: '#fffbed'
  };
  /** 部件字符画（'.' 透明）：侧视趴卧、面朝左。鼻尖/口鼻在头左端，垂耳盖在头颈交界，尾巴单独两节摇摆。 */
  private static readonly dogHeadArt = [
    '..kkkkk', // 颅顶轮廓
    '.klllllk', // 受光
    '.kllllllk',
    'klwwllllk', // 眉间白毛（老狗的沧桑感）
    'kewwllllk', // 眼：兴奋叠白高光，平时叠棕条眯眼
    'kwwwwlllk', // 口鼻白毛
    '.kwwwlllk',
    '..kwwwllk',
    '...kkkkk' // 下颚轮廓
  ];
  private static readonly dogEarArt = ['.kkk.', 'ksssk', 'ksssk', 'ksssk', '.kssk', '.kssk', '..kk.'];
  private static readonly dogBodyArt = [
    '...kkkkkkkkkkkk', // 背线轮廓
    '..kllllllllllllk', // 背部受光带（高光→主面的明暗交界）
    '..kllmmmmmmmmmdk',
    '.kmmmmmmmmmmmmddk',
    '.kmmmmmmmmmmmdddk',
    '.kmmmmmmmmmmmdddk',
    '.kdddddddddddddk', // 腹侧暗面
    '..kkkkkkkkkkkkkk' // 底边轮廓
  ];
  private static readonly dogPawArt = ['kmmmk', 'kmmmk', 'ksssk']; // 前爪：爪尖深色朝左伸出
  private static readonly dogHindArt = ['.kkk.', 'kdddk', 'kdddk', 'kdddk', '.kkk.']; // 后腿蜷卧

  /** 巷尾的老黄：部件化像素画拼装，深棕描边 + 三段明暗（受光/主面/暗面）。
   *  待机动画 = 呼吸起伏（头与背上段整格轻抬，腹底四爪贴地）+ 尾巴两节慢摆；靠近或交互时呼吸变快、尾巴摇欢、睁眼抬头。 */
  private drawDogFriend(context: CanvasRenderingContext2D, _flags: readonly string[]) {
    const dog = rainyAlleySource.objects.fixed.find(object => object.id === DOG_FRIEND_ID);
    if (!dog) return;
    const near = Math.hypot(this.position.x - dog.x, this.position.y - dog.y) <= DOG_FRIEND_RADIUS;
    const excited = near || this.cheering();
    // 呼吸取整成 -1/0/1 的整格位移：既保住像素对齐，又有干脆的起伏节律。
    const breatheLift = Math.round(Math.sin(this.now / (excited ? 340 : 760)) * 0.9);
    const wag = Math.sin(this.now / (excited ? 210 : 560) * Math.PI);
    context.save();
    context.translate(dog.x, dog.y);
    // 落地投影：湿石板上的椭圆暗斑，随呼吸微微涨缩（胸腔起伏的错觉）
    context.fillStyle = 'rgba(8,16,20,.42)';
    context.beginPath(); context.ellipse(-1, 1.2, 17 + breatheLift * 0.6, 4.2, 0, 0, Math.PI * 2); context.fill();

    const palette = IntegratedRainyAlley.dogPalette;
    const u = 1.34; // 单格像素尺寸：整狗约 34×18 世界像素
    const stamp = (art: readonly string[], x: number, y: number, from = 0, to = art.length, lift = 0) => {
      for (let ry = from; ry < to; ry++) {
        const row = art[ry] ?? '';
        for (let rx = 0; rx < row.length; rx++) {
          const color = palette[row[rx]!];
          if (!color) continue;
          context.fillStyle = color;
          context.fillRect(x + rx * u, y + ry * u + lift, u + 0.5, u + 0.5); // +0.5 填缝防裂
        }
      }
    };
    // 待机动画分层：躯干上段 + 头 + 垂耳随呼吸轻抬；腹部下段、四爪始终贴地，趴得稳。
    const headLift = (this.cheering() ? 3 : 0) + breatheLift;
    // 躯干（背上两行受光带 = 高光，腹侧暗面，底部轮廓贴地）
    stamp(IntegratedRainyAlley.dogBodyArt, -11 * u, -8 * u, 0, 4, breatheLift); // 背部上段：呼吸
    stamp(IntegratedRainyAlley.dogBodyArt, -11 * u, -8 * u, 4, 8);             // 腹部下段：贴地
    // 后腿蜷卧（躯干右下）+ 前爪（左端伸出，爪尖深色）
    stamp(IntegratedRainyAlley.dogHindArt, 6.4 * u, -5 * u);
    stamp(IntegratedRainyAlley.dogPawArt, -19.5 * u, -3 * u);
    // 头：趴在前爪上方，欢呼时抬头 3px；垂耳挂在头颈交界处
    stamp(IntegratedRainyAlley.dogHeadArt, -19.5 * u, -12 * u - headLift);
    stamp(IntegratedRainyAlley.dogEarArt, -11 * u, -10.5 * u - headLift);
    // 黑鼻头（口鼻最前端）+ 一点湿鼻头反光
    const noseX = -18.6 * u, noseY = -7 * u - headLift;
    context.fillStyle = '#30252e'; context.fillRect(noseX, noseY + 0.2, u * 1.8, u * 1.5);
    context.fillStyle = 'rgba(255,255,255,.4)'; context.fillRect(noseX + 0.4, noseY + 0.5, 0.8, 0.6);
    // 眼睛：平时眯眼打盹（暖棕横条），靠近/交互时睁圆黑眼 + 白高光
    const eyeX = -18.5 * u, eyeY = -8 * u - headLift;
    if (excited) {context.fillStyle = '#ffffff'; context.fillRect(eyeX + u * 1.15, eyeY + 0.3, 0.9, 0.9);}
    else {context.fillStyle = palette.s!; context.fillRect(eyeX - 0.3, eyeY + 0.55, u * 1.7, u * 0.7);}
    // 尾巴：两节，绕尾根摆动，尾梢再带半段小角度——甩起来有“鞭梢”感
    context.save();
    context.translate(5 * u, -6.6 * u - breatheLift);
    context.rotate(wag * (excited ? 0.42 : 0.2));
    context.fillStyle = palette.k!; context.fillRect(0, -2.1, 5.6, 4.2);
    context.fillStyle = '#e2cba1'; context.fillRect(0.7, -1.4, 4.2, 2.8);
    context.fillStyle = palette.l!; context.fillRect(0.7, -1.4, 4.2, 1);
    context.translate(5.4, 0);
    context.rotate(wag * (excited ? 0.3 : 0.12));
    context.fillStyle = palette.k!; context.fillRect(-0.4, -1.7, 4.4, 3.4);
    context.fillStyle = palette.l!; context.fillRect(0.3, -1, 3.4, 2.2);
    context.restore();
    // 欢呼时从狗头顶也冒一点小心心，提示“它很开心”
    // Mint collar separates the cream coat from the warm alley lighting.
    context.fillStyle = '#293f3d'; context.fillRect(-13, -9 + breatheLift, 3.5, 8);
    context.fillStyle = '#70caba'; context.fillRect(-12.2, -8.4 + breatheLift, 2.2, 6.8);
    context.fillStyle = '#d9f5df'; context.fillRect(-11.8, -8.4 + breatheLift, .8, 4.4);
    context.fillStyle = '#e3e4bd'; context.fillRect(-11.7, -1.5 + breatheLift, 2, 2);
    if (this.cheering()) {
      const bob = Math.sin(this.now / 260) * 1.2;
      context.font = '700 9px system-ui, sans-serif';
      context.fillStyle = '#ffe9a8';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('♥', -10, -22 + bob);
    }
    context.restore();
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

  /** 一次性剧情字幕：底部居中的深色圆角条 + 米白字 + 暖金细边，头尾 0.5s 淡入淡出（星露谷过场感）。 */
  private drawStoryCaption(context: CanvasRenderingContext2D, width: number, height: number) {
    if (!this.storyUntil) return;
    const remain = this.storyUntil - performance.now();
    if (remain <= 0) {this.storyUntil = 0; return;}
    const elapsed = DOG_FRIEND_STORY_MS - remain;
    const alpha = Math.min(1, Math.min(elapsed / 480, remain / 650));
    const label = `🐾 ${DOG_FRIEND_STORY_TEXT}`;
    context.save();
    context.globalAlpha = alpha;
    context.font = '700 13px system-ui, sans-serif';
    const textWidth = context.measureText(label).width;
    const chipWidth = Math.min(textWidth + 30, width - 24), chipHeight = 30;
    const chipX = (width - chipWidth) / 2, chipY = height - chipHeight - 14;
    context.shadowColor = 'rgba(6,14,18,.55)'; context.shadowBlur = 7; context.shadowOffsetY = 2;
    context.fillStyle = 'rgba(13,24,28,.88)';
    this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 7); context.fill();
    context.shadowBlur = 0; context.shadowOffsetY = 0;
    context.strokeStyle = 'rgba(255,222,140,.55)'; context.lineWidth = 1.4;
    this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 7); context.stroke();
    context.fillStyle = '#f7f2df';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(label, width / 2, chipY + chipHeight / 2 + 0.5, chipWidth - 22);
    context.restore();
  }

  /** 猫头顶 [E] 交互气泡：靠近可交互物时浮现，小尖角指向猫、随猫移动并轻微呼吸浮动。屏幕坐标绘制，字号不受世界缩放影响。 */
  private drawInteractBubble(context: CanvasRenderingContext2D, width: number, height: number) {
    const near = this.nearby;
    if (!near) return;
    if (this.cheering()) return; // 欢呼气泡进行中让位，避免两层气泡叠在猫头顶
    const view = this.imageView(width, height);
    const registration = rainyAlleyRegistration;
    const catX = view.padX + (registration.tx + this.position.x * registration.sx - view.x) * view.scale;
    const catY = view.padY + (registration.ty + this.position.y * registration.sy - view.y) * view.scale;
    const headY = catY - 24 * registration.sy * view.scale;
    const bob = Math.sin(this.now / 380) * 2.2;
    context.save();
    context.font = '700 12px system-ui, sans-serif';
    // 只画 [E] 键帽小气泡：交互物名称已由 drawMarkers 的 emoji 标签承担（“🐕 巷尾的老黄”），
    // 猫头顶若再写一遍纯文字会与之重叠冲突；统一收成极简键帽，指向猫即可。
    const keyWidth = context.measureText('E').width + 11;
    const chipWidth = keyWidth + 12;
    const chipHeight = 22;
    const chipX = Math.min(Math.max(catX - chipWidth / 2, 8), Math.max(8, width - chipWidth - 8));
    const chipY = Math.max(headY - chipHeight - 15 + bob, 6);
    const tailX = Math.min(Math.max(catX, chipX + 8), chipX + chipWidth - 8);
    // 深色底板 + 指向猫的小尖角，带轻微投影浮起感
    context.shadowColor = 'rgba(6,14,18,.55)'; context.shadowBlur = 6; context.shadowOffsetY = 2;
    context.fillStyle = 'rgba(13,26,30,.9)';
    this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 5);
    context.fill();
    context.beginPath();
    context.moveTo(tailX - 4.5, chipY + chipHeight);
    context.lineTo(tailX + 4.5, chipY + chipHeight);
    context.lineTo(tailX, chipY + chipHeight + 6.5);
    context.closePath(); context.fill();
    context.shadowBlur = 0; context.shadowOffsetY = 0;
    context.strokeStyle = 'rgba(255,215,110,.6)'; context.lineWidth = 1.4;
    this.roundRectPath(context, chipX, chipY, chipWidth, chipHeight, 5);
    context.stroke();
    // 居中的像素键帽 [E]
    const keyX = chipX + 6, keyY = chipY + 4.5, keyH = 13;
    context.fillStyle = '#f6ecd2';
    this.roundRectPath(context, keyX, keyY, keyWidth, keyH, 3); context.fill();
    context.strokeStyle = '#1d2b28'; context.lineWidth = 1.2;
    this.roundRectPath(context, keyX, keyY, keyWidth, keyH, 3); context.stroke();
    context.fillStyle = '#1d2b28'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('E', keyX + keyWidth / 2, keyY + keyH / 2 + 0.5);
    context.restore();
  }

  private updateNearby(flags: readonly string[]) {
    const baseRadius = rainyAlleySource.objects.interactionRadius;
    const dogFriend = rainyAlleySource.objects.fixed.find(object => object.id === DOG_FRIEND_ID);
    this.nearby = rainyAlleySource.objects.fixed
      .filter(object => rainyAlleyObjectEligible(object, flags))
      .map(object => ({object, distance: Math.hypot(this.position.x - object.x, this.position.y - object.y)}))
      // 老黄的靠近提示半径更宽（趴在巷尾，隔着半条巷子就该注意到它）。
      .filter(candidate => candidate.distance <= (candidate.object.id === DOG_FRIEND_ID ? DOG_FRIEND_RADIUS : baseRadius))
      .sort((a, b) => a.distance - b.distance)[0]?.object ?? null;
    if (dogFriend && Math.hypot(this.position.x - dogFriend.x, this.position.y - dogFriend.y) <= DOG_FRIEND_RADIUS) this.tellDogStoryOnce();
  }

  /** 首次靠近老黄的一次性氛围字幕；localStorage 记录跨会话防重复（约 6 秒后自然淡出）。 */
  private tellDogStoryOnce() {
    if (this.storySeen) return;
    this.storySeen = true;
    try {
      if (localStorage.getItem(DOG_FRIEND_STORY_KEY)) return;
      localStorage.setItem(DOG_FRIEND_STORY_KEY, '1');
    } catch {/* 隐私模式下跳过记忆，本次会话只讲一遍 */}
    this.storyUntil = performance.now() + DOG_FRIEND_STORY_MS;
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

  private drawMarkers(context: CanvasRenderingContext2D, flags: readonly string[]) {
    this.drawClimbMarkers(context);
    this.drawSqueezeMarker(context);
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
    this.eventLabels.draw(context, rainyAlleySource.objects.fixed, flags, this.position, this.nearby?.id, this.now);
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
    context.fillStyle = '#183638'; context.font = '700 10px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('Q', 0, .5); context.restore();
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
      context.font = '700 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = '#183539'; context.fillText('C', 0, 0.5);
      if (active) {
        const label = 'C · 翻过木箱';
        context.font = '700 11px system-ui, sans-serif';
        context.fillStyle = 'rgba(13,26,30,.8)';
        context.fillRect(-8, -29, context.measureText(label).width + 12, 17);
        context.fillStyle = '#f7f2df'; context.textAlign = 'left'; context.fillText(label, -2, -20);
      }
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
