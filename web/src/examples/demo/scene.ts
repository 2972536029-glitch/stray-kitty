import type {BattleResult, GameState, StoryNode} from '../../contracts';
import {drawPixelCat, type CatBreed} from '../../adapters/canvas/pixelCat';
import {DemoBattle} from './battle';
import type {Direction} from '../../adapters/platform/input';
import {CanvasPainter} from '../../adapters/canvas/painter';
import {FollowCamera, type CameraFrame} from '../../adapters/canvas/camera';
import {IntegratedRainyAlley} from '../../modules/rainyAlley/IntegratedRainyAlley';
import {marketArt, marketEntry, marketItems, marketPortals, marketRoadSigns, nearestMarketRoadSign, marketEAction, marketOptionalHint, marketPortalDisplay, nearestMarketPosition, marketNearestBoundary, nightMarketSpatial, sweepMarketMove, type MarketFloor} from '../../modules/nightMarket/map';
import {measureMarketCameraFrame} from '../../modules/nightMarket/camera';

// 原生 Canvas 参考场景；地图与塔防模块可分别替换此样例。
// 花房家园的猫咪轻量 AI:pose 非空表示绑定专属家具姿态,否则按 sit→walk→sit 循环漫步。
interface HomeCatAgent {
  breed: CatBreed;
  pose: string | null;
  x: number; y: number;
  nodes: {x: number; y: number}[];
  nodeIndex: number;
  action: 'sit' | 'walk' | 'nose';
  target?: {x: number; y: number};
  thinkAt: number;
  facing: 1 | -1;
  seed: number;
  noseUntil: number;
  noseCooldownUntil: number;
  bubble: string | null;
  bubbleUntil: number;
  startledUntil: number;
}
export class DemoScene {
  state: GameState | null = null;
  pausedByUser = false;
  storyScene: StoryNode['scene'];
  private graphics: CanvasPainter;
  private context: CanvasRenderingContext2D;
  private rainyAlley: IntegratedRainyAlley;
  private cityBackdrop: HTMLImageElement;
  private marketImages: Record<MarketFloor, HTMLImageElement> = {L0:new Image(),L1:new Image(),Lm1:new Image()};
  private marketFloor: MarketFloor = 'L0';
  private marketCamera = new FollowCamera();
  private marketFrame: CameraFrame | null = null;
  private marketInitialized = false;
  private marketDebug = false;
  private marketLastMove:{floor:MarketFloor;position:{x:number;y:number};direction:{x:number;y:number};requestedDestination:{x:number;y:number};rejected:boolean;reason:string;nearestBoundary:string}={floor:'L0',position:{x:0,y:0},direction:{x:0,y:0},requestedDestination:{x:0,y:0},rejected:false,reason:'no movement attempt',nearestBoundary:'none'};
  private marketZonesSeen = new Set<string>();
  private held = new Set<Direction>();
  private keys = new Set<string>();
  private x = 180;
  private y = 290;
  private lastMode = '';
  private lastMapId = '';
  private attemptId = '';
  private simulation: DemoBattle | null = null;
  private reported = false;
  private frame = 0;
  private previousTime = 0;
  private now = 0;
  private destroyed = false;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  // 随机事件:按真实位移累计里程,每满一段上报服务端判定;贴近交互点时暂停上报。
  private moveBuffer = 0;
  private nearbyInteractionId = '';
  private squeezePromptVisible = false;
  private movementHint: string | null = null;
  randomEligible = true;
  private static readonly moveSegment = 150;
  private static readonly maxReport = 300; // 服务端单次上报上限,超出整段会被拒,剩余里程留到下一段。
  // —— 花房家园:四阶修缮 + 猫咪生活感 ——
  private homeCats: HomeCatAgent[] = [];
  private homeCatsSignature = '';
  private homeHearts: {x: number; y: number; born: number}[] = [];
  private homePokeCooldownUntil = 0;
  constructor(
    private canvas: HTMLCanvasElement,
    private onNear: (near: boolean, interactionId?: string, label?: string) => void,
    private onInteract: (interactionId?: string) => void,
    private onResult: (result: BattleResult) => void,
    private onInspectHint?: (hint: string | null) => void,
    private onMove?: (distance: number) => void,
    private onRandomZone?: (zoneId: string) => Promise<boolean>,
    private onWorldPosition?: (point: {x: number; y: number}) => void,
    private onMarketBattle?: (floor:MarketFloor,point:{x:number;y:number}) => void,
    private onMarketExit?: (floor: MarketFloor, point:{x:number;y:number}) => void,
    private onMarketZone?: (zoneId:string,floor:MarketFloor,point:{x:number;y:number}) => Promise<boolean>
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建二维画布');
    this.viewWidth = Number(canvas.dataset.logicalWidth) || canvas.width;
    this.viewHeight = Number(canvas.dataset.logicalHeight) || canvas.height;
    const dpr = Number(canvas.dataset.dpr) || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    this.context = context;
    this.graphics = new CanvasPainter(context);
    this.rainyAlley = new IntegratedRainyAlley();
    this.cityBackdrop = new Image();
    this.cityBackdrop.src = '/assets/city-backdrop.svg';
    for(const floor of Object.keys(marketArt) as MarketFloor[]) this.marketImages[floor].src=marketArt[floor];
  }
  setDirection(direction: Direction, held: boolean) {if (held) this.held.add(direction);else this.held.delete(direction);}
  private keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input,select,textarea') || target?.isContentEditable) return;
    if (this.state?.phase !== 'explore' || this.pausedByUser) return;
    const key = event.key.toLowerCase();
    if (key === 's' && !event.repeat && this.state?.mapId === 'alley' && this.rainyAlley.tryStartSqueeze()) {
      event.preventDefault(); this.keys.delete('s'); return;
    }
    if (!event.repeat && this.state?.mapId === 'market' && (key==='c'||key==='f')) {
      const pairs:Record<string,[MarketFloor,number,number,MarketFloor,number,number][]>={c:[['L0',745,287,'L1',675,257],['L0',735,408,'L1',628,368],['L0',1137,428,'L1',1260,420],['L0',859,717,'L0',933,745],['L0',1365,166,'L0',1365,88]],f:[['L0',669,674,'Lm1',651,553],['L0',1193,573,'Lm1',1170,658]]};
      for(const [a,ax,ay,b,bx,by] of pairs[key]??[]) {
        if(this.marketFloor===a&&Math.hypot(this.x-ax,this.y-ay)<44&&!(ax===1365&&!this.state.flags.includes('market_cleared'))){if(ax===1365){this.onMarketExit?.('L0',{x:1365,y:88});return;}const landing=nearestMarketPosition(b,bx,by,this.state.flags.includes('market_cleared'));if(!landing)continue;this.marketFloor=b;this.x=landing.x;this.y=landing.y;this.snapMarketCamera();break;}
        if(this.marketFloor===b&&Math.hypot(this.x-bx,this.y-by)<44&&!(ax===1365&&!this.state.flags.includes('market_cleared'))){const landing=nearestMarketPosition(a,ax,ay,this.state.flags.includes('market_cleared'));if(!landing)continue;this.marketFloor=a;this.x=landing.x;this.y=landing.y;this.snapMarketCamera();break;}
      }
      event.preventDefault();
    }
    if(import.meta.env.DEV&&key==='g'&&!event.repeat&&this.state?.mapId==='market')this.marketDebug=!this.marketDebug;
    if(import.meta.env.DEV&&key==='y'&&!event.repeat&&this.marketDebug&&this.state?.mapId==='market'){
      event.preventDefault();const text=JSON.stringify(this.marketLastMove,null,2);
      if(navigator.clipboard?.writeText)void navigator.clipboard.writeText(text).then(()=>this.onInspectHint?.('碰撞诊断已复制')).catch(()=>this.onInspectHint?.('复制失败，请使用开发者工具查看诊断'));
      else window.prompt('复制 Night Market 碰撞诊断',text);
      return;
    }
    if (key === 'c' && !event.repeat && this.state?.mapId === 'alley' && this.rainyAlley.tryStartCrateClimb()) {
      event.preventDefault(); this.keys.delete('c'); return;
    }
    this.keys.add(key);
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','g','c'].includes(key)) event.preventDefault();
    if (key === 'g' && !event.repeat && this.state?.mapId === 'alley') this.rainyAlley.toggleDebug();
    if (key === 'e' && !event.repeat) {
      if (this.state?.mapId === 'market') {
        const action=marketEAction(this.marketFloor,this.x,this.y,this.state.flags,this.state.drawnEvents??[]);
        if(action?.type==='interact')this.onInteract(action.id);
        else if(action?.type==='battle')this.onMarketBattle?.('L0',{x:this.x,y:this.y});
        else if(action?.type==='hint')this.onInspectHint?.(action.text);
      } else if (this.state?.mapId === 'alley') {
        const interaction = this.rainyAlley.nearestInteraction();
        if (interaction) this.onInteract(interaction.id);
      }
    }
  };
  private keyup = (event: KeyboardEvent) => {this.keys.delete(event.key.toLowerCase());};
  private clearInput = () => {this.keys.clear();this.held.clear();};
  private pointerdown = (event: PointerEvent) => {
    if (this.state?.phase === 'explore' && this.state.mapId === 'alley' && !this.pausedByUser) {
      const bounds = this.canvas.getBoundingClientRect();
      const cover = getComputedStyle(this.canvas).objectFit === 'cover';
      this.rainyAlley.click(event.clientX, event.clientY, bounds, this.viewWidth, this.viewHeight, cover);
      return;
    }
    if (this.state?.phase === 'home' && this.state.chapterId !== 'prologue' && !this.pausedByUser) {
      const bounds = this.canvas.getBoundingClientRect();
      const cover = getComputedStyle(this.canvas).objectFit === 'cover';
      const scale = (cover ? Math.max : Math.min)(bounds.width / this.viewWidth, bounds.height / this.viewHeight);
      const x = (event.clientX - bounds.left - (bounds.width - this.viewWidth * scale) / 2) / scale;
      const y = (event.clientY - bounds.top - (bounds.height - this.viewHeight * scale) / 2) / scale;
      this.pokeHomeCat(x, y);
      return;
    }
    if (this.state?.phase !== 'battle' || this.pausedByUser || !this.simulation) return;
    const bounds = this.canvas.getBoundingClientRect();
    const cover = getComputedStyle(this.canvas).objectFit === 'cover';
    const scale = (cover ? Math.max : Math.min)(bounds.width / this.viewWidth, bounds.height / this.viewHeight);
    const x = (event.clientX - bounds.left - (bounds.width - this.viewWidth * scale) / 2) / scale;
    const y = (event.clientY - bounds.top - (bounds.height - this.viewHeight * scale) / 2) / scale;
    if (x >= 150 && x < 580 && y >= 145 && y < 391) this.simulation.place(Math.floor((y - 145) / 82), Math.floor((x - 150) / 86));
  };
  start() {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clearInput);
    this.canvas.addEventListener('pointerdown', this.pointerdown);
    this.previousTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  destroy() {
    this.destroyed = true;cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clearInput);
    this.canvas.removeEventListener('pointerdown', this.pointerdown);
    this.clearInput();
  }
  private tick = (timestamp: number) => {
    if (this.destroyed) return;
    const delta = Math.min(timestamp - this.previousTime, 50);this.previousTime = timestamp;this.now = timestamp;
    this.update(delta);this.frame = requestAnimationFrame(this.tick);
  };
  private update(delta: number) {
    if (!this.state) return;
    if (this.state.mapId === 'market' || this.storyScene === 'market') this.marketFrame=measureMarketCameraFrame(this.canvas,this.viewWidth,this.viewHeight);
    const mode = this.state.phase;
    if (mode !== this.lastMode || this.state.mapId !== this.lastMapId) {
      const mapChanged = this.state.mapId !== this.lastMapId;
      this.held.clear();
      if (mode === 'explore') {
        if (this.state.mapId === 'alley') {
          if (mapChanged || (this.lastMode === 'dialogue' && this.state.flags.includes('alley_rescued'))) this.rainyAlley.reset(this.state.flags, this.state.alleyBattleReturn);
        } else {
          if (!this.marketInitialized) {
            this.marketFloor=this.state.flags.includes('market_cleared')?'L0':marketEntry.floor;
            this.x = this.state.flags.includes('market_cleared') ? 1310 : marketEntry.x;
            this.y = this.state.flags.includes('market_cleared') ? 169 : marketEntry.y;
            this.marketInitialized=true;
          }
          this.snapMarketCamera();
        }
      }
      this.moveBuffer = 0;
      this.nearbyInteractionId = '';
      this.squeezePromptVisible = false;
      this.movementHint = null;
      this.onInspectHint?.(null);
      this.onNear(false);
      if (mode === 'event') this.rainyAlley.pauseForEvent();
      this.lastMode = mode;
      this.lastMapId = this.state.mapId;
    }
    if (mode === 'battle' && this.state.activeBattle && this.attemptId !== this.state.activeBattle.id) {
      const modifiers = this.state.activeBattle.modifiers;
      this.attemptId = this.state.activeBattle.id;this.simulation = new DemoBattle(3, 2, !modifiers && this.state.flags.includes('event_success'), modifiers?.shadowPressure ?? 0);this.reported = false;
    }
    const active = !this.pausedByUser && document.visibilityState !== 'hidden';
    if (!active) this.clearInput();
    if (mode === 'explore' && active && this.state.mapId === 'alley') {
      const dx = Number(this.keys.has('arrowright') || this.keys.has('d') || this.held.has('right')) - Number(this.keys.has('arrowleft') || this.keys.has('a') || this.held.has('left'));
      const dy = Number(this.keys.has('arrowdown') || this.keys.has('s') || this.held.has('down')) - Number(this.keys.has('arrowup') || this.keys.has('w') || this.held.has('up'));
      this.rainyAlley.move(delta / 1000, dx, dy, this.state.flags, zoneId => this.onRandomZone?.(zoneId) ?? Promise.resolve(false));
      const interaction = this.rainyAlley.nearestInteraction();
      const interactionId = interaction?.id ?? '';
      if (interactionId !== this.nearbyInteractionId) {
        this.nearbyInteractionId = interactionId;
        this.onNear(!!interaction, interaction?.id, interaction ? `${interaction.label} · E` : undefined);
        this.onInspectHint?.(null);
      }
      const squeezePrompt = this.rainyAlley.squeezePromptActive();
      const climbPrompt = this.rainyAlley.climbPromptActive();
      const hint = climbPrompt ? 'C · 爬过木箱' : squeezePrompt ? 'S · 挤过去' : null;
      const showPrompt = !!hint;
      if (showPrompt !== this.squeezePromptVisible || hint !== this.movementHint) {
        this.squeezePromptVisible = showPrompt;
        this.movementHint = hint;
        this.onInspectHint?.(hint);
      }
      this.onWorldPosition?.(this.rainyAlley.worldPosition());
    } else if (mode === 'explore' && active) {
      let dx = Number(this.keys.has('arrowright') || this.keys.has('d') || this.held.has('right')) - Number(this.keys.has('arrowleft') || this.keys.has('a') || this.held.has('left'));
      let dy = Number(this.keys.has('arrowdown') || this.keys.has('s') || this.held.has('down')) - Number(this.keys.has('arrowup') || this.keys.has('w') || this.held.has('up'));
      const distance = Math.hypot(dx, dy);if (distance) {dx /= distance;dy /= distance;}
      const previousX = this.x, previousY = this.y;
      if(this.state.mapId==='market') {
        const requested={x:this.x+dx*delta*.18,y:this.y+dy*delta*.18},result=sweepMarketMove(this.marketFloor,{x:this.x,y:this.y},{x:dx*delta*.18,y:dy*delta*.18},this.state.flags.includes('market_cleared'));
        this.x=result.position.x;this.y=result.position.y;
        if(dx||dy){const blockedAt=result.blockedAt??requested;this.marketLastMove={floor:this.marketFloor,position:{x:previousX,y:previousY},direction:{x:dx,y:dy},requestedDestination:requested,rejected:result.blocked,reason:result.condition??'none',nearestBoundary:result.blocked?marketNearestBoundary(this.marketFloor,blockedAt.x,blockedAt.y):'none'};}
      } else { this.x = Math.min(710, Math.max(90, this.x + dx * delta * .18)); this.y = Math.min(410, Math.max(205, this.y + dy * delta * .18)); }
      let nearInteraction = false;

      if (this.state.mapId === 'alley') {
        if (this.x > 325 && this.x < 445 && this.y > 320 && this.y < 385) this.y = dy > 0 ? 319 : 386;
        const nearCrate = Math.hypot(this.x - 570, this.y - 290) < 78 && !this.state.flags.includes('alley_rescued');
        nearInteraction = nearCrate;
        this.onNear(nearCrate, 'alley_crate', '查看纸箱 · E');

        let inspect: string | null = null;
        if (Math.hypot(this.x - 225, this.y - 330) < 55) {
          inspect = '【雨水倒影】水里的毛发全都沾了泥点子……两脚兽要是看到，肯定又要心疼地拿热毛巾抱我了。';
        } else if (Math.hypot(this.x - 165, this.y - 200) < 55) {
          inspect = '【墙角抓痕】墙砖上留着好几道焦急的抓痕……似乎曾有猫在这里激烈挣扎逃避什么。';
        } else if (Math.hypot(this.x - 310, this.y - 260) < 55) {
          inspect = '【空鱼罐头】被雨水洗刷干净的破罐头。看来流浪的伙伴们经常要忍饥挨饿。';
        } else if (nearCrate) {
          inspect = '【潮湿纸箱】纸箱深处传出瑟瑟发抖的微弱喵呜声……快靠近查看！';
        }
        this.onInspectHint?.(inspect);
      } else if (this.state.mapId === 'market') {
        const clueFlags:Record<string,string>={crow:'market_crow_clue_completed',pigeon:'market_pigeon_clue_completed'};
        const nearestItem=marketItems.filter(item=>(item.kind==='fixed'||item.kind==='optional')&&item.layer===this.marketFloor&&(!clueFlags[item.id]||!this.state!.flags.includes(clueFlags[item.id]))&&!(item.id==='momo'&&this.state!.drawnEvents?.includes('node:momo_trail_event'))).map(item=>({item,distance:Math.hypot(this.x-item.x,this.y-item.y)})).filter(value=>value.distance<=75).sort((a,b)=>a.distance-b.distance)[0]?.item;
        const nearCrow = nearestItem?.id==='crow';
        const nearPigeon = nearestItem?.id==='pigeon';
        const nearMomo = nearestItem?.id==='momo';
        nearInteraction = !!nearestItem;
        const traversalNearby=marketPortals.some(value=>(!value.requiresFlag||this.state!.flags.includes(value.requiresFlag))&&[value.a,value.b].some(point=>point.layer===this.marketFloor&&Math.hypot(this.x-point.x,this.y-point.y)<=44));
        if (nearCrow) {
          this.onNear(true, 'market_crow_stall', '老黑羽的情报摊 · E');
        } else if (nearPigeon) {
          this.onNear(true, 'market_pigeon_perch', '咕咕大盗的传言棚 · E');
        } else if(nearMomo&&!traversalNearby) {
          this.onNear(true,'market_momo_trace','墨墨的踪迹 · E');
        } else {
          this.onNear(false);
        }

        let inspect: string | null = null;
        if (nearCrow) {
          inspect = '【老黑羽的情报摊】一只戴着单片眼镜的老乌鸦打量着你们：“小猫咪，想要城北还是避难所的情报？”';
        } else if (nearPigeon) {
          inspect = '【咕咕大盗的传言棚】一只挂着红领巾的胖鸽子低声道：“听说冷冻库那边有黑影在抓走失的宠物猫……”';
        } else if (Math.hypot(this.x - 420, this.y - 220) < 65) {
          inspect = '【午夜风干鱼架】木架上晾晒着整齐的小鱼干，散发着诱人的海盐香味。';
        } else if (Math.hypot(this.x - 130, this.y - 310) < 55) {
          inspect = '【团子】“喵喵，集市里的鸟雀们消息很灵通，我们去打听一下吧！”';
        }
        if(nearestItem?.id==='momo')inspect='E · 查看墨墨的踪迹';
        this.onInspectHint?.(inspect);
        const bossReady=this.state.flags.includes('market_crow_clue_completed')&&this.state.flags.includes('market_pigeon_clue_completed');
        if(nearMomo)this.onInspectHint?.('E · 查看墨墨的踪迹');
        const portal=marketPortals.filter(value=>!value.requiresFlag||this.state!.flags.includes(value.requiresFlag)).flatMap(value=>[{portal:value,point:value.a},{portal:value,point:value.b}]).filter(value=>value.point.layer===this.marketFloor&&Math.hypot(this.x-value.point.x,this.y-value.point.y)<=value.portal.radius).sort((a,b)=>Math.hypot(this.x-a.point.x,this.y-a.point.y)-Math.hypot(this.x-b.point.x,this.y-b.point.y))[0];
        if(portal)this.onInspectHint?.(`${portal.portal.key.toUpperCase()} · ${portal.portal.label.split(' · ')[1]}`);
        else if(!nearestItem&&this.marketFloor==='L0'&&Math.hypot(this.x-1310,this.y-169)<72&&!bossReady)this.onInspectHint?.('集市保卫战 · 需要先完成两条情报');
        else if(!nearestItem&&this.marketFloor==='L0'&&Math.hypot(this.x-1365,this.y-78)<48&&!this.state.flags.includes('market_cleared'))this.onInspectHint?.('北街出口 · 请先完成集市保卫战');
        const battleAction=marketEAction(this.marketFloor,this.x,this.y,this.state.flags,this.state.drawnEvents??[]);
        if(battleAction?.type==='battle')this.onInspectHint?.('E · 开始集市保卫战');
        else if(battleAction?.type==='hint')this.onInspectHint?.(battleAction.text);
        const authoredFocus=!!nearestItem||!!portal||Math.hypot(this.x-1310,this.y-169)<=75||Math.hypot(this.x-1365,this.y-78)<=48;
        if(!authoredFocus){const clueHint=marketOptionalHint(this.marketFloor,this.x,this.y,!!this.state.drawnEvents?.includes('node:momo_trail_event'));if(clueHint)this.onInspectHint?.(clueHint);}
        if(!authoredFocus)for(const [id,floor,x,y] of [['market_random_r1','L0',652,632],['market_random_r2','L1',680,166],['market_random_r3','Lm1',975,429]] as const){
          const inside=this.marketFloor===floor&&Math.hypot(this.x-x,this.y-y)<42;
          if(!inside)this.marketZonesSeen.delete(id);else if(!this.marketZonesSeen.has(id)){this.marketZonesSeen.add(id);void this.onMarketZone?.(id,floor,{x:this.x,y:this.y});}
        }
        this.onWorldPosition?.({x:this.x,y:this.y});
        this.marketCamera.update({x:this.x,y:this.y},this.marketCameraFrame(),1672,941,delta/1000);
      }
      const moved = Math.hypot(this.x - previousX, this.y - previousY);
      if (moved > 0 && !nearInteraction && this.state.mapId !== 'market') {
        this.moveBuffer += moved;
        if (this.moveBuffer >= DemoScene.moveSegment) {
          const report = Math.min(Math.round(this.moveBuffer), DemoScene.maxReport);
          this.moveBuffer -= report;
          this.onMove?.(report);
        }
      }
    }
    if (mode === 'battle' && active && this.simulation) {
      this.simulation.update(delta / 1000);
      if (this.simulation.outcome && !this.reported) {this.reported = true;this.onResult({attemptId: this.attemptId, outcome: this.simulation.outcome});}
    }
    // 花房家园:猫咪漫步/碰鼻礼状态机步进(序章自家是静态场景,不参与)。
    if ((mode === 'home' || (mode === 'dialogue' && this.storyScene === 'home')) && this.state.chapterId !== 'prologue' && active) {
      this.stepHomeCats(delta, this.homeStage());
    }
    this.graphics.clear();
    // CanvasPainter.fillStyle() changes globalAlpha; clearRect() does not reset it.
    // Reset frame-wide compositing before drawing the integrated background and cat.
    this.context.globalAlpha = 1;
    this.context.globalCompositeOperation = 'source-over';
    this.context.imageSmoothingEnabled = false;
    if (mode === 'battle') this.drawBattle();
    else if (mode === 'dialogue' && this.storyScene === 'home') this.drawHome();
    else if (mode === 'dialogue' && this.storyScene === 'tunnel') this.drawTunnel();
    else if (this.state.mapId === 'tunnel' || this.storyScene === 'tunnel') this.drawTunnel();
    else if (this.state.mapId === 'market' || this.storyScene === 'market') this.drawMarket();
    else if (mode === 'home' || this.state.mapId === 'greenhouse') this.drawHome();
    else if (this.state.mapId === 'alley') this.rainyAlley.draw(this.context, this.viewWidth, this.viewHeight, this.state.flags, {phase: mode, eventId: this.state.pendingEventId, pendingEventSource: this.state.pendingEventSource, randomEligible: this.randomEligible});
    else this.drawAlley();
    if (this.pausedByUser) {this.graphics.fillStyle(0x18282a, .6);this.graphics.fillRect(0, 0, 800, 480);}
  }
  private rect(x:number,y:number,w:number,h:number,color:number,alpha=1){this.graphics.fillStyle(color,alpha);this.graphics.fillRect(Math.round(x),Math.round(y),w,h);}
  private cat(x:number,y:number,breed:CatBreed='miaomiao'){this.graphics.cat(x,y,breed);}
  private lamp(x:number,y:number){this.graphics.fillStyle(0xf9d78a,.12);this.graphics.fillCircle(x,y,45);this.rect(x-8,y-18,16,24,0x60786c);this.rect(x-5,y-15,10,16,0xffe1a0);this.rect(x-11,y+6,22,5,0x496259);}
  private drawAlley(){
    this.rect(0,0,800,480,0x738f98);
    if(this.cityBackdrop.complete && this.cityBackdrop.naturalWidth > 0)this.graphics.image(this.cityBackdrop,0,-150,800,450);
    this.rect(35,200,730,230,0x78928c);this.rect(65,205,670,225,0xa6b7a6);
    for(let y=175;y<430;y+=30)for(let x=70+(y%60===25?20:0);x<730;x+=42)this.rect(x,y,36,2,0x718f84,.35);
    this.rect(30,65,235,130,0x53716d);this.rect(25,57,245,18,0x354f53);this.rect(90,98,58,58,0x304e55);this.rect(95,103,48,48,0xc5bd82);
    this.rect(520,50,250,145,0x48636a);this.rect(508,43,270,20,0x304d57);this.rect(625,80,72,70,0x294750);this.rect(630,85,62,60,0xcabd83);
    this.rect(655,88,6,60,0x56746e);this.rect(630,113,62,6,0x56746e);
    // 墙角抓痕
    for(let i=0;i<3;i++) this.rect(160+i*6,122+i*3,2,14,0x3d5854);
    this.rect(348,336,75,35,0x697f65);for(let i=0;i<7;i++)this.rect(353+i*10,324-(i%2)*8,8,22,0x557553);
    // 空鱼罐头
    this.rect(305,258,14,8,0x829497);this.rect(307,256,10,2,0xa5b8bb);
    // 雨水倒影水洼
    this.rect(205,330,56,18,0x476a70,0.7);this.rect(215,333,36,11,0x729ea3,0.85);this.rect(222,335,14,5,0xc1dde0,0.75);
    // 纸箱与点点
    this.rect(543,285,56,34,0xad8b64);this.rect(538,279,66,11,0xc2a179);this.rect(563,290,15,20,0x7f694e);
    this.lamp(475,190);if(!this.state?.flags.includes('alley_rescued'))this.cat(570,279,'diandian');this.cat(this.x,this.y);
    this.rect(70,440,660,4,0xd3cfb5,.4);
    for(let i=0;i<16;i++){const rx=(i*73+this.now*.015)%800;this.rect(rx,(i*51+this.now*.12)%480,1,8,0xcbdad4,.2);}
  }
  private drawBattle(){
    const sim=this.simulation;if(!sim)return;
    this.rect(0,0,800,480,0x293d3d);this.rect(48,98,710,310,0x7a9980);this.rect(72,120,654,280,0x66886e);
    for(let lane=0;lane<3;lane++){this.rect(88,145+lane*82,642,76,lane%2?0x97ad88:0xa6b691);for(let col=0;col<5;col++)this.rect(151+col*86,146+lane*82,82,72,0xc4c6a1,.16);this.cat(65,190+lane*82,lane===1?'tuanzi':'miaomiao');}
    for(const p of sim.placed){const x=191+p.column*86,y=190+p.lane*82;this.lamp(x,y);this.rect(x+10,y-8,520-x,3,0xffe3a0,.18);}
    for(const s of sim.shadows){this.rect(s.x-14,168+s.lane*82,29,34,0x344454);this.rect(s.x-20,180+s.lane*82,40,24,0x344454);this.rect(s.x-8,176+s.lane*82,4,4,0xd8d0bb);this.rect(s.x+6,176+s.lane*82,4,4,0xd8d0bb);}
    // 画布中的资源条来自局内模拟，不写入长期存档。
    for(let i=0;i<sim.energy;i++)this.rect(65+i*16,61,11,14,0xf4d389);
    for(let i=0;i<sim.lives;i++)this.rect(650+i*22,60,15,15,0xd6a795);
  }
  // —— 花房四阶色板:阶段 1 冷灰漏雨 → 阶段 2 干燥暖黄 → 阶段 3+ 原木暖光 ——
  private static readonly homePalettes: Record<number, {outer: number; roof: number; wall: number; pane: number; frame: number; floor: number; floorLine: number; pot: number; leaf: number}> = {
    1: {outer: 0x8fa3ab, roof: 0x46636a, wall: 0xaab4aa, pane: 0x93b2c0, frame: 0x55706c, floor: 0x948c74, floorLine: 0x7c755f, pot: 0x6f7c64, leaf: 0x516f56},
    2: {outer: 0xa6bba0, roof: 0x5c7a66, wall: 0xd6d2ae, pane: 0xc7dccf, frame: 0x6d8d78, floor: 0xc0a47a, floorLine: 0xa4865c, pot: 0x7d8a6a, leaf: 0x5f8562},
    3: {outer: 0xa8bda2, roof: 0x64795a, wall: 0xdcd4b0, pane: 0xd6e4cd, frame: 0x748562, floor: 0xc8a878, floorLine: 0xab8a58, pot: 0x828f6c, leaf: 0x648a66},
    4: {outer: 0xa8bda2, roof: 0x64795a, wall: 0xe0d6b2, pane: 0xdce8d2, frame: 0x748562, floor: 0xcdae80, floorLine: 0xb08f5e, pot: 0x828f6c, leaf: 0x648a66}
  };
  // 槽位坐标(与 HomePanel 的摆放一致);beam 挂在横梁下、sun_spot 是天窗阳光地板。
  private static readonly homeSlots: Readonly<Record<string, readonly [number, number]>> = {corner: [195, 365], window: [490, 270], courtyard: [625, 365], beam: [400, 176], sun_spot: [558, 322]};
  // 自由漫步的安全路点(阶段 2+ 修缮封窗后才敢离开纸箱远走)。
  private static readonly homeRoamNodes: readonly {x: number; y: number}[] = [{x: 265, y: 376}, {x: 348, y: 398}, {x: 452, y: 386}, {x: 548, y: 404}, {x: 618, y: 372}, {x: 320, y: 332}, {x: 520, y: 344}];
  // 阶段 1:大家只敢紧靠角落纸箱边避雨。
  private static readonly homeShelterNodes: readonly {x: number; y: number}[] = [{x: 176, y: 390}, {x: 224, y: 400}, {x: 240, y: 364}];
  private static readonly homeCatDefaults: Record<CatBreed, [number, number]> = {miaomiao: [265, 356], tuanzi: [390, 344], diandian: [515, 358], momo: [190, 268]};
  // 家具专属偏好:场上摆了对应家具,这只猫就固定待在家具旁摆出专属姿态。
  private static readonly homeAffinities: readonly {breed: CatBreed; poses: Readonly<Record<string, string>>}[] = [
    {breed: 'momo', poses: {moon_hammock: 'hammock_sleep'}},
    {breed: 'tuanzi', poses: {snack_cushion: 'knead', blue_bowl: 'bowl_eat'}},
    {breed: 'diandian', poses: {box_castle: 'castle_peek'}},
    {breed: 'miaomiao', poses: {soft_blanket: 'belly', sun_lamp: 'belly'}}
  ];
  private static readonly pokeLines: Record<CatBreed, string> = {
    miaomiao: '（傲娇扭头）哼，本咪只是允许你碰一下下……就一下！',
    tuanzi: '咕噜噜……两脚兽，你口袋里有藏小鱼干吗？',
    diandian: '（小心探头）……有你在，这里好安全。',
    momo: '（目光如炬）……四周很安全，放心休息吧。'
  };
  // 花房阶段:1 漏雨避雨处 → 2 封窗止水(greenhouse_sealed) → 3 原木温室(greenhouse_fortified_full) → 4 王国庆典(剧情 flag)。
  private homeStage(): number {
    const flags = this.state?.flags ?? [];
    if (flags.includes('finale_completed') || flags.includes('kingdom_founded')) return 4;
    if (flags.includes('greenhouse_fortified_full')) return 3;
    if (flags.includes('greenhouse_sealed')) return 2;
    return 1;
  }
  private drawHome(){
    if(this.state?.chapterId === 'prologue'){this.drawPrologueHome();return;}
    const stage = this.homeStage();
    this.drawHomeBackdrop(stage);
    this.drawHomeSunbeams(stage);
    this.drawHomeFurniture(stage);
    this.drawHomeCats(stage);
    this.drawHomeFx(stage);
  }
  // 序章:喵喵原本的家,午后阳光与天蓝色饭碗(静态,不参与花房修缮系统)。
  private drawPrologueHome(){
    this.rect(0,0,800,480,0xa6bba0);this.rect(110,65,580,350,0xd2d0ab);this.rect(100,61,600,18,0x688775);
    for(let x=110;x<=690;x+=145)this.rect(x,78,8,230,0x799782);
    this.rect(118,310,563,100,0xbba982);for(let y=320;y<410;y+=22)this.rect(118,y,563,2,0x9f916f,.6);
    this.rect(270,88,260,173,0xb2c8b6);this.rect(395,88,8,173,0x7c9986);this.rect(270,164,260,8,0x7c9986);
    this.rect(135,240,55,75,0x8f9c73);for(let i=0;i<5;i++)this.rect(130+i*13,210-(i%2)*18,14,45,0x6d8d6a);
    this.cat(265,350);
    this.rect(235, 345, 65, 24, 0xc69482);
    this.rect(240, 348, 55, 18, 0xe0c7a0);
    this.rect(335-27, 350+4, 54, 17, 0x0878c9);
    this.rect(335-31, 350, 62, 8, 0x47b4e6);
    this.rect(335-20, 350-3, 40, 8, 0xefe0b3);
    this.graphics.fillStyle(0xfff0ad, 0.15);
    this.graphics.fillCircle(280, 340, 70);
    this.lamp(610,200);for(let i=0;i<8;i++)this.rect(145+i*70,98+(i%2)*6,5,9,0xf4d68e);
  }
  // 背景层:墙体/窗/地板/横梁/水洼与玄关,随修缮阶段换色与细节。
  private drawHomeBackdrop(stage:number){
    const palette = DemoScene.homePalettes[Math.min(stage, 4)];
    this.rect(0,0,800,480,palette.outer);
    this.rect(110,65,580,350,palette.wall);this.rect(100,61,600,18,palette.roof);
    for(let x=110;x<=690;x+=145)this.rect(x,78,8,230,palette.frame);
    this.rect(118,310,563,100,palette.floor);for(let y=320;y<410;y+=22)this.rect(118,y,563,2,palette.floorLine,.6);
    // 大窗:阶段 1 残破裂纹;阶段 2+ 钉上整齐木板;阶段 3+ 擦得透亮。
    this.rect(270,88,260,173,palette.pane);
    if(stage===1){
      this.rect(300,120,44,3,0xdfe9ec,.8);this.rect(332,122,3,34,0xdfe9ec,.8);this.rect(486,196,38,3,0xdfe9ec,.8);this.rect(486,150,3,49,0xdfe9ec,.8);
      this.rect(288,96,26,22,0x7e99a5);this.rect(296,102,10,10,palette.outer);
    } else {
      for(let i=0;i<3;i++){this.rect(276,108+i*48,248,16,0xa8814f);this.rect(276,108+i*48,248,3,0xc59a63);this.rect(392,104+i*48,10,24,0x6b4f30);this.rect(282,104+i*48,10,24,0x6b4f30);}
    }
    this.rect(395,88,8,173,palette.frame);this.rect(270,164,260,8,palette.frame);
    this.rect(270,88,260,4,palette.roof);this.rect(270,257,260,4,palette.roof);
    // 阶段 3+:原木横梁与高空爬架支柱。
    if(stage>=3){
      this.rect(96,134,608,18,0x8a6a44);this.rect(96,134,608,4,0xa8835a);this.rect(96,146,608,6,0x6e5233);
      for(let x=112;x<700;x+=96)this.rect(x,128,5,30,0x6e5233);
      this.rect(124,152,7,266,0x7c5f3d);this.rect(669,152,7,266,0x7c5f3d);
      this.rect(124,414,560,5,0x8a6a44);
    }
    // 盆栽绿植随阶段复苏。
    this.rect(135,240,55,75,palette.pot);for(let i=0;i<5;i++)this.rect(130+i*13,210-(i%2)*18,14,45,palette.leaf);
    this.rect(655,300,40,86,palette.pot);this.rect(663,268,24,36,palette.leaf);
    // 阶段 1:地面反光水洼;修缮后晒干消失。
    if(stage===1){
      this.rect(296,352,58,16,0x476a70,.55);this.rect(304,355,42,10,0x6f9ba1,.7);this.rect(316,357,16,5,0xbcd9dc,.6);
      this.rect(470,388,64,16,0x476a70,.5);this.rect(478,391,48,10,0x6f9ba1,.65);
    }
    // 阶段 4:玄关处街坊送来的彩色水碗、罐头与毛毯。
    if(stage>=4){
      this.rect(622,380,26,10,0x546e7a);this.rect(624,382,22,6,0x81d4fa);
      this.rect(652,384,26,10,0x8d6e63);this.rect(654,386,22,6,0xffcc80);
      this.rect(640,368,22,10,0xef5350);this.rect(642,370,18,7,0xffcdd2);
      this.rect(678,372,16,18,0xb0bec5);this.rect(680,374,12,6,0xcfd8dc);this.rect(680,381,12,6,0xef9a9a);
      this.rect(612,398,54,8,0xd8869b);this.rect(612,392,50,8,0xe8a7b8);this.rect(612,387,44,7,0xf3c1cd);
    }
    // 暖灯串:漏雨阶段只留一盏昏灯,封窗修缮后挂满。
    this.lamp(610,200);
    if(stage>=2)for(let i=0;i<8;i++)this.rect(145+i*70,98+(i%2)*6,5,9,0xf4d68e);
  }
  // 阶段 3+:温室玻璃透进的条形阳光光斑(斜切矩形光柱 + 地板光池)。
  private drawHomeSunbeams(stage:number){
    if(stage<3)return;
    const ctx = this.context;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for(const [x, w] of [[318, 46], [404, 34], [478, 50]] as const){
      ctx.save();
      ctx.transform(1, 0, -0.34, 1, 0, 0);
      this.rect(x + 96, 84, w, 236, 0xffe9a8, stage >= 4 ? 0.13 : 0.11);
      this.rect(x + 112, 84, Math.max(6, w - 26), 236, 0xfff3c4, 0.08);
      ctx.restore();
    }
    ctx.restore();
    this.graphics.fillStyle(0xffe9a8, 0.1);
    this.graphics.fillCircle(558, 322, 52);
    this.graphics.fillStyle(0xfff3c4, 0.08);
    this.graphics.fillCircle(558, 322, 30);
  }
  // 家具层:按槽位摆放逐件绘制;moon_hammock 的挂绳通向横梁。
  private drawFurniturePiece(id:string,x:number,y:number,stage:number){
    if(id==='tin_lamp'||id==='sun_lamp'){this.lamp(x,y);return;}
    if(id==='blue_bowl'){this.rect(x-27,y+4,54,17,0x0878c9);this.rect(x-31,y,62,8,0x47b4e6);this.rect(x-20,y-3,40,8,0xefe0b3);return;}
    if(id==='box_castle'){this.rect(x-30,y-18,60,46,0xd5a44b);this.rect(x-34,y-27,15,15,0xeac474);this.rect(x-7,y-27,15,15,0xeac474);this.rect(x+20,y-27,15,15,0xeac474);this.rect(x-9,y+2,18,26,0x835b36);return;}
    if(id==='moon_hammock'){
      const ropeTop = stage>=3 ? 150 : y-46;
      this.rect(x-20,ropeTop,2,y-ropeTop-12,0xbfa06a,.9);this.rect(x+18,ropeTop,2,y-ropeTop-12,0xbfa06a,.9);
      this.rect(x-24,y-12,48,6,0xf2e2ac);this.rect(x-26,y-8,52,6,0xe7cf92);this.rect(x-20,y-2,40,4,0xd9bd7e);
      this.rect(x-28,y-13,6,9,0xe7cf92);this.rect(x+22,y-13,6,9,0xe7cf92);
      return;
    }
    if(id==='snack_cushion'){this.rect(x-26,y-4,52,22,0xd9a05f);this.rect(x-20,y,40,13,0xf0c98d);this.rect(x-9,y+3,18,4,0xb47a3f);this.rect(x-3,y+1,3,3,0x8d6134);this.rect(x+4,y+4,3,3,0x8d6134);return;}
    if(id==='cardboard_nest'){this.rect(x-24,y-14,48,32,0xad8b64);this.rect(x-27,y-19,54,8,0xc2a179);this.rect(x-12,y-6,24,22,0x7f694e);return;}
    if(id==='star_glass'){this.rect(x-2,y-44,4,30,0x8b8f9a);this.rect(x-10,y-16,20,8,0x9fa8b8);for(let i=0;i<3;i++)this.rect(x-7+i*6,y-8,4,8,i===1?0xfff4c2:0xdfe9ff);this.graphics.fillStyle(0xcfe0ff,.14);this.graphics.fillCircle(x,y,34);return;}
    if(id==='cloud_nest'){this.rect(x-26,y-8,52,20,0xf3ecdd);this.rect(x-20,y-14,12,8,0xf8f3e7);this.rect(x+8,y-14,12,8,0xf8f3e7);this.rect(x-18,y-4,36,12,0xe4dcc8);return;}
    this.rect(x-28,y,58,24,id==='red_cushion'?0xe31b23:id==='soft_blanket'?0xc69482:0xa88962);
    this.rect(x-22,y+4,46,12,id==='red_cushion'?0xff8a80:0xe0c7a0);
  }
  private drawHomeFurniture(stage:number){
    for(const [slot,id] of Object.entries(this.state?.placements??{})){
      const [x,y]=DemoScene.homeSlots[slot]??[200,360];
      this.drawFurniturePiece(id,x,y,stage);
    }
    // 阶段 1:角落固定摆一只大家挤着避雨的大纸箱(除非避雨角落已放了别的家具)。
    if(stage===1 && this.state?.placements?.corner===undefined){
      this.rect(158,336,72,52,0x9d7c58);this.rect(152,328,84,12,0xb6936b);this.rect(176,352,22,30,0x6f5238);
    }
  }
  // —— 猫咪动态层:专属家具姿态优先,其余自由漫步 ——
  private ensureHomeCats(stage:number):HomeCatAgent[]{
    const state = this.state;
    if(!state)return this.homeCats;
    const signature = `${stage}|${state.cats.join(',')}|${Object.entries(state.placements).sort(([a],[b])=>a.localeCompare(b)).map(([slot,id])=>`${slot}:${id}`).join(',')}`;
    if(signature===this.homeCatsSignature)return this.homeCats;
    this.homeCatsSignature = signature;
    this.homeCats = [];
    const claimed = new Set<string>();
    for(const affinity of DemoScene.homeAffinities){
      if(!state.cats.includes(affinity.breed))continue;
      const entry = Object.entries(state.placements).find(([,id])=>affinity.poses[id]!==undefined && !claimed.has(id));
      if(!entry)continue;
      claimed.add(entry[1]);
      const [sx,sy]=DemoScene.homeSlots[entry[0]]??[200,360];
      this.homeCats.push(this.createHomeCat(affinity.breed, stage, affinity.poses[entry[1]], sx, sy));
    }
    for(const breed of state.cats as CatBreed[]){
      if(this.homeCats.some(cat=>cat.breed===breed))continue;
      const [dx,dy]=DemoScene.homeCatDefaults[breed]??[300,370];
      this.homeCats.push(this.createHomeCat(breed, stage, null, dx, dy));
    }
    return this.homeCats;
  }
  private createHomeCat(breed:CatBreed, stage:number, pose:string|null, x:number, y:number):HomeCatAgent{
    const pool = stage>=2?DemoScene.homeRoamNodes:DemoScene.homeShelterNodes;
    const seed = breed.length*7 + breed.charCodeAt(0);
    // 阶段 1:从第一步就紧靠角落纸箱;之后回到各自的默认驻点。
    if(stage===1 && !pose){const shelter=DemoScene.homeShelterNodes[seed%DemoScene.homeShelterNodes.length];x=shelter.x;y=shelter.y;}
    // 每只猫从路点池里固定取 2~3 个"自己的"安全路点,漫游范围彼此错开。
    const count = 2 + seed%2;
    const nodes = Array.from({length:count},(_,i)=>pool[(seed*3+i*5)%pool.length]);
    return {breed, pose, x, y, nodes, nodeIndex:0, action:'sit', thinkAt:this.now+2500+(seed%4)*1300, facing:seed%2?1:-1, seed, noseUntil:0, noseCooldownUntil:0, bubble:null, bubbleUntil:0, startledUntil:0};
  }
  // 漫步/碰鼻礼状态机:在 update 中以真实时间步进。
  private stepHomeCats(deltaMs:number, stage:number){
    const cats = this.ensureHomeCats(stage);
    const seconds = deltaMs/1000;
    for(const cat of cats){
      if(cat.pose)continue;
      if(cat.action==='nose'){if(this.now>=cat.noseUntil)cat.action='sit';continue;}
      if(cat.action==='walk' && cat.target){
        const dx=cat.target.x-cat.x, dy=cat.target.y-cat.y, distance=Math.hypot(dx,dy);
        if(distance<3){
          cat.action='sit';cat.thinkAt=this.now+5000+Math.random()*3000;
          cat.facing = Math.random()<0.5 ? 1 : -1;
        } else {
          const step=Math.min(distance, 40*seconds);
          cat.x+=dx/distance*step;cat.y+=dy/distance*step;
          if(Math.abs(dx)>2)cat.facing = dx>0?1:-1;
        }
        continue;
      }
      if(cat.action==='sit' && this.now>=cat.thinkAt){
        cat.nodeIndex=(cat.nodeIndex+1)%cat.nodes.length;
        cat.target={...cat.nodes[cat.nodeIndex]};
        cat.action='walk';
      }
    }
    // 碰鼻礼:两只漫步中的猫靠近时停下 1 秒,头顶冒出像素爱心。
    for(let i=0;i<cats.length;i++)for(let j=i+1;j<cats.length;j++){
      const a=cats[i], b=cats[j];
      if(a.pose||b.pose)continue;
      if(this.now<a.noseCooldownUntil||this.now<b.noseCooldownUntil)continue;
      if(a.action==='nose'||b.action==='nose')continue;
      if(Math.hypot(a.x-b.x,a.y-b.y)>=34)continue;
      a.action='nose';b.action='nose';
      a.noseUntil=b.noseUntil=this.now+1000;
      a.noseCooldownUntil=b.noseCooldownUntil=this.now+7000;
      this.homeHearts.push({x:(a.x+b.x)/2, y:Math.min(a.y,b.y)-58, born:this.now});
    }
    this.homeHearts = this.homeHearts.filter(h=>this.now-h.born<1100);
  }
  private drawHomeCats(stage:number){
    for(const cat of this.ensureHomeCats(stage)){
      const jump = this.catStartleOffset(cat);
      if(cat.pose==='hammock_sleep')this.drawHammockSleep(cat, jump);
      else if(cat.pose==='knead')this.drawKneadCushion(cat, jump);
      else if(cat.pose==='bowl_eat')this.drawBowlEat(cat, jump);
      else if(cat.pose==='castle_peek')this.drawCastlePeek(cat, jump);
      else if(cat.pose==='belly')this.drawBellyBask(cat, jump);
      else this.drawRoamingCat(cat, stage);
      if(cat.noseUntil>this.now)this.drawPixelHeart(cat.x+cat.facing*10, cat.y-64, 2, 0.95);
    }
  }
  private catStartleOffset(cat:HomeCatAgent):number{
    if(cat.startledUntil<=this.now)return 0;
    return Math.sin(Math.min(1,(cat.startledUntil-this.now)/650)*Math.PI)*-6;
  }
  // 自由漫步的猫:标准像素猫 + 呼吸起伏、弓背懒腰、尾巴轻摇与走路颠步。
  private drawRoamingCat(cat:HomeCatAgent, stage:number){
    const size=64, t=this.now;
    const breathing=Math.sin(t*0.0022+cat.seed)*0.02;
    const stretchPhase=(t*0.001+cat.seed*0.7)%9;
    const stretching=stretchPhase<1.2?Math.sin(stretchPhase/1.2*Math.PI):0;
    const walkBob=cat.action==='walk'?-Math.abs(Math.sin(t*0.012+cat.seed))*2.5:0;
    const jump=this.catStartleOffset(cat);
    const mood=stage===1||cat.startledUntil>t?'worried':'idle';
    this.context.save();
    this.context.translate(Math.round(cat.x-size/2),Math.round(cat.y-size*.8+jump+walkBob));
    this.context.scale(cat.facing*(size/64)*(1+stretching*0.16),(size/64)*(1-breathing-stretching*0.18));
    drawPixelCat(this.context,cat.breed,mood);
    this.context.restore();
    const wag=Math.sin(t*0.004+cat.seed)*3;
    this.rect(cat.x-cat.facing*27-1, cat.y-27+wag+jump, 3, 15, this.colorOf(cat.breed), .9);
  }
  private colorOf(breed:CatBreed):number{return {miaomiao:0xd5bc87,diandian:0xb9a789,tuanzi:0xc38343,momo:0x2c2a30}[breed];}
  // 墨墨 × 月亮吊床:卷成黑团子酣睡,尾巴垂在吊床边,头顶缓缓飘出像素 zZ。
  private drawHammockSleep(cat:HomeCatAgent, jump:number){
    const t=this.now*0.001+cat.seed;
    const breathe=Math.sin(t*1.5);
    const x=cat.x, y=cat.y+jump;
    this.rect(x-13,y-11+breathe*0.8,26,11,0x46434a);
    this.rect(x-10,y-14+breathe*0.8,20,5,0x46434a);
    this.rect(x-8,y-4+breathe*0.8,16,3,0x565360);
    this.rect(x-8,y-19+breathe*0.8,4,5,0x2c2a30);this.rect(x+4,y-19+breathe*0.8,4,5,0x2c2a30);
    this.rect(x-5,y-9,4,1,0x211f24);this.rect(x+2,y-9,4,1,0x211f24);
    const sway=Math.sin(t*0.8)*2;
    this.rect(x+13,y-6+sway,2,10,0x2c2a30,.95);this.rect(x+14,y+3+sway,3,2,0x2c2a30,.95);
    for(let i=0;i<2;i++){
      const rise=(t*9+i*13)%26;
      this.drawPixelZ(x+16+i*6, y-24-rise, i?3:4, Math.max(0,1-rise/26)*0.9);
    }
  }
  private drawPixelZ(x:number,y:number,s:number,alpha:number){
    this.rect(x,y,s*3,Math.max(1,s-1),0xf4e6c0,alpha);
    this.rect(x+s,y+s,s,s,0xf4e6c0,alpha);
    this.rect(x,y+s*2,s*3,Math.max(1,s-1),0xf4e6c0,alpha);
  }
  // 团子 × 零食抱枕:趴在枕上双爪交替"踩奶"。
  private drawKneadCushion(cat:HomeCatAgent, jump:number){
    const t=this.now*0.006+cat.seed;
    const x=cat.x, y=cat.y+jump;
    this.rect(x-16,y-10,32,10,0xe7ad67);
    this.rect(x-14,y-13,28,4,0xf0bd7f);
    this.rect(x-20,y-6,6,7,0xc38343);
    this.rect(x+14,y-6,6,7,0xc38343);
    this.rect(x-9,y-24,18,14,0xe7ad67);
    this.rect(x-7,y-27,4,5,0xc38343);this.rect(x+3,y-27,4,5,0xc38343);
    this.rect(x-6,y-18,4,1,0x523729);this.rect(x+2,y-18,4,1,0x523729);
    this.rect(x-1,y-16,3,2,0xb5764d);
    const lift=Math.sin(t)*2.4;
    this.rect(x-12,y-12+Math.max(0,lift),5,6,0xf0bd7f);
    this.rect(x+6,y-12+Math.max(0,-lift),5,6,0xf0bd7f);
    const curl=Math.sin(t*0.5)*3;
    this.rect(x+16,y-9+curl,2,10,0xc38343,.95);
  }
  // 团子 × 蓝色饭碗:探头吃饱,肚皮圆滚滚,间歇抬头回味。
  private drawBowlEat(cat:HomeCatAgent, jump:number){
    const t=(this.now*0.001+cat.seed)%4;
    const headUp=t>3.2;
    const x=cat.x, y=cat.y+jump;
    this.rect(x-18,y-14,36,16,0xe7ad67);
    this.rect(x-20,y-12,4,14,0xe7ad67);
    this.rect(x-14,y-17,30,4,0xf0bd7f);
    const headY=headUp?y-30:y-22;
    this.rect(x-24,headY-10,16,13,0xe7ad67);
    this.rect(x-26,headY-13,4,4,0xc38343);this.rect(x-18,headY-13,4,4,0xc38343);
    if(headUp){this.rect(x-22,headY-5,3,1,0x523729);this.rect(x-16,headY-5,3,1,0x523729);this.rect(x-21,headY-2,7,2,0xb5764d);}
    else this.rect(x-28,headY+1,6,2,0x8d5b3a);
    const chew=Math.sin(this.now*0.01+cat.seed)>0?1:0;
    if(!headUp)this.rect(x-18,y-4+chew,3,2,0xe7ad67);
  }
  // 点点 × 纸箱城堡:钻进门洞只探出头,大圆眼与尖耳朵,每隔几秒耳朵抖一下。
  private drawCastlePeek(cat:HomeCatAgent, jump:number){
    const t=this.now*0.001+cat.seed;
    const twitch=((t)%4)<0.32?Math.sin((t%4)*95)*2:0;
    const x=cat.x, y=cat.y+jump;
    // 门洞里的脸:先画头,再补门框制造"从洞里探出"的遮挡感。
    this.rect(x-8,y+2,16,14,0xd9c7a8);
    this.rect(x-8,y+6,16,8,0x63594d);
    this.rect(x-7,y-2+Math.round(twitch*0.5),4,5,0x443d35);this.rect(x+3,y-2-Math.round(twitch*0.5),4,5,0x443d35);
    this.rect(x-6,y+7,4,4,0xefeadd);this.rect(x+2,y+7,4,4,0xefeadd);
    this.rect(x-5,y+8,2,3,0x2f2a26);this.rect(x+3,y+8,2,3,0x2f2a26);
    this.rect(x-2,y+13,4,2,0xb58a86);
    this.rect(x-11,y,4,17,0xd5a44b);this.rect(x+7,y,4,17,0xd5a44b);
    this.rect(x-11,y-1,22,3,0xc2903c);
  }
  // 喵喵 × 毛毯/小太阳灯:四脚朝天瘫着晒肚皮,偶尔惬意打个大哈欠。
  private drawBellyBask(cat:HomeCatAgent, jump:number){
    const t=(this.now*0.001+cat.seed)%5.5;
    const yawning=t<0.6;
    const x=cat.x, y=cat.y+jump;
    this.rect(x-17,y-10,34,12,0xf2dfb8);
    this.rect(x-12,y-8,24,8,0xfff4dc);
    this.rect(x-19,y-8,3,8,0xd5bc87);this.rect(x+16,y-8,3,8,0xd5bc87);
    const wig=Math.sin(this.now*0.005+cat.seed)*1.5;
    for(const [px,delay] of [[-13,0],[-5,1.1],[4,2.2],[12,3.3]] as const){
      const lift=Math.sin(this.now*0.006+cat.seed+delay)>0?1.5:0;
      this.rect(x+px,y-14-lift+wig*0.4,3,5,0xf2dfb8);
    }
    this.rect(x-26,y-16,13,12,0xf2dfb8);
    this.rect(x-25,y-19,3,4,0xb77b32);this.rect(x-17,y-19,3,4,0xb77b32);
    if(yawning){this.rect(x-24,y-12,8,6,0xb54035);this.rect(x-23,y-11,6,4,0x7a2c26);}
    else {this.rect(x-24,y-10,3,1,0x3b3131);this.rect(x-19,y-10,3,1,0x3b3131);}
    this.rect(x-30,y-9+Math.sin(this.now*0.004+cat.seed)*2,2,9,0xd5bc87,.95);
  }
  private drawPixelHeart(x:number,y:number,scale:number,alpha:number){
    const rows=['0110110','1111111','1111111','0111110','0011100','0001000'];
    for(let r=0;r<rows.length;r++)for(let c=0;c<7;c++)if(rows[r][c]==='1')this.rect(x+(c-3)*scale,y+r*scale,scale,scale,0xef6a7a,alpha);
  }
  // 特效层:漏雨雨滴、破窗外的雨、庆典串灯闪烁、爱心上飘与台词气泡。
  private drawHomeFx(stage:number){
    if(stage===1){
      for(const [dx,startY,phase] of [[318,88,0],[472,92,120]] as const){
        for(let i=0;i<3;i++){
          const progress=((this.now*0.16+phase+i*80)%240)/240;
          this.rect(dx,startY+progress*236,2,6,0xaecdd4,.7*(1-progress*0.35));
        }
      }
      for(let i=0;i<10;i++){
        const rx=286+(i*24+this.now*0.05)%228;
        const ry=100+(i*37+this.now*0.4)%150;
        this.rect(rx,ry,1,7,0xcbdad4,.22);
      }
      const ripple=(this.now%900)<220;
      if(ripple){this.rect(322,357,12,3,0xd7ecef,.7);this.rect(486,392,14,3,0xc4dde1,.6);}
    }
    if(stage>=4){
      const colors=[0xffd54f,0xffa726,0xf78fb3,0x9ccc65,0x81d4fa];
      for(let a=0;a<2;a++){
        const sx=a?400:120, span=260, sy=a?76:82;
        for(let i=0;i<=26;i++){
          const lx=sx+(i/26)*span;
          const sag=Math.sin((i/26)*Math.PI)*11;
          this.rect(lx,sy+sag,3,1,0x5a4a38,.75);
        }
        for(let i=0;i<7;i++){
          const lx=sx+(i/6)*span;
          const ly=sy+Math.sin((i/6)*Math.PI)*11;
          const glow=0.5+0.5*Math.sin(this.now*0.004+i*1.4+a*2.2);
          const color=colors[(i+a*2)%colors.length];
          this.graphics.fillStyle(color,.1+glow*.12);
          this.graphics.fillCircle(lx,ly+5,9);
          this.rect(lx-2,ly+2,4,6,color,.5+glow*.5);
        }
      }
    }
    for(const heart of this.homeHearts){
      const age=this.now-heart.born;
      this.drawPixelHeart(heart.x,heart.y-age*0.018,2,Math.max(0,1-age/1100));
    }
    for(const cat of this.homeCats){
      if(cat.bubble && cat.bubbleUntil>this.now)this.drawSpeechBubble(cat.x,cat.y,cat.bubble);
    }
  }
  private drawSpeechBubble(x:number,y:number,text:string){
    const ctx=this.context;
    ctx.save();
    ctx.globalAlpha=1;
    ctx.font='12px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    const width=Math.ceil(ctx.measureText(text).width)+18;
    const height=24;
    const bx=Math.min(Math.max(6,Math.round(x-width/2)),794-width);
    const by=Math.round(y)-84;
    ctx.fillStyle='rgba(253,246,227,.96)';
    ctx.strokeStyle='rgba(122,104,74,.9)';
    ctx.lineWidth=2;
    ctx.fillRect(bx,by,width,height);
    ctx.beginPath();
    ctx.moveTo(Math.min(Math.max(x,bx+8),bx+width-8)-5,by+height);
    ctx.lineTo(Math.min(Math.max(x,bx+8),bx+width-8)+5,by+height);
    ctx.lineTo(Math.min(Math.max(x,bx+8),bx+width-8),by+height+7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeRect(bx+.5,by+.5,width-1,height-1);
    ctx.fillStyle='#4a3b2a';
    ctx.textBaseline='middle';
    ctx.fillText(text,bx+9,by+height/2+1);
    ctx.restore();
  }
  // 点击花房里的猫:受惊小跳 + 治愈台词气泡。
  private pokeHomeCat(x:number,y:number){
    if(this.now<this.homePokeCooldownUntil)return;
    for(const cat of this.homeCats){
      if(Math.hypot(cat.x-x,(cat.y-26)-y)>34)continue;
      cat.startledUntil=this.now+650;
      cat.bubble=DemoScene.pokeLines[cat.breed];
      cat.bubbleUntil=this.now+3400;
      this.homePokeCooldownUntil=this.now+280;
      return;
    }
  }
  private marketCameraFrame() {return this.marketFrame??measureMarketCameraFrame(this.canvas,this.viewWidth,this.viewHeight);}
  private snapMarketCamera() {this.marketCamera.snap({x:this.x,y:this.y},this.marketCameraFrame(),1672,941);}
  private drawMarket() {
    const image=this.marketImages[this.marketFloor];
    const frame=this.marketCameraFrame(),camera=this.marketCamera;
    this.context.save();
    this.context.fillStyle='#181f2b';this.context.fillRect(0,0,this.viewWidth,this.viewHeight);
    this.context.beginPath();this.context.rect(frame.viewport.x,frame.viewport.y,frame.viewport.width,frame.viewport.height);this.context.clip();
    this.context.translate(frame.viewport.x-camera.x*frame.scale,frame.viewport.y-camera.y*frame.scale);
    this.context.scale(frame.scale,frame.scale);
    if(image.complete&&image.naturalWidth>0)this.context.drawImage(image,0,0,1672,941);
    this.drawMarketRoadSigns();
    this.drawMarketMarkers();
    this.context.save();this.context.translate(this.x-16,this.y-38);this.context.scale(.5,.5);drawPixelCat(this.context,'miaomiao','idle');this.context.restore();
    if(this.marketDebug)this.drawMarketDebug();
    this.context.restore();
    if(this.marketDebug){this.context.fillStyle='#fff0c4';this.context.font='11px monospace';this.context.fillText('QA collision diagnostics · press Y to copy last movement',frame.safe.x+8,Math.max(frame.safe.y+18,18));}
  }
  private drawMarketRoadSigns() {
    const ctx=this.context,nearby=nearestMarketRoadSign(this.marketFloor,this.x,this.y);
    for(const sign of marketRoadSigns.filter(value=>value.floor===this.marketFloor)){
      const close=nearby?.sign.id===sign.id&&nearby.distance<=sign.revealRadius;
      ctx.save();ctx.translate(sign.x,sign.y);
      // A compact timber signpost built from pixel-sized rectangles; it is visual only.
      ctx.fillStyle='rgba(12,18,22,.35)';ctx.fillRect(-12,9,24,4);
      ctx.fillStyle='#533728';ctx.fillRect(-3,1,6,14);ctx.fillRect(-5,13,10,3);
      ctx.fillStyle='#302b2a';ctx.fillRect(-15,-15,30,17);ctx.fillStyle='#9a633e';ctx.fillRect(-13,-13,26,13);
      ctx.fillStyle='#d8a85d';ctx.fillRect(-12,-12,24,2);ctx.fillRect(-12,-2,24,1);
      ctx.fillStyle='#f5e3b2';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sign.directions.includes('↑')||sign.directions.includes('↗')?'↑':sign.directions.includes('↓')?'↓':'→',0,-6);
      if(close){
        const label=`${sign.area} · ${sign.directions}`;ctx.font='14px "Microsoft YaHei",system-ui,sans-serif';const width=ctx.measureText(label).width+14,bx=18,by=-19;
        ctx.fillStyle='rgba(16,28,38,.93)';ctx.fillRect(bx,by,width,24);ctx.strokeStyle='#d8a85d';ctx.lineWidth=1;ctx.strokeRect(bx+.5,by+.5,width-1,23);ctx.fillStyle='#fff0c4';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(label,bx+7,by+12);
      }
      ctx.restore();
    }
  }
  private drawMarketMarkers() {
    const ctx=this.context,flags=this.state?.flags??[];
    for(const item of marketItems.filter(value=>['crow','pigeon','momo','boss','exit'].includes(value.id)&&value.layer===this.marketFloor)){
      const completed=item.id==='crow'?flags.includes('market_crow_clue_completed'):item.id==='pigeon'?flags.includes('market_pigeon_clue_completed'):item.id==='momo'?!!this.state?.drawnEvents?.includes('node:momo_trail_event'):item.id==='boss'?flags.includes('market_cleared'):false;
      const locked=(item.id==='boss'&&(!flags.includes('market_crow_clue_completed')||!flags.includes('market_pigeon_clue_completed')))||(item.id==='exit'&&!flags.includes('market_cleared'));
      const title=item.id==='crow'?'老黑羽情报摊':item.id==='pigeon'?'咕咕大盗传言棚':item.id==='momo'?'墨墨的踪迹':item.id==='boss'?'集市保卫战':'北街出口';
      ctx.save();ctx.globalAlpha=completed?.62:1;ctx.beginPath();ctx.arc(item.x,item.y,11,0,Math.PI*2);ctx.fillStyle=locked?'#a6a497':item.id==='boss'?'#ef906a':'#f0cd79';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#172630';ctx.stroke();
      ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#172630';ctx.fillText(item.id==='boss'?'!':item.id==='exit'?'↑':'E',item.x,item.y+.5);
      const label=`${item.id==='momo'?'OPTIONAL · ':''}${title}${locked?' · 未解锁':completed?' · 已完成':''}`;ctx.font='13px "Microsoft YaHei",system-ui,sans-serif';const width=ctx.measureText(label).width+12,bx=item.x+15,by=item.y-23;
      ctx.fillStyle='rgba(16,28,38,.9)';ctx.fillRect(bx,by,width,21);ctx.strokeStyle='#f2e4c4';ctx.lineWidth=1;ctx.strokeRect(bx+.5,by+.5,width-1,20);ctx.fillStyle='#fff0c4';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(label,bx+6,by+10.5);ctx.restore();
    }
    for(const portal of marketPortals){
      for(const point of [portal.a,portal.b]){
        const display=marketPortalDisplay(portal,point,this.marketFloor,this.x,this.y,flags);if(!display?.visible)continue;
        ctx.save();ctx.globalAlpha=display.alpha;ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.fillStyle=display.active?'#73e1dd':'#91bab8';ctx.fill();ctx.strokeStyle='#102b38';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#10232b';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(portal.key.toUpperCase(),point.x,point.y);
        if(display.active){ctx.globalAlpha=1;ctx.font='12px "Microsoft YaHei",system-ui,sans-serif';const width=ctx.measureText(display.label).width+12,bx=point.x+12,by=point.y-22;ctx.fillStyle='rgba(16,28,38,.92)';ctx.fillRect(bx,by,width,20);ctx.strokeStyle='#f2e4c4';ctx.lineWidth=1;ctx.strokeRect(bx+.5,by+.5,width-1,19);ctx.fillStyle='#fff0c4';ctx.textAlign='left';ctx.fillText(display.label,bx+6,by+10);}
        ctx.restore();
      }
    }
  }
  private drawMarketDebug() {
    const ctx=this.context;ctx.save();
    for(const [width,points] of nightMarketSpatial.R[this.marketFloor]){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle='rgba(67,255,142,.38)';ctx.lineWidth=Math.max(2,width-20);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#d7ff66';ctx.stroke();}
    if(this.marketFloor==='L0')for(const solid of nightMarketSpatial.solids){ctx.beginPath();if(solid.type==='rect')ctx.rect(solid.x,solid.y,solid.w,solid.h);else{solid.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}ctx.fillStyle='rgba(255,35,68,.25)';ctx.fill();ctx.strokeStyle='#ff4058';ctx.lineWidth=2;ctx.stroke();}
    if(this.marketFloor==='L0')for(const obstacle of nightMarketSpatial.actionObstacles){ctx.beginPath();ctx.moveTo(obstacle.a[0],obstacle.a[1]);ctx.lineTo(obstacle.b[0],obstacle.b[1]);ctx.strokeStyle='#ff4058';ctx.lineWidth=obstacle.radius*2;ctx.stroke();}
    if(this.marketFloor===nightMarketSpatial.battleBarrier.layer){const barrier=nightMarketSpatial.battleBarrier;ctx.beginPath();ctx.moveTo(barrier.a[0],barrier.a[1]);ctx.lineTo(barrier.b[0],barrier.b[1]);ctx.strokeStyle='#ff4058';ctx.lineWidth=barrier.radius*2;ctx.stroke();}
    for(const item of marketItems.filter(value=>['crow','pigeon','momo','boss','exit'].includes(value.id)&&value.layer===this.marketFloor)){const complete=item.id==='crow'?this.state?.flags.includes('market_crow_clue_completed'):item.id==='pigeon'?this.state?.flags.includes('market_pigeon_clue_completed'):item.id==='momo'?this.state?.drawnEvents?.includes('node:momo_trail_event'):item.id==='boss'?this.state?.flags.includes('market_cleared'):false;const locked=(item.id==='boss'&&(!this.state?.flags.includes('market_crow_clue_completed')||!this.state?.flags.includes('market_pigeon_clue_completed')))||(item.id==='exit'&&!this.state?.flags.includes('market_cleared'));const inside=Math.hypot(this.x-item.x,this.y-item.y)<=75;ctx.beginPath();ctx.arc(item.x,item.y,75,0,Math.PI*2);ctx.setLineDash([5,4]);ctx.strokeStyle='#fff';ctx.stroke();ctx.setLineDash([]);ctx.font='12px system-ui';ctx.fillStyle='#fff';ctx.fillText(`${item.id==='momo'?'optional clue':item.id} · ${item.label} · ${this.marketFloor} · ${locked?'locked':complete?'completed':'available'}${inside?' · inside':''}`,item.x+68,item.y);}
    for(const portal of marketPortals)for(const point of [portal.a,portal.b])if(point.layer===this.marketFloor){ctx.beginPath();ctx.arc(point.x,point.y,portal.radius,0,Math.PI*2);ctx.setLineDash([4,4]);ctx.strokeStyle='#72f5ff';ctx.stroke();ctx.setLineDash([]);}
    ctx.beginPath();ctx.arc(this.x,this.y,10,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.font='11px monospace';ctx.fillStyle='#fff';ctx.fillText(`${this.marketFloor} pos:${this.marketLastMove.position.x.toFixed(1)},${this.marketLastMove.position.y.toFixed(1)} dir:${this.marketLastMove.direction.x},${this.marketLastMove.direction.y} to:${this.marketLastMove.requestedDestination.x.toFixed(1)},${this.marketLastMove.requestedDestination.y.toFixed(1)}`,this.marketCamera.x+8,this.marketCamera.y+18);ctx.fillText(`rejected:${this.marketLastMove.rejected} reason:${this.marketLastMove.reason} boundary:${this.marketLastMove.nearestBoundary} · Y copy`,this.marketCamera.x+8,this.marketCamera.y+33);ctx.restore();
  }
  private drawTunnel() {
    // 阴暗地下管道拱门背景
    this.rect(0, 0, 800, 480, 0x11161d);
    // 拱形砖墙与管道
    this.rect(40, 40, 720, 160, 0x1a232c);
    this.rect(60, 50, 680, 140, 0x222e3a);
    // 砖墙接缝
    for (let y = 60; y < 190; y += 22) {
      for (let x = 65 + (y % 44 === 22 ? 25 : 0); x < 735; x += 50) {
        this.rect(x, y, 46, 2, 0x161e26, 0.5);
      }
    }
    // 上方大水管
    this.rect(40, 90, 720, 22, 0x3d4b58);
    this.rect(40, 94, 720, 6, 0x5a6d7e);
    this.rect(40, 112, 720, 4, 0x27313b);
    for (let x = 120; x < 720; x += 110) {
      this.rect(x - 4, 86, 12, 30, 0x506272);
      this.rect(x - 2, 88, 8, 26, 0x27313b);
    }
    // 荧光苔藓斑点
    const mosses = [[160, 130], [280, 150], [450, 120], [600, 140], [210, 260], [520, 270]];
    for (const [mx, my] of mosses) {
      this.graphics.fillStyle(0x38b000, 0.15);
      this.graphics.fillCircle(mx, my, 26);
      this.rect(mx - 8, my - 6, 16, 12, 0x2d6a4f, 0.75);
      this.rect(mx - 4, my - 3, 8, 6, 0x52b788, 0.9);
    }
    // 地面积水石板路
    this.rect(35, 200, 730, 230, 0x182029);
    this.rect(65, 205, 670, 225, 0x202b37);
    for (let y = 210; y < 430; y += 30) {
      for (let x = 70 + (y % 60 === 30 ? 25 : 0); x < 730; x += 50) {
        this.rect(x, y, 44, 2, 0x151c24, 0.45);
      }
    }
    // 积水反光
    this.rect(220, 310, 80, 24, 0x1a3338, 0.8);
    this.rect(230, 314, 60, 15, 0x285058, 0.85);
    this.rect(245, 318, 30, 7, 0x488b95, 0.7);
    this.rect(490, 280, 90, 26, 0x1a3338, 0.8);
    this.rect(500, 284, 70, 17, 0x285058, 0.85);
    this.rect(515, 288, 38, 8, 0x488b95, 0.7);

    // 警戒的伙伴们
    this.cat(190, 340, 'momo');
    this.cat(320, 345, 'tuanzi');
    this.cat(440, 350, 'diandian');
    this.cat(this.x || 265, this.y || 355, 'miaomiao');
  }
}
