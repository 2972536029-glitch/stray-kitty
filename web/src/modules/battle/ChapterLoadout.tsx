import {useState} from 'react';
import type {GameCommand, GameState} from '../../contracts';
import './chapter-loadout.css';

/** A battle preparation control; the full home warehouse remains owned by the home UI. */
export function ChapterLoadout({state, disabled, onCommand}: {
  state: GameState; disabled: boolean; onCommand: (command: GameCommand) => void;
}) {
  const [supplies, setSupplies] = useState({'warm-can': 0, 'bouncy-treat': 0});
  const items = [
    {id: 'warm-can', name: '暖心罐罐', effect: '恢复 60 体力', cap: 4},
    {id: 'bouncy-treat', name: '蹦蹦冻干', effect: '补充 30 能量', cap: 2},
  ] as const;
  const available = (id: keyof typeof supplies) => Math.max(0, state.inventory[id] ?? 0);
  const selected = (id: keyof typeof supplies) => Math.min(supplies[id], available(id));
  const total = selected('warm-can') + selected('bouncy-treat');
  return <section className="chapter-loadout" aria-label="第一章出战准备">
    <span className="chapter-loadout-kicker">第一章 · 陌生小巷</span>
    <h3>守住深巷</h3>
    <p>六位伙伴守住上方窄巷与右侧双入口，迎战占据四格的驻守首领。小怪最多允许 2 次突破；击败首领并守完全部波次获胜。</p>
    <p className="chapter-loadout-note">本关没有免费补给，可空包出战。零漏怪通关额外获得 1 份补给，伙伴受伤不影响加奖。</p>
    <div className="chapter-loadout-items">{items.map(item => <div key={item.id} className="chapter-loadout-item">
      <div><strong>{item.name}</strong><small>{item.effect} · 可用 {available(item.id)} 份 · 最多携带 {item.cap} 份</small></div>
      <div className="chapter-loadout-stepper">
        <button type="button" aria-label={`减少${item.name}`} disabled={disabled || selected(item.id) === 0} onClick={() => setSupplies(previous => ({...previous, [item.id]: selected(item.id) - 1}))}>−</button>
        <output aria-label={`${item.name}携带数量`}>{selected(item.id)}</output>
        <button type="button" aria-label={`增加${item.name}`} disabled={disabled || selected(item.id) >= Math.min(item.cap, available(item.id)) || total >= 6} onClick={() => setSupplies(previous => ({...previous, [item.id]: selected(item.id) + 1}))}>＋</button>
      </div>
    </div>)}</div>
    <p className="chapter-loadout-total">本次携带 {total} / 6 份 · 使用后消耗，结算返还未用的自带物资</p>
    <button type="button" className="chapter-loadout-start" data-testid="chapter-enter" disabled={disabled} onClick={() => onCommand({type: 'START_BATTLE', stageId: 'alley_boss', supplies: {'warm-can': selected('warm-can'), 'bouncy-treat': selected('bouncy-treat')}})}>进入第一章守护 →</button>
  </section>;
}
