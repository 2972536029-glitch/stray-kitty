import type {GameCommand} from '../../contracts';
import './chapter-loadout.css';

export function MarketLoadout({disabled, onCommand}: {
  disabled: boolean; onCommand: (command: GameCommand) => void;
}) {
  return <section className="chapter-loadout" aria-label="独立集市防线战斗试玩准备">
    <span className="chapter-loadout-kicker">集市防线 · 独立塔防战斗试玩</span>
    <h3>集市防线塔防战斗</h3>
    <p>六位伙伴迎战八波黑影与集市首领。技能随战斗时间蓄能，体力耗尽的伙伴本场退场。</p>
    <p className="chapter-loadout-note">这是独立的塔防战斗试玩，不会进入第二章剧情或午夜集市探索。击败首领并守完八波获胜，最多允许 2 次突破；结束后可以返回家园。</p>
    <button type="button" className="chapter-loadout-start" data-testid="market-battle-trial-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'market_boss'})}>开始集市防线战斗试玩 →</button>
  </section>;
}
