import type {CatBreed} from '../../adapters/canvas/pixelCat';

export type HomeMood='happy'|'neutral'|'irritated';
type MoodLines=Record<HomeMood,readonly string[]>;
interface Speaker {breed:CatBreed;seed:number;dialogueTurns?:Record<string,number>;lastDialogue?:string;lastSpokenAt?:number;mood?:HomeMood;moodUntil?:number}

// Small context banks keep an action's words relevant; each cat remembers its
// own place in a bank, so the same action cannot immediately repeat a line.
export function chooseLine(cat:Speaker,key:string,lines:readonly string[],now:number){
  const turns=cat.dialogueTurns??={};let index=((turns[key]??0)+cat.seed)%lines.length;
  if(lines[index]===cat.lastDialogue&&lines.length>1)index=(index+1)%lines.length;
  turns[key]=(turns[key]??0)+1;cat.lastDialogue=lines[index];cat.lastSpokenAt=now;return lines[index];
}
export function currentCatMood(cat:Speaker,now:number):HomeMood{return (cat.moodUntil??0)>now?cat.mood??'neutral':'neutral';}
export function activityMood(cat:Speaker,now:number):HomeMood {
  if((cat.moodUntil??0)>now)return cat.mood??'neutral';
  return ((cat.dialogueTurns?.activity??0)+cat.seed)%3===0?'neutral':'happy';
}
export function setCatMood(cat:Speaker,mood:HomeMood,now:number,duration=8500){cat.mood=mood;cat.moodUntil=now+duration;}

export const PET_LINES:Record<CatBreed,MoodLines>={
  miaomiao:{
    happy:['就、就再摸一下耳朵后面好了。','呼噜……这是本咪特许的，不许告诉别人。','你今天的手法，勉强能得一条小鱼干。','哼，手怎么停了？本咪还没说结束呢。'],
    neutral:['嗯？本咪正在想事情呢。','可以摸头，蝴蝶结要留在原来的地方。','我看见你啦，坐在旁边就好。','先让本咪把这条尾巴理顺。'],
    irritated:['够、够啦！本咪的毛都要被摸乱了。','尾巴在说：现在要给本咪一点空间。','暂停摸摸，本咪要独自端庄一会儿。','耳朵往后了哦，先收一下手嘛。']
  },
  tuanzi:{
    happy:['呼噜噜……再往下挠一点点。','你的手比刚晒过的毛毯还暖和。','摸摸可以续杯吗？我还没呼噜完。','肚子圆圆，开心也圆圆！'],
    neutral:['唔？你手上是不是有小鱼干的味道？','让我发会儿呆，待会儿再贴贴。','摸一下收到，正在慢慢反应中。','我在数饭碗里的小饼干呢。'],
    irritated:['等一等，我的毛要起静电啦。','摸摸先歇业，团子现在要摊一会儿。','尾巴拍地板了，先让我安静一下嘛。','呜，手停一下，等我来蹭你。']
  },
  diandian:{
    happy:['是你的手呀……那我可以放心闭眼睛了。','轻轻的，很舒服。我也蹭蹭你。','原来被喜欢，是这样暖暖的感觉。','再陪我待一小会儿，好不好？'],
    neutral:['我、我看见你啦，慢一点靠近哦。','先让我闻闻你的手，可以吗？','今天想坐在你旁边，暂时不想被抱。','嗯……摸摸头就好，我还在适应。'],
    irritated:['有一点太多了……让我缓一下好吗？','耳朵想休息啦，先不要碰那里。','我不是不喜欢你，只是想安静一会儿。','我往旁边挪一点，待会儿再来找你。']
  },
  momo:{
    happy:['警戒可以暂停一会儿。你继续。','……耳后那里，可以再挠两下。','呼噜声？你听错了。只是风。','有你在，我也能放心松一下肩膀。'],
    neutral:['收到。正在观察窗外。','摸头可以，别挡住我的视线。','嗯。坐近一点吧。','现在适合安静地待在一起。'],
    irritated:['停一下。我需要一点距离。','耳朵已经提醒过了，先到这里。','现在不想被摸，稍后我会过来。','尾巴在动。让我独自安静片刻。']
  }
};

