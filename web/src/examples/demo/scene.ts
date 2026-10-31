import {PARCEL_ART, PARCEL_IDS} from '../../modules/lottery/furnitureArt';
import type {BattleResult, GameState, StoryNode} from '../../contracts';
import {drawPixelCat,type CatBreed} from '../../adapters/canvas/pixelCat';
import {DemoBattle} from './battle';
import type {Direction} from '../../adapters/platform/input';
import {CanvasPainter} from '../../adapters/canvas/painter';
import {FollowCamera, type CameraFrame} from '../../adapters/canvas/camera';
import {IntegratedRainyAlley} from '../../modules/rainyAlley/IntegratedRainyAlley';
import {TunnelMap} from '../../modules/chapter4/TunnelMap';
import {marketArt, marketEntry, marketItems, marketPortals, marketRoadSigns, nearestMarketRoadSign, marketEAction, marketInteractionTarget, marketOptionalHint, marketPortalDisplay, marketTransitionAt, marketNearestBoundary, marketExitAt, MARKET_EXIT_TRIGGER, nightMarketSpatial, sweepMarketMove, type MarketFloor} from '../../modules/nightMarket/map';
import {measureMarketCameraFrame} from '../../modules/nightMarket/camera';
import {MarketTransitionController} from '../../modules/nightMarket/transitions';
import {HOME_LAYOUT_ID, HOME_SIZE, HOME_RESIDENTS, HOME_ROAM_NODES, HOME_SHELTER_NODES, homeStage} from '../../modules/home/layout';
import {homeAppearanceKey, paintHomestead, paintHomeStructure, paintHomeObject, paintHomeFurnitureFront, paintHomeFrontWall, paintHomeWeather, homeObjects} from '../../modules/home/painter';
import {loadHomeArtwork, HOME_FRAMES, type HomeArtwork} from '../../modules/home/assets';
import {paintResident} from '../../modules/home/catPainter';
import {CAT_NAMES,SOCIAL_KINDS,freeCatPoint,furnitureAt,furnitureActivity,useFurniture,socialize,endSocial,stepHomeLife,settleCats,type LifeCat} from '../../modules/home/life';
import {HomeCamera} from '../../modules/home/camera';
import {homePosePoint, homeInventory, type HomeAppearance} from '../../modules/home/objects';
import {homeWalkable} from '../../modules/home/navigation';
import {displayedCanvasRect} from '../../adapters/canvas/camera';
import {homeStoryBeat, storyActorPosition, type HomeStoryActor, type HomeStoryBeat} from '../../modules/home/story';
import {explorationScene} from '../../core/chapter-navigation';
import type {WarehouseWalkMap, WarehouseReviewOptions} from '../../modules/chapter5/WarehouseWalkMap';

