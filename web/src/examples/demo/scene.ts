import type {BattleResult, GameState, StoryNode} from '../../contracts';
import type {CatBreed} from '../../adapters/canvas/pixelCat';
import {DemoBattle} from './battle';
import type {Direction} from '../../adapters/platform/input';
import {CanvasPainter} from '../../adapters/canvas/painter';

// 原生 Canvas 参考场景；地图与塔防模块可分别替换此样例。
export class DemoScene {
  state: GameState | null = null;
  pausedByUser = false;
  storyScene: StoryNode['scene'];
  private graphics: CanvasPainter;
  private held = new Set<Direction>();
  private keys = new Set<string>();
  private x = 180;
  private y = 290;
  private lastMode = '';
  private attemptId = '';
  private simulation: DemoBattle | null = null;
  private reported = false;
  private frame = 0;
  private previousTime = 0;
  private now = 0;
  private destroyed = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private onNear: (near: boolean) => void,
    private onInteract: () => void,
    private onResult: (result: BattleResult) => void,
    private onInspectHint?: (hint: string | null) => void
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建二维画布');
    context.imageSmoothingEnabled = false;
    this.graphics = new CanvasPainter(context);
  }
  setDirection(direction: Direction, held: boolean) {if (held) this.held.add(direction);else this.held.delete(direction);}
  private keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input,select,textarea') || target?.isContentEditable) return;
    if (this.state?.phase !== 'explore' || this.pausedByUser) return;
    const key = event.key.toLowerCase();
    this.keys.add(key);
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e'].includes(key)) event.preventDefault();
    if (key === 'e' && !event.repeat && Math.hypot(this.x - 570, this.y - 290) < 78) this.onInteract();
  };
  private keyup = (event: KeyboardEvent) => {this.keys.delete(event.key.toLowerCase());};
  private clearInput = () => {this.keys.clear();this.held.clear();};
  private pointerdown = (event: PointerEvent) => {
    if (this.state?.phase !== 'battle' || this.pausedByUser || !this.simulation) return;
    const bounds = this.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * this.canvas.width / bounds.width;
    const y = (event.clientY - bounds.top) * this.canvas.height / bounds.height;
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
    const mode = this.state.phase;
    if (mode !== this.lastMode) {this.held.clear();if (mode === 'explore') {this.x = 180;this.y = 290;}this.onNear(false);this.lastMode = mode;}
    if (mode === 'battle' && this.state.activeBattle && this.attemptId !== this.state.activeBattle.id) {
      const modifiers = this.state.activeBattle.modifiers;
      this.attemptId = this.state.activeBattle.id;this.simulation = new DemoBattle(3, 2, !modifiers && this.state.flags.includes('event_success'), modifiers?.shadowPressure ?? 0);this.reported = false;
    }
    const active = !this.pausedByUser && document.visibilityState !== 'hidden';
    if (!active) this.clearInput();
    if (mode === 'explore' && active) {
      let dx = Number(this.keys.has('arrowright') || this.keys.has('d') || this.held.has('right')) - Number(this.keys.has('arrowleft') || this.keys.has('a') || this.held.has('left'));
      let dy = Number(this.keys.has('arrowdown') || this.keys.has('s') || this.held.has('down')) - Number(this.keys.has('arrowup') || this.keys.has('w') || this.held.has('up'));
      const distance = Math.hypot(dx, dy);if (distance) {dx /= distance;dy /= distance;}
      this.x = Math.min(710, Math.max(90, this.x + dx * delta * .18));
      this.y = Math.min(410, Math.max(205, this.y + dy * delta * .18));
      if (this.x > 325 && this.x < 445 && this.y > 320 && this.y < 385) this.y = dy > 0 ? 319 : 386;
      this.onNear(Math.hypot(this.x - 570, this.y - 290) < 78 && !this.state.flags.includes('alley_rescued'));

      let inspect: string | null = null;
      if (Math.hypot(this.x - 225, this.y - 330) < 55) {
        inspect = '【雨水倒影】水里的毛发全都沾了泥点子……两脚兽要是看到，肯定又要心疼地拿热毛巾抱我了。';
      } else if (Math.hypot(this.x - 165, this.y - 200) < 55) {
        inspect = '【墙角抓痕】墙砖上留着好几道焦急的抓痕……似乎曾有猫在这里激烈挣扎逃避什么。';
      } else if (Math.hypot(this.x - 310, this.y - 260) < 55) {
        inspect = '【空鱼罐头】被雨水洗刷干净的破罐头。看来流浪的伙伴们经常要忍饥挨饿。';
      } else if (Math.hypot(this.x - 570, this.y - 290) < 78 && !this.state.flags.includes('alley_rescued')) {
        inspect = '【潮湿纸箱】纸箱深处传出瑟瑟发抖的微弱喵呜声……快靠近查看！';
      }
      this.onInspectHint?.(inspect);
    }
    if (mode === 'battle' && active && this.simulation) {
      this.simulation.update(delta / 1000);
      if (this.simulation.outcome && !this.reported) {this.reported = true;this.onResult({attemptId: this.attemptId, outcome: this.simulation.outcome});}
    }
    this.graphics.clear();
    if (mode === 'battle') this.drawBattle();
    else if (mode === 'home' || this.storyScene === 'home' || this.state.flags.includes('rescue_story_done') && mode !== 'explore') this.drawHome();
    else this.drawAlley();
    if (this.pausedByUser) {this.graphics.fillStyle(0x18282a, .6);this.graphics.fillRect(0, 0, 800, 480);}
  }
  private rect(x:number,y:number,w:number,h:number,color:number,alpha=1){this.graphics.fillStyle(color,alpha);this.graphics.fillRect(Math.round(x),Math.round(y),w,h);}
  private cat(x:number,y:number,breed:CatBreed='miaomiao'){this.graphics.cat(x,y,breed);}
  private lamp(x:number,y:number){this.graphics.fillStyle(0xf9d78a,.12);this.graphics.fillCircle(x,y,45);this.rect(x-8,y-18,16,24,0x60786c);this.rect(x-5,y-15,10,16,0xffe1a0);this.rect(x-11,y+6,22,5,0x496259);}
  private drawAlley(){
    this.rect(0,0,800,480,0x263e46);this.rect(35,80,730,350,0x78928c);this.rect(65,160,670,270,0xa6b7a6);
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
  private drawHome(){
    this.rect(0,0,800,480,0xa6bba0);this.rect(110,65,580,350,0xd2d0ab);this.rect(100,61,600,18,0x688775);
    for(let x=110;x<=690;x+=145)this.rect(x,78,8,230,0x799782);
    this.rect(118,310,563,100,0xbba982);for(let y=320;y<410;y+=22)this.rect(118,y,563,2,0x9f916f,.6);
    this.rect(270,88,260,173,0xb2c8b6);this.rect(395,88,8,173,0x7c9986);this.rect(270,164,260,8,0x7c9986);
    this.rect(135,240,55,75,0x8f9c73);for(let i=0;i<5;i++)this.rect(130+i*13,210-(i%2)*18,14,45,0x6d8d6a);

    // 喵喵
    this.cat(265,350);

    // 序章家里细节
    if(this.state?.chapterId === 'prologue'){
      // 晒着阳光的柔软毛毯
      this.rect(235, 345, 65, 24, 0xc69482);
      this.rect(240, 348, 55, 18, 0xe0c7a0);
      // 标志性天蓝色饭碗
      this.rect(335-27, 350+4, 54, 17, 0x0878c9);
      this.rect(335-31, 350, 62, 8, 0x47b4e6);
      this.rect(335-20, 350-3, 40, 8, 0xefe0b3);
      // 温暖午后阳光光斑
      this.graphics.fillStyle(0xfff0ad, 0.15);
      this.graphics.fillCircle(280, 340, 70);
    } else {
      // 逃出后/花房基地伙伴
      this.cat(390,340,'tuanzi');
      if(this.state?.cats.includes('diandian'))this.cat(515,355,'diandian');
    }

    const positions:Record<string,[number,number]>={corner:[195,365],window:[490,270],courtyard:[625,365]};
    for(const [slot,id]of Object.entries(this.state?.placements??{})){
      const [x,y]=positions[slot]??[200,360];
      if(id==='tin_lamp'||id==='sun_lamp')this.lamp(x,y);
      else if(id==='blue_bowl'){this.rect(x-27,y+4,54,17,0x0878c9);this.rect(x-31,y,62,8,0x47b4e6);this.rect(x-20,y-3,40,8,0xefe0b3);}
      else if(id==='box_castle'){this.rect(x-30,y-18,60,46,0xd5a44b);this.rect(x-34,y-27,15,15,0xeac474);this.rect(x-7,y-27,15,15,0xeac474);this.rect(x+20,y-27,15,15,0xeac474);this.rect(x-9,y+2,18,26,0x835b36);}
      else {this.rect(x-28,y,58,24,id==='red_cushion'?0xe31b23:id==='soft_blanket'?0xc69482:0xa88962);this.rect(x-22,y+4,46,12,id==='red_cushion'?0xff8a80:0xe0c7a0);}
    }
    this.lamp(610,200);for(let i=0;i<8;i++)this.rect(145+i*70,98+(i%2)*6,5,9,0xf4d68e);
  }
}
