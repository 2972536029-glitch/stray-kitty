import type {LifeCat} from './life';
import {chooseLine,PET_LINES,setCatMood,type HomeMood} from './dialogue';

const restingLines={
  happy:['呼噜……醒来第一眼看见你，真好。','梦里也有人轻轻摸头，原来是你呀。'],
  neutral:['我正睡得软软的，先陪我安静一会儿。','先不要把我叫醒哦，梦还没有做完。'],
  irritated:['想再睡一小会儿，摸摸等醒来好吗？','耳朵听见啦，先让我把这一觉睡完。']
} as const;
const eatingLines={
  happy:['等我吃完，就把带着饭香的呼噜分给你。','摸摸收到，下一口也变香了。'],
  neutral:['这一口还没咽下去，等我吃完哦。','先让我认真吃饭，旁边给你留了位置。'],
  irritated:['吃饭时先不要摸啦，我的胡须要忙不过来了。','给饭碗边留点空间，吃完我自己来找你。']
} as const;

/** Petting has a per-cat debounce. Repeated touches build brief irritation,
 * while a pause dissipates it; no save field, reward or permanent penalty. */
export function petCat(cat:LifeCat,now:number):{mood:HomeMood;line:string}|undefined {
  const gap=now-(cat.lastPetAt??-Infinity);if(gap<300)return undefined;
  const pressure=gap>=9000?1:Math.min(6,Math.max(0,(cat.petPressure??0)-Math.floor(gap/3000))+1);
  const sleeping=cat.pose==='hammock_sleep'||cat.social?.kind==='nap',eating=cat.pose==='bowl_eat';
  const interrupted=sleeping||eating;
  const mood:HomeMood=pressure>=4||(interrupted&&pressure>=2)?'irritated':interrupted||pressure===3||pressure===1&&(cat.breed==='miaomiao'||cat.breed==='momo')?'neutral':'happy';
  const bank=sleeping?restingLines:eating?eatingLines:PET_LINES[cat.breed];
  const line=chooseLine(cat,`pet:${sleeping?'sleep':eating?'eat':'awake'}:${mood}`,bank[mood],now);
  cat.lastPetAt=now;cat.petPressure=pressure;cat.petReactionUntil=now+1800;
  setCatMood(cat,mood,now,mood==='irritated'?9000:7000);
  cat.bubble=line;cat.bubbleAt=now;cat.bubbleUntil=now+3800;
  cat.manualUntil=Math.max(cat.manualUntil??0,now+2000);
  if(!cat.pose&&!cat.social&&!cat.furnitureArrival){cat.action='sit';cat.thinkAt=now+2500;}
  return {mood,line};
}

export function canChatter(cats:readonly LifeCat[],now:number):boolean {
  return cats.every(c=>now>=c.bubbleUntil&&now-(c.lastSpokenAt??-Infinity)>=9000);
}

export function nearbyFurnitureCat(cats:readonly LifeCat[],x:number,y:number,preferred:LifeCat['breed'],now:number){
  return cats.filter(c=>!c.pose&&!c.slot&&!c.social&&!c.furnitureArrival&&(c.manualUntil??0)<=now&&Math.hypot(c.x-x,c.y-26-y)<=140)
    .sort((a,b)=>Number(b.breed===preferred)-Number(a.breed===preferred)||Math.hypot(a.x-x,a.y-26-y)-Math.hypot(b.x-x,b.y-26-y))[0];
}