// 原生 Canvas 参考场景；地图与塔防模块可分别替换此样例。
// 剧情接管之外，日常由共享家具动作、伙伴互动和漫步组成。
interface HomeCatAgent extends LifeCat {
  scripted?: {actor:HomeStoryActor;from:{x:number;y:number}};
}
export class DemoScene {
  private warehousePreview: WarehouseWalkMap | null = null;
  private warehouseLoading: Promise<void> | null = null;
  private warehouseCollision = false;
  state: GameState | null = null;
  pausedByUser = false;
  storyScene: StoryNode['scene'];
  storyNode?: StoryNode;
  private graphics: CanvasPainter;
  private context: CanvasRenderingContext2D;
  private rainyAlley: IntegratedRainyAlley;
  private tunnelMap: TunnelMap;
  private cityBackdrop: HTMLImageElement;
  private marketImages: Record<MarketFloor, HTMLImageElement> = {L0:new Image(),L1:new Image(),Lm1:new Image()};
  private marketFloor: MarketFloor = 'L0';
  private marketCamera = new FollowCamera();
  private marketTransition = new MarketTransitionController();
  private marketTransitionHeight = 0;
  private marketFrame: CameraFrame | null = null;
  private marketInitialized = false;
  private marketExitRequested = false;
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
  private homeTime = 0;
  private homeBeat: HomeStoryBeat | null = null;
  private homeBeatStartedAt = 0;
  private homeBackdrop: HTMLCanvasElement | null = null;
  private homeBackdropKey = '';
  private homeArtwork?:HomeArtwork;
  private homeAssetLoading=false;
  private homeAssetError=false;
  private homeCamera=new HomeCamera();
  private homeEditing?:{state:HomeAppearance;selection:string;valid:boolean};
  get homeCanvas(){return this.canvas;}
  get homeZoomLevel(){return this.homeCamera.zoom;}
  setHomeEditing(draft?:{state:HomeAppearance;selection:string;valid:boolean}){
    this.homeEditing=draft;this.clearInput();this.canvas.dataset.homeEditing=String(!!draft);
    this.canvas.style.cursor=draft?'grab':'';
    if(!draft){delete this.canvas.dataset.editorView;delete this.canvas.dataset.editorItems;}
  }
  homeClientToWorld(clientX:number,clientY:number){
    const point=this.homeScreenPoint({clientX,clientY}),view=this.homeView(),r=this.canvas.getBoundingClientRect();
    return{x:Math.round((point.x-view.x)/view.scale),y:Math.round((point.y-view.y)/view.scale),inside:clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom};
  }
  homeWorldToClient(x:number,y:number){
    const r=this.canvas.getBoundingClientRect(),view=this.homeView(),cover=getComputedStyle(this.canvas).objectFit==='cover',s=(cover?Math.max:Math.min)(r.width/this.viewWidth,r.height/this.viewHeight);
    return{x:r.left+(r.width-this.viewWidth*s)/2+(view.x+x*view.scale)*s,y:r.top+(r.height-this.viewHeight*s)/2+(view.y+y*view.scale)*s};
  }
  panHomeEditor(from:{x:number;y:number},to:{x:number;y:number}){
    if(!this.homeEditing)return;
    const a=this.homeScreenPoint({clientX:from.x,clientY:from.y}),b=this.homeScreenPoint({clientX:to.x,clientY:to.y}),view=this.homeView();
    this.homeCamera.pan(b.x-a.x,b.y-a.y,view.viewport.width,view.viewport.height);
  }
  private homeDrag:{id:number;start:{x:number;y:number};last:{x:number;y:number};moved:boolean;cat?:CatBreed;offset?:{x:number;y:number}}|null=null;
  private homeSocialSerial=0;
  private homeSocialStamp=-1;
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
    private onMarketZone?: (zoneId:string,floor:MarketFloor,point:{x:number;y:number}) => Promise<boolean>,
    private onWarehousePosition?: (floor:'L0'|'L1',point:{x:number;y:number})=>void
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
    this.tunnelMap = new TunnelMap();
    this.cityBackdrop = new Image();
    this.cityBackdrop.src = '/assets/city-backdrop.svg';
    for(const floor of Object.keys(marketArt) as MarketFloor[]) this.marketImages[floor].src=marketArt[floor];
  }
  setDirection(direction: Direction, held: boolean) {if(this.marketTransition.active)return;if (held) this.held.add(direction);else this.held.delete(direction);}
  async enableWarehousePreview() {
    if(this.warehouseLoading)return this.warehouseLoading;
    this.warehouseLoading=this.loadWarehouse();return this.warehouseLoading;
  }
  private async loadWarehouse() {
    const {WarehouseWalkMap} = await import('../../modules/chapter5/WarehouseWalkMap');
    if (this.destroyed) return;
    this.warehousePreview = new WarehouseWalkMap();
    await this.warehousePreview.ready();
  }
  climbWarehouse() {if(this.warehousePreview?.climb())this.clearInput();}
  setWarehouseReviewOptions(options: Partial<WarehouseReviewOptions>) {this.warehousePreview?.setOptions(options);}
  resetWarehousePreview() {this.clearInput(); this.warehousePreview?.reset();}
  private keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input,select,textarea') || target?.isContentEditable) return;
    if (this.warehousePreview && (!this.state || this.state.mapId==='warehouse')) {
      if(this.pausedByUser||(this.state&&this.state.phase!=='explore'))return;
      const key = event.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)) {event.preventDefault(); this.keys.add(key);}
      if(key==='c'&&!event.repeat){event.preventDefault();this.climbWarehouse();}
      if(key==='e'&&!event.repeat&&this.state){event.preventDefault();const target=this.warehousePreview.nearTarget;if(target?.key==='E'){this.onWarehousePosition?.(this.warehousePreview.layer,this.warehousePreview.positionNow());this.onInteract(target.id);}}
      if(import.meta.env.DEV&&key==='g'&&!event.repeat)this.warehousePreview.setOptions({collision:!this.warehouseCollision});
      if(import.meta.env.DEV&&key==='g'&&!event.repeat)this.warehouseCollision=!this.warehouseCollision;
      if (key === 'r' && !event.repeat&&!this.state) this.resetWarehousePreview();
      return;
    }
    if(this.state?.phase==='home'&&event.key==='Escape'&&this.homeDrag?.cat){event.preventDefault();this.homePointerCancel();return;}
    if (this.state?.phase !== 'explore' || this.pausedByUser) return;
    const key = event.key.toLowerCase();
    if (this.state?.mapId === 'tunnel') {
      // Resolve one-shot E input on keydown, as Alley and Market do. A quick
      // keyup can otherwise clear TunnelMap's held-key set before its next frame.
      if (key === 'e') {
        event.preventDefault();
        const target = this.tunnelMap.nearTarget;
        if (!event.repeat && target) {this.onWorldPosition?.(this.tunnelMap.positionNow());this.onInteract(target.id);}
        return;
      }
      if (this.tunnelMap.keyDown(key, import.meta.env.DEV)) {event.preventDefault(); return;}
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','f','c',' '].includes(key)) event.preventDefault();
      if (!event.repeat && ['f','c',' '].includes(key)) this.tunnelMap.traverse(key as 'f'|'c'|' ', this.state.flags);
      this.keys.add(key);
      return;
    }
    if (this.marketTransition.active && this.state.mapId === 'market') {
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','c','f'].includes(key)) event.preventDefault();
      return;
    }
    if (key === 's' && !event.repeat && this.state?.mapId === 'alley' && this.rainyAlley.tryStartSqueeze()) {
      event.preventDefault(); this.keys.delete('s'); return;
    }
    if (!event.repeat && this.state?.mapId === 'market' && (key==='c'||key==='f')) {
      const request=marketTransitionAt(this.marketFloor,key,this.x,this.y,this.state.flags,this.state.flags.includes('market_cleared'));
      if(request&&this.marketTransition.begin(request,{x:this.x,y:this.y})){this.clearInput();this.onNear(false);this.onInspectHint?.(null);}
      event.preventDefault();
      return;
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
    // 加减号缩放视野（雨巷）：给键盘玩家与滚轮对等的视角控制。
    if ((key === '=' || key === '+') && this.state?.mapId === 'alley') {event.preventDefault();this.rainyAlley.adjustZoom(0.12);return;}
    if ((key === '-' || key === '_') && this.state?.mapId === 'alley') {event.preventDefault();this.rainyAlley.adjustZoom(-0.12);return;}
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
        if (interaction) {
          // 老黄：E 交互除了走原有事件卡，再叠加一段猫头顶气泡 + 音符上飘的欢呼（纯表现层）。
          if (interaction.id === 'alley_dog_friend_point') this.rainyAlley.cheer();
          this.onInteract(interaction.id);
        }
      }
    }
  };
  private keyup = (event: KeyboardEvent) => {this.keys.delete(event.key.toLowerCase());this.tunnelMap.keyUp(event.key.toLowerCase());};
  private clearInput = () => {this.keys.clear();this.held.clear();this.homePointerCancel();};
  // 滚轮缩放视野（雨巷）：上滚放大、下滚缩小；仅在自由探索且未暂停时接管，不吞面板滚动。
  private wheel = (event: WheelEvent) => {
    if (this.state?.phase !== 'explore' || this.state.mapId !== 'alley' || this.pausedByUser) return;
    event.preventDefault();
    this.rainyAlley.adjustZoom(-event.deltaY * 0.0016);
  };
  private pointerdown = (event: PointerEvent) => {
    if (this.state?.phase === 'explore' && this.state.mapId === 'alley' && !this.pausedByUser) {
      const bounds = this.canvas.getBoundingClientRect();
      const cover = getComputedStyle(this.canvas).objectFit === 'cover';
      this.rainyAlley.click(event.clientX, event.clientY, bounds, this.viewWidth, this.viewHeight, cover);
      return;
    }
    if (this.state?.phase === 'home' && this.state.chapterId !== 'prologue' && !this.pausedByUser) {
      const point=this.homeScreenPoint(event);
      const view=this.homeView(),world={x:(point.x-view.x)/view.scale,y:(point.y-view.y)/view.scale};
      const cat=this.homeCatAt(world.x,world.y);
      this.homeDrag={id:event.pointerId,start:point,last:point,moved:false,cat:cat?.breed,offset:cat?{x:cat.x-world.x,y:cat.y-world.y}:undefined};
      if(event.isTrusted)this.canvas.setPointerCapture(event.pointerId);
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
  private homeScreenPoint(event:{clientX:number;clientY:number}){
    const bounds=this.canvas.getBoundingClientRect(),cover=getComputedStyle(this.canvas).objectFit==='cover';
    const scale=(cover?Math.max:Math.min)(bounds.width/this.viewWidth,bounds.height/this.viewHeight);
    return{x:(event.clientX-bounds.left-(bounds.width-this.viewWidth*scale)/2)/scale,y:(event.clientY-bounds.top-(bounds.height-this.viewHeight*scale)/2)/scale};
  }
  private homeView(){
    const bounds=this.canvas.getBoundingClientRect(),fit=getComputedStyle(this.canvas).objectFit==='cover'?'cover':'contain';
    const viewport=displayedCanvasRect(bounds.width,bounds.height,this.viewWidth,this.viewHeight,fit);
    const frame=this.homeCamera.frame(viewport.width,viewport.height);
    return{...frame,x:frame.x+viewport.x,y:frame.y+viewport.y,viewport};
  }
  homeZoom(amount:number){
    if(this.state?.phase!=='home'||(this.pausedByUser&&!this.homeEditing))return;
    if(this.homeDrag?.cat)return;
    if(amount===0)this.homeCamera.reset();else this.homeCamera.changeZoom(amount);
  }
  private homePointerMove=(event:PointerEvent)=>{
    const drag=this.homeDrag;if(!drag||drag.id!==event.pointerId||this.pausedByUser||this.state?.phase!=='home'){this.homeDrag=null;return;}
    const point=this.homeScreenPoint(event);
    if(Math.hypot(point.x-drag.start.x,point.y-drag.start.y)>4)drag.moved=true;
    if(drag.moved&&!drag.cat){const view=this.homeView();this.homeCamera.pan(point.x-drag.last.x,point.y-drag.last.y,view.viewport.width,view.viewport.height);}
    if(drag.moved&&drag.cat)this.canvas.style.cursor='grabbing';
    drag.last=point;
  };
  private homePointerUp=(event:PointerEvent)=>{
    const drag=this.homeDrag;this.homeDrag=null;this.canvas.style.cursor='';
    if(!drag||drag.id!==event.pointerId||this.pausedByUser||this.state?.phase!=='home')return;
    if(drag.cat&&drag.moved){this.dropHomeCat(drag.cat,this.homeScreenPoint(event),drag.offset);return;}
    if(drag.moved)return;
    const point=this.homeScreenPoint(event),view=this.homeView();
    const x=(point.x-view.x)/view.scale,y=(point.y-view.y)/view.scale;
    this.canvas.dataset.homeInteraction=JSON.stringify({kind:'point',x,y});
    if(!this.pokeHomeCat(x,y))this.inviteFurnitureCat(x,y);
  };
  private homePointerCancel=()=>{this.homeDrag=null;this.canvas.style.cursor='';delete this.canvas.dataset.homeDropTarget;};
  private homeWheel=(event:WheelEvent)=>{
    if(this.state?.phase!=='home'||this.state.chapterId==='prologue'||(this.pausedByUser&&!this.homeEditing))return;
    event.preventDefault();this.homeZoom(event.deltaY<0?.15:-.15);
  };
  start() {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clearInput);
    this.canvas.addEventListener('pointerdown', this.pointerdown);
    this.canvas.addEventListener('pointermove',this.homePointerMove);
    this.canvas.addEventListener('pointerup',this.homePointerUp);
    this.canvas.addEventListener('pointercancel',this.homePointerCancel);
    this.canvas.addEventListener('wheel',this.homeWheel,{passive:false});
    this.canvas.addEventListener('wheel', this.wheel, {passive: false});
    this.previousTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  destroy() {
    this.destroyed = true;cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clearInput);
    this.canvas.removeEventListener('pointerdown', this.pointerdown);
    this.canvas.removeEventListener('pointermove',this.homePointerMove);
    this.canvas.removeEventListener('pointerup',this.homePointerUp);
    this.canvas.removeEventListener('pointercancel',this.homePointerCancel);
    this.canvas.removeEventListener('wheel',this.homeWheel);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.clearInput();
  }
  private tick = (timestamp: number) => {
    if (this.destroyed) return;
    const delta = Math.min(timestamp - this.previousTime, 50);this.previousTime = timestamp;this.now = timestamp;
    this.update(delta);this.frame = requestAnimationFrame(this.tick);
  };
  private update(delta: number) {
    if(this.state?.mapId==='warehouse'&&!this.warehouseLoading)void this.enableWarehousePreview().catch(error=>{this.onInspectHint?.(String(error));});
    if (this.warehousePreview && (!this.state || this.state.mapId==='warehouse')) {
      if(this.state)this.warehousePreview.syncState(this.state);
      const active = !this.pausedByUser && document.visibilityState !== 'hidden' && (!this.state||this.state.phase==='explore');
      if (!active) this.clearInput();
      const dx = Number(this.keys.has('arrowright') || this.keys.has('d') || this.held.has('right')) - Number(this.keys.has('arrowleft') || this.keys.has('a') || this.held.has('left'));
      const dy = Number(this.keys.has('arrowdown') || this.keys.has('s') || this.held.has('down')) - Number(this.keys.has('arrowup') || this.keys.has('w') || this.held.has('up'));
      if(active)this.warehousePreview.update(delta,dx,dy,this.state?(id,floor,point)=>this.onMarketZone?.(id,floor,point)??Promise.resolve(false):undefined);
      this.warehousePreview.draw(this.context, this.viewWidth, this.viewHeight, delta);
      const point = this.warehousePreview.positionNow();
      this.canvas.dataset.renderedScene = this.state?'chapter5-warehouse':'warehouse-walk-review';
      this.canvas.dataset.mapId='warehouse';this.canvas.dataset.phase=this.state?.phase??'explore';
      this.canvas.dataset.ready = String(this.warehousePreview.isReady);
      this.canvas.dataset.playerX = point.x.toFixed(2); this.canvas.dataset.playerY = point.y.toFixed(2);
      this.canvas.dataset.floor=this.warehousePreview.layer;
      this.onWarehousePosition?.(this.warehousePreview.layer,point);
      const target=this.warehousePreview.nearTarget;this.onNear(!!target,target?.id,target?.label);this.onInspectHint?.(this.warehousePreview.hint);
      return;
    }
    if (!this.state) return;
    if (this.state.mapId === 'market' || this.storyScene === 'market') this.marketFrame=measureMarketCameraFrame(this.canvas,this.viewWidth,this.viewHeight);
    const mode = this.state.phase;
    if(this.marketTransition.active&&(mode!=='explore'||this.state.mapId!=='market')){const interrupted=this.marketTransition.cancel();if(interrupted){this.marketFloor=interrupted.floor;this.x=interrupted.position.x;this.y=interrupted.position.y;}this.marketTransitionHeight=0;}
    if (mode !== this.lastMode || this.state.mapId !== this.lastMapId) {
      const mapChanged = this.state.mapId !== this.lastMapId;
      if (mapChanged && this.state.mapId === 'market') {this.marketInitialized = false;this.marketExitRequested = false;}
      this.clearInput();
      if (mode === 'explore') {
        if (this.state.mapId === 'alley') {
          if (mapChanged || (this.lastMode === 'dialogue' && this.state.flags.includes('alley_rescued'))) this.rainyAlley.reset(this.state.flags, this.state.alleyBattleReturn);
        } else if (this.state.mapId === 'tunnel') {
          if (mapChanged) this.tunnelMap.reset();
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
    if (mode === 'explore' && active && this.state.mapId==='market'&&this.marketTransition.active) {
      const transition=this.marketTransition.advance(delta);
      if(transition){this.x=transition.x;this.y=transition.y;this.marketTransitionHeight=transition.height;this.marketFloor=transition.floor;this.onWorldPosition?.({x:this.x,y:this.y});if(transition.done)this.marketTransitionHeight=0;}
    } else if (mode === 'explore' && active && this.state.mapId === 'alley') {
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
    } else if (mode === 'explore' && active && this.state.mapId === 'tunnel') {
      const dx = Number(this.keys.has('arrowright') || this.keys.has('d') || this.held.has('right')) - Number(this.keys.has('arrowleft') || this.keys.has('a') || this.held.has('left'));
      const dy = Number(this.keys.has('arrowdown') || this.keys.has('s') || this.held.has('down')) - Number(this.keys.has('arrowup') || this.keys.has('w') || this.held.has('up'));
      this.tunnelMap.update(delta, dx, dy, this.state.flags, zoneId => this.onRandomZone?.(zoneId) ?? Promise.resolve(false), id => {
        // The G trigger runs inside update, before the ordinary frame report.
        // Publish its current point before App builds the server-validated command.
        this.onWorldPosition?.(this.tunnelMap.positionNow());
        this.onInteract(id);
      }, this.state.drawnEvents);
      const target = this.tunnelMap.nearTarget;
      const id = target?.id ?? '';
      if (id !== this.nearbyInteractionId) {
        this.nearbyInteractionId = id;
        this.onNear(!!target, id || undefined, target?.label);
      }
      this.onInspectHint?.(this.tunnelMap.hint);
      this.onWorldPosition?.(this.tunnelMap.positionNow());
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
        const target=marketInteractionTarget(this.marketFloor,this.x,this.y,this.state.flags,this.state.drawnEvents??[]);
        const nearCrow=target?.id==='market_crow_stall';
        const nearPigeon=target?.id==='market_pigeon_perch';
        const nearMomo=target?.id==='market_momo_trace';
        nearInteraction=!!target;
        this.onNear(!!target,target?.id,target?.label);

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
        if(nearMomo)inspect='E · 查看墨墨的踪迹';
        this.onInspectHint?.(inspect);
        const bossReady=this.state.flags.includes('market_crow_clue_completed')&&this.state.flags.includes('market_pigeon_clue_completed');
        if(nearMomo)this.onInspectHint?.('E · 查看墨墨的踪迹');
        const portal=marketPortals.filter(value=>!value.requiresFlag||this.state!.flags.includes(value.requiresFlag)).flatMap(value=>[{portal:value,point:value.a},{portal:value,point:value.b}]).filter(value=>value.point.layer===this.marketFloor&&Math.hypot(this.x-value.point.x,this.y-value.point.y)<=value.portal.radius).sort((a,b)=>Math.hypot(this.x-a.point.x,this.y-a.point.y)-Math.hypot(this.x-b.point.x,this.y-b.point.y))[0];
        if(portal)this.onInspectHint?.(`${portal.portal.key.toUpperCase()} · ${portal.portal.label.split(' · ')[1]}`);
        else if(!target&&this.marketFloor==='L0'&&Math.hypot(this.x-1310,this.y-169)<72&&!bossReady)this.onInspectHint?.('集市保卫战 · 需要先完成两条情报');
        else if(!target&&this.marketFloor==='L0'&&Math.hypot(this.x-1365,this.y-78)<48&&!this.state.flags.includes('market_cleared'))this.onInspectHint?.('北街出口 · 请先完成集市保卫战');
        const battleAction=marketEAction(this.marketFloor,this.x,this.y,this.state.flags,this.state.drawnEvents??[]);
        if(battleAction?.type==='battle')this.onInspectHint?.('E · 开始集市保卫战');
        else if(battleAction?.type==='hint')this.onInspectHint?.(battleAction.text);
        const authoredFocus=!!target||!!portal||Math.hypot(this.x-1310,this.y-169)<=75||Math.hypot(this.x-1365,this.y-78)<=48;
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
    if (mode === 'explore' && active && this.state.mapId === 'market' && !this.marketTransition.active) {
      const insideExit=marketExitAt(this.marketFloor,this.x,this.y,this.state.flags);
      if(!insideExit)this.marketExitRequested=false;
      else if(!this.marketExitRequested){this.marketExitRequested=true;this.clearInput();this.onMarketExit?.(this.marketFloor,{x:this.x,y:this.y});}
    }
    if (mode === 'battle' && active && this.simulation) {
      this.simulation.update(delta / 1000);
      if (this.simulation.outcome && !this.reported) {this.reported = true;this.onResult({attemptId: this.attemptId, outcome: this.simulation.outcome});}
    }
    // Only home's free phase runs daily life. Dialogue has exclusive direction;
    // the home clock also freezes for menus, pending commands and hidden tabs.
    const homeVisible = mode === 'home' || (mode === 'dialogue' && this.storyScene === 'home') || (this.state.mapId === 'greenhouse' && !this.storyScene);
    if (homeVisible && this.state.chapterId !== 'prologue') {
      this.ensureHomeCats(this.homeStage());
      if (active) {this.homeTime += delta; this.stepHomeCats(delta, this.homeStage());}
    }
    this.graphics.clear();
    // CanvasPainter.fillStyle() changes globalAlpha; clearRect() does not reset it.
    // Reset frame-wide compositing before drawing the integrated background and cat.
    this.context.globalAlpha = 1;
    this.context.globalCompositeOperation = 'source-over';
    this.context.imageSmoothingEnabled = false;
    const exploreScene = mode === 'explore' ? explorationScene(this.state.mapId) : null;
    if (mode === 'explore') {
      if (exploreScene === 'alley') this.rainyAlley.draw(this.context, this.viewWidth, this.viewHeight, this.state.flags, {phase: mode, randomEligible: this.randomEligible});
      else if (exploreScene === 'market') this.drawMarket();
      else if (exploreScene === 'tunnel') this.tunnelMap.draw(this.context, this.viewWidth, this.viewHeight, this.state.flags, this.state.drawnEvents);
      else {this.context.fillStyle = '#18282a';this.context.fillRect(0, 0, this.viewWidth, this.viewHeight);this.context.fillStyle = '#fff';this.context.fillText('探索地图尚未开放', 30, 50);}
    }
    else if (mode === 'battle') this.drawBattle();
    else if (mode === 'dialogue' && this.storyScene === 'home') this.drawHome();
    else if (mode === 'home') this.drawHome();
    else if (mode === 'dialogue' && this.storyScene === 'tunnel' && this.state.mapId !== 'tunnel') this.drawTunnel();
    else if (this.state.mapId === 'tunnel') this.tunnelMap.draw(this.context, this.viewWidth, this.viewHeight, this.state.flags, this.state.drawnEvents);
    else if (this.storyScene === 'tunnel') this.drawTunnel();
    else if (this.state.mapId === 'market' || this.storyScene === 'market') this.drawMarket();
    else if (this.state.mapId === 'greenhouse' || (this.state.qaCheckpointId?.startsWith('event:warehouse:') && mode === 'event')) this.drawHome();
    else if (this.state.mapId === 'alley') this.rainyAlley.draw(this.context, this.viewWidth, this.viewHeight, this.state.flags, {phase: mode, eventId: this.state.pendingEventId, pendingEventSource: this.state.pendingEventSource, randomEligible: this.randomEligible});
    else this.drawAlley();
    if (this.pausedByUser && !this.homeEditing) {this.graphics.fillStyle(0x18282a, .6);this.graphics.fillRect(0, 0, 800, 480);}
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') this.publishNavigationDiagnostics();
  }
  private publishNavigationDiagnostics() {
    if (!this.state) return;
    const state = this.state;
    let scene = 'fallback', floor = this.marketFloor, position = {x: this.x, y: this.y};
    if (state.phase === 'battle') scene = 'battle';
    else if (state.phase === 'home' || (state.phase === 'dialogue' && this.storyScene === 'home')) scene = 'home';
    else if (state.mapId === 'tunnel') {scene = 'chapter4-tunnel';floor = this.tunnelMap.layer;position = this.tunnelMap.positionNow();}
    else if (state.mapId === 'market' || (state.phase === 'dialogue' && this.storyScene === 'market')) scene = 'night-market';
    else if (state.mapId === 'alley') {scene = 'rainy-alley';floor = 'L0';position = this.rainyAlley.worldPosition();}
    else if (state.mapId === 'greenhouse') scene = 'home';
    else if (this.storyScene === 'tunnel') scene = 'tunnel-story-preview';
    this.canvas.dataset.renderedScene = scene;
    this.canvas.dataset.mapId = state.mapId;
    this.canvas.dataset.phase = state.phase;
    this.canvas.dataset.playerX = position.x.toFixed(2);
    this.canvas.dataset.playerY = position.y.toFixed(2);
    this.canvas.dataset.floor = floor;
    if (scene === 'home' && state.chapterId !== 'prologue') {
      this.canvas.dataset.homeLayout = HOME_LAYOUT_ID;
      this.canvas.dataset.homeControl = this.homeBeat ? 'story' : state.phase === 'home' ? 'free' : 'held';
      this.canvas.dataset.homeBeat = this.homeBeat?.id ?? '';
      this.canvas.dataset.homeStage = String(this.homeStage());
      this.canvas.dataset.homeTime = this.homeTime.toFixed(0);
      this.canvas.dataset.homeFurniture=JSON.stringify(homeObjects(this.state!).filter(o=>o.furnitureId).map(o=>{const frame=HOME_FRAMES[o.sprite];return{id:o.furnitureId,slot:o.slot,x:o.x,y:o.y,width:o.width,height:o.width*frame.height/frame.width};}));
      this.canvas.dataset.homeCats = JSON.stringify(this.homeEditing?[]:this.homeCats.map(cat => ({breed: cat.breed, x: Math.round(cat.x), y: Math.round(cat.y), pose: cat.pose, slot:cat.slot, action: cat.action, height: Math.round(cat.scriptedHeight ?? 0), bubble:cat.bubbleUntil>this.homeTime&&this.homeTime>=(cat.bubbleAt??0)?cat.bubble:null,social:cat.social?.kind,partner:cat.social?.partner,held:this.homeDrag?.cat===cat.breed})));
      this.canvas.dataset.homeCamera=JSON.stringify({...this.homeView(),zoom:this.homeCamera.zoom,worldWidth:HOME_SIZE.width,worldHeight:HOME_SIZE.height});
      this.canvas.dataset.homeArtwork=this.homeArtwork?'ready':this.homeAssetError?'error':'loading';
      this.canvas.dataset.homeObjects=JSON.stringify(homeObjects(state));
    } else {
      for (const name of ['homeLayout', 'homeControl', 'homeBeat', 'homeStage', 'homeTime', 'homeCats','homeCamera','homeArtwork','homeObjects','homeFurniture','homeInteraction']) delete this.canvas.dataset[name];
    }
  }
  private rect(x:number,y:number,w:number,h:number,color:number,alpha=1){this.graphics.fillStyle(color,alpha);this.graphics.fillRect(Math.round(x),Math.round(y),w,h);}
  private cat(x:number,y:number,breed:CatBreed='miaomiao'){this.graphics.cat(x,y,breed);}
  private lamp(x:number,y:number){this.graphics.fillStyle(0xf9d78a,.12);this.graphics.fillCircle(x,y,45);this.rect(x-8,y-18,16,24,0x60786c);this.rect(x-5,y-15,10,16,0xffe1a0);this.rect(x-11,y+6,22,5,0x496259);}
  // —— 以下立体像素家具绘制法移植自 feat/ui-immersion-polish（阴影腔/瓦楞/流苏/绗缝细节） ——
  private pixelEllipse(cx:number,cy:number,rx:number,ry:number,color:number,alpha=1){
    if(ry<=0){this.rect(cx-rx,cy,rx*2,1,color,alpha);return;}
    for(let dy=-ry;dy<=ry;dy++){
      const w=Math.round(rx*Math.sqrt(Math.max(0,1-(dy/ry)**2)));
      if(w>0)this.rect(cx-w,cy+dy,w*2,1,color,alpha);
    }
  }
  // 对话气泡锚点：返回说话猫头顶在画布中的位置（不在场返回 null，走旁白字幕条）。
  // 顶栏展开态通知（雨巷）：小地图下移避让，收起时归位。
  setTopbarExpanded(expanded:boolean){
    this.rainyAlley.setMinimapShift(expanded?62:0);
  }
  speakerAnchor(breed:CatBreed):{x:number;y:number}|null{
    const st=this.state;if(!st||st.phase==='battle')return null;
    if((st.phase==='home'||this.storyScene==='home')&&st.chapterId!=='prologue'){
      const cat=this.homeCats.find(cat=>cat.breed===breed);if(!cat)return null;
      const view=this.homeView();
      return{x:view.x+cat.x*view.scale,y:view.y+(cat.y-68-(cat.scriptedHeight??0))*view.scale};
    }
    if(st.mapId==='market'||st.chapterId==='market'||this.storyScene==='market'){
      // 午夜集市是跟随相机的 1672×941 世界地图，且场景只绘制喵喵——团子等伙伴不在渲染列表里，
      // 头顶锚点不成立。返回 null 让 DialogueBubble 降级为屏幕底部字幕条，不再出现指向空位置的气泡。
      return null;
    }
    if(st.phase==='home'||this.storyScene==='home'||(st.flags.includes('rescue_story_done')&&st.phase!=='explore')){
      if(breed==='miaomiao')return{x:265,y:298};
      if(breed==='tuanzi'&&st.chapterId!=='prologue')return{x:390,y:288};
      if(breed==='diandian'&&st.cats.includes('diandian'))return{x:515,y:303};
      return null;
    }
    if(breed==='miaomiao')return{x:this.x,y:this.y-52};
    if(breed==='tuanzi'&&!st.flags.includes('alley_rescued'))return{x:120,y:248};
    if(breed==='diandian'&&!st.flags.includes('alley_rescued'))return{x:570,y:227};
    return null;
  }
  private bowl(cx:number,cy:number){
    this.pixelEllipse(cx,cy+15,26,5,0x24312e,.28);            // 地面投影
    this.pixelEllipse(cx,cy+11,23,6,0x085aa6);                // 碗底暗面
    this.rect(cx-24,cy+6,48,5,0x0a6fbe);                      // 碗身中段（过渡色）
    this.rect(cx-27,cy+3,54,4,0x0f86d6);                      // 碗身上段（受光面）
    this.rect(cx-27,cy+3,54,1,0x47b4e6);                      // 上缘反光
    this.rect(cx-26,cy+4,2,9,0x47b4e6,.75);                   // 左侧竖向高光
    this.rect(cx+24,cy+5,2,8,0x06508f,.8);                    // 右侧暗面
    this.pixelEllipse(cx,cy-1,27,7,0x47b4e6);                 // 碗口外沿（亮蓝）
    this.pixelEllipse(cx,cy,21,5,0x084f86);                   // 内腔深色
    this.pixelEllipse(cx,cy+1,16,3,0xd9b877);                 // 猫粮堆
    const bits=[[-12,0],[-6,-1],[0,0],[6,-1],[12,0],[-9,2],[3,2],[9,2]];
    for(const [dx,dy] of bits)this.rect(cx+dx-1,cy+dy,3,2,(dx+dy)%2?0xc9a86b:0xefd9a8);
    this.rect(cx-20,cy-7,9,2,0xbfe9fb);                       // 碗口左上像素高光
    this.rect(cx-25,cy-5,4,2,0xbfe9fb,.85);
    this.rect(cx+13,cy-7,6,2,0x6fc6f0,.6);                    // 右上弱高光（过渡）
  }
  // 毛毯：完全平铺的扁毯——圆角毯身 + 暖色花纹内框 + 横向折痕 + 两端流苏，与立体猫窝拉开剪影差异。
  private blanket(cx:number,cy:number){
    const base=0xe8b9a0, light=0xf5d9c2, warm=0xc98a6b, deep=0x9c6e60, fringe=0xb87f63;
    this.pixelEllipse(cx,cy+11,33,4,0x24312e,.13);            // 极浅投影（贴地扁平，无厚度）
    const w=66,h=16;
    for(let dy=0;dy<h;dy++){
      const inset=dy<2?2:dy>h-3?3:0;                          // 上下行收角 → 像素圆角矩形
      this.rect(cx-w/2+inset,cy-h/2+dy,w-inset*2,1,base);
    }
    this.rect(cx-w/2+4,cy-h/2+2,w-8,1,light,.7);              // 顶缘受光
    this.rect(cx-w/2+4,cy+h/2-3,w-8,1,deep,.5);               // 底缘暗面
    // 暖色花纹：内框描边一圈 + 中列菱形纹
    this.rect(cx-w/2+5,cy-h/2+4,w-10,1,warm,.8);
    this.rect(cx-w/2+5,cy+h/2-5,w-10,1,warm,.8);
    this.rect(cx-w/2+5,cy-h/2+4,1,h-8,warm,.7);this.rect(cx+w/2-6,cy-h/2+4,1,h-8,warm,.7);
    for(let i=-3;i<=3;i++)this.rect(cx+i*9-1,cy+((i%2)?-1:0),2,2,warm,.9);
    this.rect(cx-2,cy-3,4,1,light,.9);                        // 花纹上高光
    // 横向折痕：暗痕 + 各自 1px 亮脊，布料铺开的起伏
    this.rect(cx-24,cy-2,22,1,deep,.45);this.rect(cx-24,cy-3,22,1,light,.5);
    this.rect(cx+4,cy+3,20,1,deep,.4);this.rect(cx+4,cy+2,20,1,light,.45);
    // 两端流苏：左右边缘交替双色短穗
    for(let i=0;i<5;i++){
      const fy=cy-h/2+3+i*3, c=i%2?fringe:light;
      this.rect(cx-w/2-3,fy,3,1,c,.9);this.rect(cx-w/2-3,fy+1,2,1,c,.55);
      this.rect(cx+w/2,fy,3,1,c,.9);this.rect(cx+w/2+1,fy+1,2,1,c,.55);
    }
  }
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
  // Layout coordinates are shared with the chapter-map preview.
  private static readonly homeRoamNodes = HOME_ROAM_NODES;
  private static readonly homeShelterNodes = HOME_SHELTER_NODES;
  private static readonly homeCatDefaults = Object.fromEntries(Object.entries(HOME_RESIDENTS).map(([id, p]) => [id, [p.x, p.y]]));
  // 日常开始时优先使用偏好家具，活动结束后恢复自由行动。
  private static readonly homeAffinities: readonly {breed: CatBreed; poses: Readonly<Record<string, string>>}[] = [
    {breed: 'momo', poses: {...Object.fromEntries(PARCEL_IDS.filter(id=>PARCEL_ART[id].cat==='momo').map(id=>[id,PARCEL_ART[id].pose])),moon_hammock: 'hammock_sleep'}},
    {breed: 'tuanzi', poses: {...Object.fromEntries(PARCEL_IDS.filter(id=>PARCEL_ART[id].cat==='tuanzi').map(id=>[id,PARCEL_ART[id].pose])),snack_cushion: 'knead', blue_bowl: 'bowl_eat'}},
    {breed: 'diandian', poses: {...Object.fromEntries(PARCEL_IDS.filter(id=>PARCEL_ART[id].cat==='diandian').map(id=>[id,PARCEL_ART[id].pose])),box_castle: 'castle_peek'}},
    {breed: 'miaomiao', poses: {...Object.fromEntries(PARCEL_IDS.filter(id=>PARCEL_ART[id].cat==='miaomiao').map(id=>[id,PARCEL_ART[id].pose])),soft_blanket: 'belly', sun_lamp: 'belly'}}
  ];
  private static readonly pokeLines: Record<CatBreed, string> = {
    miaomiao: '（傲娇扭头）哼，本咪只是允许你碰一下下……就一下！',
    tuanzi: '咕噜噜……两脚兽，你口袋里有藏小鱼干吗？',
    diandian: '（小心探头）……有你在，这里好安全。',
    momo: '（目光如炬）……四周很安全，放心休息吧。'
  };
  // 花房阶段:1 漏雨避雨处 → 2 封窗止水(greenhouse_sealed) → 3 原木温室(greenhouse_fortified_full) → 4 王国庆典(剧情 flag)。
  private homeStage(): number {return this.state ? homeStage(this.state) : 1;}
  private drawHome(){
    if(this.state?.chapterId === 'prologue'){this.drawPrologueHome();return;}
    if(!this.state)return;
    if(this.pausedByUser&&!this.homeEditing)this.homePointerCancel();
    if(!this.homeAssetLoading){
      this.homeAssetLoading=true;
      void loadHomeArtwork().then(art=>{if(!this.destroyed)this.homeArtwork=art;}).catch(()=>{if(!this.destroyed)this.homeAssetError=true;});
    }
    if(this.homeEditing){
      const {state,selection,valid}=this.homeEditing,ctx=this.context,view=this.homeView();
      ctx.save();ctx.fillStyle='#13262e';ctx.fillRect(0,0,this.viewWidth,this.viewHeight);
      ctx.beginPath();ctx.rect(view.viewport.x,view.viewport.y,view.viewport.width,view.viewport.height);ctx.clip();
      ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);paintHomestead(ctx,state,this.homeArtwork);
      const selected=homeInventory(state).find(i=>i.layoutKey===selection&&!i.stored);
      if(selected){const f=HOME_FRAMES[selected.sprite],h=selected.width*f.height/f.width;ctx.strokeStyle=valid?'#ffe19a':'#ff8377';ctx.lineWidth=2/view.scale;ctx.setLineDash([7/view.scale,4/view.scale]);ctx.strokeRect(selected.x-selected.width/2-5,selected.y-h-5,selected.width+10,h+10);ctx.setLineDash([]);}
      ctx.restore();
      if(import.meta.env.DEV||import.meta.env.MODE==='e2e'){this.canvas.dataset.editorView=JSON.stringify(view);this.canvas.dataset.editorItems=JSON.stringify(homeInventory(state));}
      return;
    }
    const key=homeAppearanceKey(this.state)+(this.homeArtwork?'|loaded':'|loading');
    if(!this.homeBackdrop||this.homeBackdropKey!==key){
      this.homeBackdrop=document.createElement('canvas');
      this.homeBackdrop.width=HOME_SIZE.width;this.homeBackdrop.height=HOME_SIZE.height;
      paintHomeStructure(this.homeBackdrop.getContext('2d')!,this.state,this.homeArtwork);
      this.homeBackdropKey=key;
    }
    const view=this.homeView(),ctx=this.context;
    ctx.save();ctx.fillStyle='#13262e';ctx.fillRect(0,0,this.viewWidth,this.viewHeight);
    ctx.beginPath();ctx.rect(view.viewport.x,view.viewport.y,view.viewport.width,view.viewport.height);ctx.clip();
    ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    ctx.drawImage(this.homeBackdrop,0,0);
    const stage=this.homeStage();this.drawHomeCats(stage);
    paintHomeFrontWall(ctx,this.state,this.homeArtwork);
    for(const object of homeObjects(this.state).filter(object=>object.front))paintHomeObject(ctx,object,this.homeArtwork);
    this.drawHomeFx(stage);this.drawHomeCarry();ctx.restore();
    for(const cat of this.homeCats)if(cat.bubble&&cat.bubbleUntil>this.homeTime&&this.homeTime>=(cat.bubbleAt??0))this.drawSpeechBubble(view.x+cat.x*view.scale,view.y+cat.y*view.scale,cat.bubble);
    if(this.homeAssetError){ctx.save();ctx.fillStyle='#f5dfbf';ctx.font='14px sans-serif';ctx.fillText('花房素材加载失败，请刷新重试',view.viewport.x+15,view.viewport.y+40);ctx.restore();}
  }
  // 序章:喵喵原本的家,午后阳光与天蓝色饭碗(静态,不参与花房修缮系统)。
  private drawPrologueHome(){
    this.rect(0,0,800,480,0xa6bba0);this.rect(110,65,580,350,0xd2d0ab);this.rect(100,61,600,18,0x688775);
    for(let x=110;x<=690;x+=145)this.rect(x,78,8,230,0x799782);
    this.rect(118,310,563,100,0xbba982);for(let y=320;y<410;y+=22)this.rect(118,y,563,2,0x9f916f,.6);
    this.rect(270,88,260,173,0xb2c8b6);this.rect(395,88,8,173,0x7c9986);this.rect(270,164,260,8,0x7c9986);
    this.rect(135,240,55,75,0x8f9c73);for(let i=0;i<5;i++)this.rect(130+i*13,210-(i%2)*18,14,45,0x6d8d6a);
    this.cat(265,350);
    // 晒着阳光的柔软毛毯（平铺毯身 + 花纹 + 折痕 + 流苏）与标志性天蓝色饭碗（立体透视碗口）。
    this.blanket(267, 348);
    this.bowl(335, 352);
    this.graphics.fillStyle(0xfff0ad, 0.15);
    this.graphics.fillCircle(280, 340, 70);
    this.lamp(610,200);for(let i=0;i<8;i++)this.rect(145+i*70,98+(i%2)*6,5,9,0xf4d68e);
  }
  // —— 猫咪动态层:专属家具姿态优先,其余自由漫步 ——
  private ensureHomeCats(stage:number):HomeCatAgent[]{
    const state = this.state;
    if(!state)return this.homeCats;
    const beat = homeStoryBeat(state, this.storyNode);
    const signature = `${homeAppearanceKey(state)}|${state.cats.join(',')}|${beat?.id ?? 'daily'}`;
    if(signature===this.homeCatsSignature)return this.homeCats;
    const previous = new Map(this.homeCats.map(cat => [cat.breed, cat]));
    if(beat&&!this.homeBeat)this.homeCamera.reset();
    this.homePointerCancel();
    this.homeCatsSignature = signature;
    this.homeCats = [];
    this.homeHearts = [];
    this.homePokeCooldownUntil = 0;
    this.homeBeat = beat;
    this.homeBeatStartedAt = this.homeTime;
    if(beat){
      for(const actor of beat.actors){
        const from = actor.from ?? previous.get(actor.breed) ?? actor.at;
        const cat = this.createHomeCat(actor.breed, stage, null, from.x, from.y);
        cat.x=from.x;cat.y=from.y;
        cat.scripted={actor, from:{x:from.x,y:from.y}};
        this.homeCats.push(cat);
      }
      return this.homeCats;
    }
    const claimed = new Set<string>();
    for(const affinity of DemoScene.homeAffinities){
      if(!state.cats.includes(affinity.breed))continue;
      const object=homeObjects(state).find(o=>o.furnitureId&&affinity.poses[o.furnitureId]!==undefined&&!claimed.has(o.furnitureId));
      const entry=object?.furnitureId?[object.slot??object.layoutKey,object.furnitureId]:undefined;
      if(!entry)continue;
      claimed.add(entry[1]);
      const point=homePosePoint(entry[0],entry[1],object);
      const cat=this.createHomeCat(affinity.breed,stage,affinity.poses[entry[1]],point.x,point.y);cat.slot=entry[0];
      if(entry[1] in PARCEL_ART){
        const from=previous.get(affinity.breed)??HOME_RESIDENTS[affinity.breed];
        cat.furnitureArrival={from:{x:from.x,y:from.y},to:point,pose:cat.pose!,started:this.homeTime};cat.pose=null;cat.x=from.x;cat.y=from.y;
      }
      this.homeCats.push(cat);
    }
    for(const breed of state.cats as CatBreed[]){
      if(!(breed in HOME_RESIDENTS) || this.homeCats.some(cat=>cat.breed===breed))continue;
      const [dx,dy]=DemoScene.homeCatDefaults[breed];
      const cat = this.createHomeCat(breed, stage, null, dx, dy);
      const last = previous.get(breed);
      if(stage>=2 && last && homeWalkable(last,homeObjects(state))){cat.x=last.x;cat.y=last.y;}
      this.homeCats.push(cat);
    }
    settleCats(this.homeCats,homeObjects(state),this.homeTime);
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
    return {breed, pose, x, y, poseUntil:pose?this.homeTime+12000:undefined, nodes, nodeIndex:0, action:'sit', thinkAt:this.homeTime+2500+(seed%4)*1300, facing:seed%2?1:-1, seed, noseUntil:0, noseCooldownUntil:0, bubble:null, bubbleUntil:0, startledUntil:0};
  }
  // 漫步/碰鼻礼状态机:在 update 中以真实时间步进。
  private stepHomeCats(deltaMs:number, stage:number){
    const cats = this.ensureHomeCats(stage);
    if(this.homeBeat){
      for(const cat of cats){
        if(!cat.scripted)continue;
        const p = storyActorPosition(cat.scripted.actor, cat.scripted.from, this.homeTime-this.homeBeatStartedAt, this.homeBeat.duration);
        const dx = p.x-cat.x;
        cat.x=p.x;cat.y=p.y;cat.scriptedHeight=p.height;cat.action=p.moving?'walk':'sit';
        const focus=this.homeBeat.lookAt ?? cats.find(c=>c.breed===this.homeBeat?.speaker);
        if(Math.abs(dx)>0.1)cat.facing=dx>0?1:-1;
        else if(focus && Math.abs(focus.x-cat.x)>8)cat.facing=focus.x>cat.x?1:-1;
      }
      return;
    }
    if(this.state?.phase!=='home')return;
    stepHomeLife(cats,homeObjects(this.state),this.homeTime,deltaMs,stage,this.homeDrag?.cat);
    const newest=Math.max(-1,...cats.map(c=>c.social?.started??-1));
    if(newest>this.homeSocialStamp){this.homeSocialStamp=newest;for(const c of cats)if(c.social?.started===newest)this.homeHearts.push({x:c.x,y:c.y-65,born:this.homeTime});}
    this.homeHearts=this.homeHearts.filter(h=>this.homeTime-h.born<1100);
  }
  private drawHomeCats(stage:number){
    const objects=homeObjects(this.state!).filter(o=>!o.front),cats=this.ensureHomeCats(stage).filter(c=>!(this.homeDrag?.cat===c.breed&&this.homeDrag.moved));
    const residents=cats.filter(c=>!c.slot),seated=cats.filter(c=>c.slot);
    const layers=[...objects.map(o=>({y:o.y,object:o,cat:undefined as HomeCatAgent|undefined})),...residents.map(c=>({y:c.y,object:undefined,cat:c}))].sort((a,b)=>a.y-b.y);
    for(const layer of layers)if(layer.object)paintHomeObject(this.context,layer.object,this.homeArtwork,this.homeTime);else if(layer.cat)paintResident(this.context,layer.cat,this.homeTime,stage);
    // Reserved furniture users draw after their furniture. Repainting an entire
    // castle / shelf crop used to cover the cat with the opaque new sprites.
    for(const cat of seated.sort((a,b)=>a.y-b.y)){
      paintResident(this.context,cat,this.homeTime,stage);
      const host=objects.find(o=>(o.slot??o.layoutKey)===cat.slot);
      if(host&&!cat.furnitureArrival)paintHomeFurnitureFront(this.context,host,this.homeArtwork);
    }
    for(const cat of cats)if(cat.social&&this.homeTime>cat.social.started+900)this.drawPixelHeart(cat.x,cat.y-70-Math.sin(this.homeTime*.003)*4,1.3,.8);
  }
  private homeCatAt(x:number,y:number,exclude?:CatBreed){
    return [...this.homeCats].sort((a,b)=>b.y-a.y).find(c=>c.breed!==exclude&&Math.abs(c.x-x)<33&&y>=c.y-62&&y<=c.y+12);
  }
  private dropHomeCat(breed:CatBreed,point:{x:number;y:number},offset={x:0,y:24}){
    if(!this.state||this.state.phase!=='home'||this.homeBeat)return;
    const view=this.homeView(),x=(point.x-view.x)/view.scale,y=(point.y-view.y)/view.scale,cat=this.homeCats.find(c=>c.breed===breed);if(!cat)return;
    const objects=homeObjects(this.state),partner=this.homeCatAt(x,y,breed);
    if(partner&&socialize(cat,partner,SOCIAL_KINDS[this.homeSocialSerial++%SOCIAL_KINDS.length],this.homeCats,objects,this.homeTime)){
      this.canvas.dataset.homeInteraction=JSON.stringify({kind:'social',breed,partner:partner.breed,activity:cat.social?.kind});return;
    }
    const object=furnitureAt(objects,x,y);
    if(object&&useFurniture(cat,object,this.homeCats,objects,this.homeTime)){
      this.canvas.dataset.homeInteraction=JSON.stringify({kind:'furniture',id:object.furnitureId??object.layoutKey,breed,dragged:true});return;
    }
    const desired={x:x+offset.x,y:y+offset.y};
    if(desired.y<345||desired.y>735||desired.x<95||desired.x>1577){cat.bubble='把我放在花房里就好啦。';cat.bubbleUntil=this.homeTime+2200;return;}
    const spot=freeCatPoint(desired,this.homeCats,objects,breed);if(!spot)return;
    endSocial(cat,this.homeCats,this.homeTime);cat.furnitureArrival=undefined;cat.pose=null;cat.slot=undefined;cat.scriptedHeight=0;cat.target=undefined;cat.action='sit';cat.x=spot.x;cat.y=spot.y;cat.manualUntil=this.homeTime+10000;cat.thinkAt=this.homeTime+10000;
    cat.bubble=object?'这里有人啦，我先在旁边等等。':'这个位置也很舒服，呼噜……';cat.bubbleUntil=this.homeTime+2500;
    this.canvas.dataset.homeInteraction=JSON.stringify({kind:'cat-drop',breed,x:spot.x,y:spot.y});
  }
  private drawHomeCarry(){
    const drag=this.homeDrag;if(!drag?.cat||!drag.moved||!this.state)return;
    const cat=this.homeCats.find(c=>c.breed===drag.cat);if(!cat)return;
    const view=this.homeView(),x=(drag.last.x-view.x)/view.scale,y=(drag.last.y-view.y)/view.scale,objects=homeObjects(this.state),partner=this.homeCatAt(x,y,cat.breed),object=partner?undefined:furnitureAt(objects,x,y),ctx=this.context;
    const target=partner?{kind:'cat',id:partner.breed,label:'和'+CAT_NAMES[partner.breed]+'一起玩'}:object?{kind:'furniture',id:object.layoutKey,label:'在这里玩一会儿'}:{kind:'ground',label:'放在这里'};
    this.canvas.dataset.homeDropTarget=JSON.stringify(target);
    ctx.save();ctx.strokeStyle='#f9d98d';ctx.lineWidth=2/view.scale;ctx.setLineDash([5/view.scale,4/view.scale]);ctx.beginPath();ctx.ellipse(partner?.x??object?.x??x,partner?.y??object?.y??y,40,12,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    paintResident(ctx,{...cat,x,y:y+25,pose:null,social:undefined,scriptedHeight:15,action:'sit'},this.homeTime,this.homeStage(),true);
    ctx.font='18px sans-serif';ctx.fillStyle='#fff0c0';ctx.strokeStyle='#3c3d31';ctx.lineWidth=4;ctx.strokeText(target.label,x-45,y-60);ctx.fillText(target.label,x-45,y-60);ctx.restore();
  }
  private drawPixelHeart(x:number,y:number,scale:number,alpha:number){
    const rows=['0110110','1111111','1111111','0111110','0011100','0001000'];
    for(let r=0;r<rows.length;r++)for(let c=0;c<7;c++)if(rows[r][c]==='1')this.rect(x+(c-3)*scale,y+r*scale,scale,scale,0xef6a7a,alpha);
  }
  // 特效层:漏雨雨滴、破窗外的雨、庆典串灯闪烁、爱心上飘与台词气泡。
  private drawHomeFx(_stage:number){
    if(this.state)paintHomeWeather(this.context,this.state,this.homeTime);
    for(const heart of this.homeHearts){
      const age=this.homeTime-heart.born;
      this.drawPixelHeart(heart.x,heart.y-age*0.018,2,Math.max(0,1-age/1100));
    }
  }
  private drawSpeechBubble(x:number,y:number,text:string){
    const ctx=this.context,view=this.homeView().viewport;
    ctx.save();ctx.globalAlpha=1;ctx.font='12px "Microsoft YaHei",sans-serif';
    const maxWidth=Math.max(120,Math.min(420,view.width-24)),lines:string[]=[];let line='';
    for(const char of text){if(ctx.measureText(line+char).width>maxWidth-20&&line){lines.push(line);line='';}line+=char;}if(line)lines.push(line);
    const width=Math.min(maxWidth,Math.max(...lines.map(value=>ctx.measureText(value).width))+20),height=lines.length*18+14;
    const bx=Math.max(view.x+6,Math.min(view.x+view.width-width-6,x-width/2)),by=Math.max(view.y+76,y-height-54);
    ctx.fillStyle='#fff1d5';ctx.strokeStyle='#806b48';ctx.lineWidth=2;ctx.fillRect(bx,by,width,height);ctx.strokeRect(bx,by,width,height);
    ctx.fillStyle='#493f31';lines.forEach((value,i)=>ctx.fillText(value,bx+10,by+21+i*18));ctx.restore();
  }
  // 点击花房里的猫:受惊小跳 + 治愈台词气泡。
  private pokeHomeCat(x:number,y:number):boolean{
    // Poke throttling must not swallow a click on the next piece of furniture.
    if(this.homeTime<this.homePokeCooldownUntil)return false;
    for(const cat of this.homeCats){
      if(Math.hypot(cat.x-x,(cat.y-26)-y)>34)continue;
      cat.startledUntil=this.homeTime+650;
      this.canvas.dataset.homeInteraction=JSON.stringify({kind:'cat',breed:cat.breed,x,y});
      cat.bubble=DemoScene.pokeLines[cat.breed];cat.bubbleAt=this.homeTime;
      cat.bubbleUntil=this.homeTime+3400;
      this.homePokeCooldownUntil=this.homeTime+280;
      return true;
    }
    return false;
  }
  private inviteFurnitureCat(x:number,y:number){
    if(!this.state||this.state.phase!=='home'||this.homeBeat)return;
    const objects=homeObjects(this.state),object=furnitureAt(objects,x,y);if(!object)return;
    const activity=furnitureActivity(object),cat=this.homeCats.find(c=>c.breed===activity.cat)??this.homeCats.find(c=>!c.social);
    if(!cat)return;
    if(useFurniture(cat,object,this.homeCats,objects,this.homeTime)){
      this.canvas.dataset.homeInteraction=JSON.stringify({kind:'furniture',id:object.furnitureId??object.layoutKey,breed:cat.breed,x,y});this.homePokeCooldownUntil=this.homeTime+280;
    }else {cat.bubble='等伙伴玩好，再轮到我。';cat.bubbleUntil=this.homeTime+2200;}
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
    this.context.fillStyle='rgba(10,16,22,.38)';this.context.beginPath();this.context.ellipse(this.x,this.y+3,9,3,0,0,Math.PI*2);this.context.fill();
    this.context.save();this.context.translate(this.x-16,this.y-30-this.marketTransitionHeight);this.context.scale(.5,.5);drawPixelCat(this.context,'miaomiao','idle');this.context.restore();
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
      const title=item.id==='crow'?'老黑羽情报摊':item.id==='pigeon'?'咕咕大盗传言棚':item.id==='momo'?'墨墨的踪迹':item.id==='boss'?'集市保卫战':flags.includes('market_cleared')?'北街出口 · 第三章花房':'北街出口';
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
    if(this.marketFloor==='L0'){const box=MARKET_EXIT_TRIGGER;ctx.strokeStyle='#f6e775';ctx.lineWidth=2;ctx.strokeRect(box.left,box.top,box.right-box.left,box.bottom-box.top);}
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
