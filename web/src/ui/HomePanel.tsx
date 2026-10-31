import type {GameCommand,GameState} from '../contracts';
import {ChapterLoadout} from '../modules/battle/ChapterLoadout';
import {MarketLoadout} from '../modules/battle/MarketLoadout';
import {GreenhouseLoadout} from '../modules/battle/GreenhouseLoadout';
import {TunnelLoadout} from '../modules/battle/TunnelLoadout';
import {FinaleLoadout} from '../modules/battle/FinaleLoadout';
import {chapterExploreCommand,chapterStoryCommand} from '../core/chapter-navigation';

const CHATTER_CALLBACKS: {flag: string; speaker: string; text: string}[] = [
  {flag: 'sack_cat_freed', speaker: '团子', text: '“上回麻袋里那只小的，今天蹲在墙头冲我摆尾巴。这巷子啊，记情。”'},
  {flag: 'shadow_chased', speaker: '点点', text: '“那道影子……我一个人的时候也见过。别怕，在灯下站一会儿就好。”'},
  {flag: 'thin_cat_fed', speaker: '团子', text: '“那小崽子今天又远远跟着呢。喂过一口的，猫记一辈子。”'},
  {flag: 'rats_truce', speaker: '团子', text: '“跟墙洞那家子处得不错。巷子里，多个朋友少堵墙。”'},
  {flag: 'brave_miaomiao', speaker: '点点', text: '“你挡在纸箱前的那下……我记着呢。”'},
  {flag: 'trap_disarmed', speaker: '团子', text: '“那个夹子拆得好。老麻雀要是还在，也会这么说。”'},
  {flag: 'light_found', speaker: '喵喵', text: '“小灯还亮着。有光的地方，就是路。”'},
  {flag: 'shadow_weakness_known', speaker: '喵喵', text: '“黑影怕光——这可是花钱买来的道理，本咪都记着呢。”'},
  {flag: 'wall_kitten_friend', speaker: '旁白', text: '回花房的路上，墙头方向传来一声短促的招呼，像在替你们看着巷口。'},
];

interface Props {state:GameState;disabled:boolean;onCommand:(command:GameCommand)=>void}
export default function HomePanel({state,disabled,onCommand}:Props){
  const has=(flag:string)=>state.flags.includes(flag),tunnelComplete=has('tunnel_explored')&&has('cats_rescued_batch1');
  const clue=state.inventory.clue??0;
  let step;
  if(has('finale_completed'))step=<><h3>流浪猫王国已经落成</h3><p>所有的光终于照亮了归途。可以带着伙伴重走熟悉的小巷，也可以在花房里歇一歇。</p><button disabled={disabled} onClick={()=>onCommand(chapterExploreCommand('alley'))}>再去小巷走走 →</button></>;
  else if(tunnelComplete)step=<><h3>第五章：废弃大仓库</h3><p>暗道救援已经完成。准备好后，前往仓库营救剩下的伙伴。</p>{has('finale_started')?<button disabled={disabled} onClick={()=>onCommand(chapterExploreCommand('warehouse'))}>继续探索仓库 →</button>:clue<3?<><p>还需要线索：{clue} / 3。先去集市打听更多消息。</p><button disabled={disabled} onClick={()=>onCommand({type:'START_STORY',nodeId:'finale_clue_insufficient'})}>听阿策分析线索 →</button><button className="quiet" disabled={disabled} onClick={()=>onCommand(chapterExploreCommand('market'))}>回集市收集线索 →</button></>:<button disabled={disabled} onClick={()=>onCommand(chapterStoryCommand('finale'))}>启程：第五章仓库探索 →</button>}</>;
  else if(has('chapter_3_started')&&has('momo_joined')&&!has('greenhouse_fortified'))step=<><h3>下一步：守住花房防线</h3><p>墨墨已经加入。完成第三章花房保卫战后，就能跟随墨墨进入地下通道。</p><button disabled={disabled} data-testid="chapter3-defense-start" onClick={()=>onCommand({type:'START_BATTLE',stageId:'greenhouse_boss'})}>继续第三章：守住花房防线 →</button></>;
  else if(has('greenhouse_fortified'))step=<><h3>第四章：消失的猫咪们</h3><p>花房防线已经守住。跟随墨墨，寻找失踪的伙伴。</p><button disabled={disabled} data-testid={has('chapter_4_started')?'chapter4-explore':'chapter4-start'} onClick={()=>onCommand(has('chapter_4_started')?chapterExploreCommand('tunnel'):chapterStoryCommand('rescue'))}>{has('chapter_4_started')?'前往地下暗道 →':'启程：第四章《消失的猫咪们》 →'}</button></>;
  else if(has('market_cleared')&&has('market_exit_crossed'))step=<><h3>第三章：废弃花房</h3><p>{has('chapter_3_started')?'和墨墨再聊聊，准备一起守护我们的花房。':'穿过集市，和伙伴们一起修缮花房，结识新的朋友。'}</p><button disabled={disabled} onClick={()=>onCommand(chapterStoryCommand('greenhouse'))}>{has('chapter_3_started')?'重温第三章剧情 →':'启程：第三章剧情 →'}</button></>;
  else step=<><h3>第二章：午夜集市</h3><p>循着热闹的灯火，去集市寻找更多伙伴与线索。</p><button disabled={disabled} data-testid={has('chapter_2_started')?'chapter2-explore':'chapter2-start'} onClick={()=>onCommand(has('chapter_2_started')?chapterExploreCommand('market'):chapterStoryCommand('market'))}>{has('chapter_2_started')?'前往午夜集市 →':'启程：第二章《午夜集市》 →'}</button></>;
  return <section className="home-journey-panel" aria-label="接下来要做的事">{step}</section>;
}
export function HomeBattleTrials({state,disabled,onCommand}:Props){
  const alley=state.flags.includes('alley_rescued');
  return <details className="qa-home-trials"><summary>已解锁关卡试玩</summary><div>{alley&&<ChapterLoadout disabled={disabled} onCommand={onCommand}/>}{alley&&<MarketLoadout disabled={disabled} onCommand={onCommand}/>}{state.flags.includes('momo_joined')&&<GreenhouseLoadout disabled={disabled} onCommand={onCommand}/>}{alley&&<TunnelLoadout disabled={disabled} onCommand={onCommand}/>}{alley&&<FinaleLoadout disabled={disabled} onCommand={onCommand}/>}</div></details>;
}
export function HomeMemories({state}:{state:GameState}){
  const memories=CHATTER_CALLBACKS.filter(c=>state.flags.includes(c.flag));
  return memories.length?<section className="home-memories"><h4>伙伴记得的小事</h4>{memories.map(c=><p key={c.flag}><b>{c.speaker}</b>：{c.text}</p>)}</section>:null;
}

export function HomeStoryReplays({state,disabled,onCommand}:Props){const has=(flag:string)=>state.flags.includes(flag);
  const replays=[['alley','第一章 · 雨后小巷',true],['market','第二章 · 午夜集市',has('chapter_2_started')],['greenhouse','第三章 · 废弃花房',has('chapter_3_started')],['rescue','第四章 · 消失的猫咪们',has('chapter_4_started')],['finale','第五章 · 废弃大仓库',has('finale_started')]] as const;
  return <><details className="home-replay"><summary>重温已经到达的故事</summary><div>{replays.filter(r=>r[2]).map(([id,title])=><button key={id} disabled={disabled} onClick={()=>onCommand(chapterStoryCommand(id))}>{title}</button>)}</div></details></>;
}
