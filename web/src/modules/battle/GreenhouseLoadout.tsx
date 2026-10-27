import type {GameCommand} from '../../contracts';
import './chapter-loadout.css';

export function GreenhouseLoadout({disabled, onCommand}: {
  disabled: boolean; onCommand: (command: GameCommand) => void;
}) {
  return <section className="chapter-loadout" aria-label="第三章试玩准备">
    <span className="chapter-loadout-kicker">第三章 · 废弃花房试玩</span>
    <h3>守住花房的归路</h3>
    <p>六位伙伴在 34 格不规则花房中迎战八波黑影与四格首领。留意三处入口，保护 B1 的喵喵。</p>
    <p className="chapter-loadout-note">这是家园独立试玩。击败首领并守完八波获胜，最多允许 2 次突破；技能随战斗时间蓄能，体力耗尽的伙伴本场退场。</p>
    <button type="button" className="chapter-loadout-start" data-testid="greenhouse-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'greenhouse_boss'})}>进入第三章试玩 →</button>
  </section>;
}
