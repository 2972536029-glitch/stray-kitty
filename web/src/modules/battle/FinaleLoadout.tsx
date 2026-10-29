import type {GameCommand} from '../../contracts';
import './chapter-loadout.css';

export function FinaleLoadout({disabled, onCommand}: {
  disabled: boolean; onCommand: (command: GameCommand) => void;
}) {
  return <section className="chapter-loadout" aria-label="第五章试玩准备">
    <span className="chapter-loadout-kicker">第五章 · 点亮流浪猫王国试玩</span>
    <h3>最后一战，所有的光聚在一起</h3>
    <p>六位先锋进入不规则总仓库，迎战占据九格的永夜之王与两名精英护卫。铃铃、桃桃、音音会陆续赶到固定支援台，聚光小车随着战线推进照亮归途。</p>
    <p className="chapter-loadout-note">家园独立试玩。需要守完十波，并击败巨型首领及两名精英；留意整行横扫与王冠坠击预警，及时换位和释放蓄能技能。援军提供帮助，主力全部退场或累计 3 次突破仍会失败。</p>
    <button type="button" className="chapter-loadout-start" data-testid="finale-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'finale_boss'})}>开始第五章战斗试玩 →</button>
  </section>;
}