export const FURNITURE_LINES:Record<string,MoodLines>={
  castle_peek:{happy:['从小门探个头——找到我了吗？','这里是秘密基地，只给好朋友留门。','外面好热闹，我的小屋也好暖。'],neutral:['先在里面观察一下。','窝的边边刚好能托住下巴。','门口留一点缝，就看得见大家。'],irritated:['我先躲一小会儿，等想出来再出来。','秘密基地现在需要一点安静。','小门先关半扇，别急着叫我哦。']},
  hammock_sleep:{happy:['摇呀摇，连梦都变得软乎乎。','这一下晃得刚刚好，呼噜……','把烦恼挂在床边，只带小鱼干进梦里。'],neutral:['我先眯一会儿，有事轻轻叫我。','换个方向，再把尾巴收好。','吊床慢慢晃，眼皮也慢慢沉。'],irritated:['让我先补一觉，醒来再一起玩。','今天想安静睡，不要晃太快哦。','尾巴都收好了，摸摸晚一点再来。']},
  knead:{happy:['左一下，右一下，踩出一个小云朵。','这团软乎乎，是刚刚好的幸福。','揉揉，踩踩，窝里还差一个好梦。'],neutral:['把这个角落踩平，就能躺下了。','这里再按一下，嗯，差不多。','先认真检查一下软不软。'],irritated:['我在踩自己的小情绪，等一下就好。','让我把这块毯子理好，暂时别碰爪爪。','先踩一会儿，再决定要不要贴贴。']},
  belly:{happy:['肚皮晒暖了，连胡须都松下来啦。','这一小片暖和，我想分给你。','躺平，伸爪，把今天晒得香香的。'],neutral:['这个姿势刚好能看见窗外。','不做什么，也可以待得很舒服。','暖一点，再换个方向。'],irritated:['现在只想自己躺躺，肚皮先不开放。','让我在这里降降小脾气。','给尾巴留点地方，我歇会儿就好。']},
  bowl_eat:{happy:['咔嚓咔嚓，这一口也太香啦！','吃完还要认真舔一圈嘴巴。','饭碗响一下，快乐就多一下。'],neutral:['先吃这边，再喝一小口水。','我在认真吃饭，等吃完再说。','慢慢嚼，这样能香得久一点。'],irritated:['吃饭的时候先不要摸我哦。','碗边给我留一点空，我吃完就好。','这一口还没咽下去，等一下嘛。']},
  sniff:{happy:['新叶子的味道！轻轻碰一下就好。','这里闻起来像雨停后的早晨。','花草也在长大，我们的家真好。'],neutral:['先闻闻，再慢慢绕过去。','这片叶子和昨天的味道有点不一样。','我只看看，不把花盆推倒。'],irritated:['闻闻叶子的味道，先让自己静下来。','花草角落今天借我独处一下。','暂时不聊天，我和这片叶子待会儿。']},
  watch:{happy:['咦，那个小影子又动了一下！','我能在这里盯上好久好久。','亮亮的、晃晃的，真想再看一会儿。'],neutral:['别急，我在认真观察。','刚刚是不是有什么动了？','等一等，也许还会有新发现。'],irritated:['我想专心看一会儿，先别打岔。','给我留一点安静，盯一会儿就好了。','现在只想看看，不想被抱起来哦。']},
  bat_ball:{happy:['小球别跑，猫猫队长来啦！','左边截住，右边再拨一下！','这一爪刚刚好，滚回来陪我玩。'],neutral:['轻轻拨一下，看看往哪边滚。','我还在研究它为什么会跑。','等小球停下来，再伸爪。'],irritated:['把小脾气轻轻拨走，咕噜噜。','我先自己玩两下，等会儿叫你。','小球可以追，尾巴先别碰哦。']},
  bat_chime:{happy:['叮铃——这声好听，再来一下！','我给花房弹了一首爪爪小曲。','听见了吗？这是给你的那一下。'],neutral:['轻轻碰一碰，就会响。','等这一声消失，再拨下一次。','原来小爪子也能做出这样的声音。'],irritated:['轻一点，只想听小小的一声。','叮……先让脑袋安静一会儿。','今天只弹一小段，剩下的明天再听。']},
  perch:{happy:['上来啦！大家都在我的视线里。','这个位置，正好看见整个家。','高一点的风，也像小鱼干一样香。'],neutral:['这里的视野很清楚。','先把四只爪子都放稳。','我在高处待会儿，你们慢慢玩。'],irritated:['高一点，刚好给自己留些空间。','我在这里缓一缓，不用急着叫我。','今天想做一只安静的高处小猫。']},
  scratch:{happy:['磨磨爪子，再伸一个长长的懒腰！','刷刷两下，整只猫都轻快了。','这里手感真好，爪爪都满意。'],neutral:['先把小爪子整理一下。','这边挠两下，换另一只爪。','伸直背，再慢慢放松。'],irritated:['刷刷，把一点小烦躁挠出去。','我在整理心情，先别碰爪子哦。','等我伸完这个懒腰，再来找你。']},
  investigate:{happy:['箱子里有新气味，是给我们的惊喜吗？','让我把鼻尖探进去一点点！','发现一个角落！可以藏半截尾巴。'],neutral:['闻闻边角，再看看里面。','这条缝里面，好像有点意思。','只是检查一下，不把东西弄乱。'],irritated:['我想自己检查一会儿。','先把注意力放在箱子上，心情也慢慢顺了。','等我从这个小角落出来，再贴贴吧。']},
  paw_table:{happy:['小爪子也来帮忙，轻轻扒拉一下！','这里有好多小东西，像藏着一整个春天。','工作台巡视完毕，奖励自己伸个懒腰。'],neutral:['我看看桌边，保证轻轻的。','这个边角摸起来有一点粗粗的。','工具放回原位，我只用鼻尖检查。'],irritated:['我先在桌边发会儿呆，不用招呼我。','今天只想静静检查，不想被抱走。','小爪子忙着呢，等一下再摸。']}
};

