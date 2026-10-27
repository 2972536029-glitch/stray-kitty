import type {GameCommand} from '../../contracts';
import './chapter-loadout.css';

/** Shared entry for the first rescue and its unlocked home replay. */
export function ChapterLoadout({disabled, onCommand, stageId = 'alley_boss'}: {
  disabled: boolean; onCommand: (command: GameCommand) => void; stageId?: 'alley_rescue' | 'alley_boss';
}) {
  return <section className="chapter-loadout" aria-label="第一章出战准备">
    <span className="chapter-loadout-kicker">第一章 · 陌生小巷</span>
    <h3>守住深巷</h3>
    <p>绒绒、斑斑、团子与点点守住上方窄巷与右侧双入口，迎战占据四格的驻守首领。小怪最多允许 2 次突破；击败首领并守完八波获胜。</p>
    <p className="chapter-loadout-note">技能能量随战斗时间积蓄。体力耗尽的伙伴本场退场，利用站位、治疗与技能时机守住防线。</p>
    <button type="button" className="chapter-loadout-start" data-testid="chapter-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId})}>进入第一章守护 →</button>
  </section>;
}