type SocialKind='nose'|'rub'|'groom'|'play'|'nap';
type Pair=readonly [string,string];
export const SOCIAL_LINES:Record<SocialKind,Record<HomeMood,readonly Pair[]>>={
  nose:{happy:[['碰碰鼻子，今天也一起玩！','嗯，闻到好朋友的味道啦。'],['鼻尖碰一下，算我们的小约定。','约好了，晒太阳的时候给你留位置。'],['你闻起来像刚晒过的毛毯。','那就再靠近一点点。']],neutral:[['是你呀，今天去哪里转了？','就在花房里，闻闻就知道啦。'],['先闻一下，可以坐在这里吗？','可以，给你留着这半边。']],irritated:[['我今天有点想静静，碰一下就好。','好，我就在旁边，不挤你。'],['鼻尖打个招呼，先别扑过来哦。','收到，等你想玩了再叫我。']]},
  rub:{happy:[['贴一下，把我的暖和分给你。','呼噜噜，我也给你一点。'],['今天的好心情，蹭蹭就传给你！','收到啦，再还你一个蹭蹭。'],['你身上好暖，借我靠一下。','靠吧，尾巴也给你留位置。']],neutral:[['我从这边轻轻过一下。','嗯，慢慢来，不着急。'],['想在你旁边坐一会儿。','好呀，一起看窗外。']],irritated:[['先不要靠得太紧，好吗？','好，我退一点，陪着你就好。'],['今天只蹭一下，尾巴想歇歇。','一下也很好，明天再贴贴。']]},
  groom:{happy:[['耳朵后面，帮你舔顺啦。','舒服得眼睛都要闭起来了。'],['有一撮毛翘起来，我来整理！','那一会儿换我帮你。'],['慢一点，给好朋友理毛要认真。','呼噜……你也太会照顾猫了。']],neutral:[['这里沾了一点点，我帮你弄掉。','嗯，弄好我就转个身。'],['只整理耳边这一小块。','好，我尽量不动。']],irritated:[['今天耳朵有点痒，轻一点哦。','知道啦，我们慢慢来。'],['这一撮顺了就先休息，好吗？','好，剩下的等你想理的时候再说。']]},
  play:{happy:[['看我的猫猫拳，轻轻的那种！','接住啦，轮到我追你！'],['一、二、三，谁先碰到小球？','我已经准备好小爪子啦！'],['假装没看见，突然扑一下！','嘿嘿，你的尾巴早就露馅啦。']],neutral:[['要不要慢慢拨两下小球？','好呀，我今天不跑太快。'],['这一回合，我们轻轻来。','收到，先伸一只爪试试。']],irritated:[['今天不想追太久，只玩一小会儿。','好，我把小球拨慢一点。'],['别扑得太近哦，我想留点空。','知道啦，碰到小球就算赢。']]},
  nap:{happy:[['玩累了，陪我眯一会儿？','好呀，醒来再一起晒太阳。'],['这边暖暖的，分你一半。','那我把呼噜声也分你一半。'],['靠着好朋友，梦会不会更甜？','梦里也给你留一条小鱼干。']],neutral:[['安静坐一会儿，也挺好的。','嗯，窗外的风慢慢吹。'],['我先闭眼睛，你不用陪着睡。','没关系，我也刚好困啦。']],irritated:[['脑袋有一点吵，想安静歇歇。','我不说话，就在旁边。'],['先不要碰尾巴，让我缓一缓。','好，给你留一个舒服的位置。']]}
};

export function furnitureLine(cat:Speaker,pose:string,mood:HomeMood,now:number){
  const lines=FURNITURE_LINES[pose]?.[mood]??FURNITURE_LINES.watch[mood];
  cat.dialogueTurns??={};cat.dialogueTurns.activity=(cat.dialogueTurns.activity??0)+1;
  return chooseLine(cat,`furniture:${pose}:${mood}`,lines,now);
}
export function socialLines(a:Speaker,b:Speaker,kind:SocialKind,mood:HomeMood,now:number):Pair {
  const pairs=SOCIAL_LINES[kind][mood],key=`social:${kind}:${mood}:${b.breed}`,turn=a.dialogueTurns?.[key]??0;
  a.dialogueTurns??={};a.dialogueTurns[key]=turn+1;
  const pair=pairs[(turn+a.seed+b.seed)%pairs.length];a.lastSpokenAt=now;b.lastSpokenAt=now;
  return [pair[0].replace('好朋友',CAT_VOCATIVES[b.breed]),pair[1].replace('好朋友',CAT_VOCATIVES[a.breed])];
}
const CAT_VOCATIVES:Record<CatBreed,string>={miaomiao:'喵喵',tuanzi:'团子',diandian:'点点',momo:'墨墨'};
