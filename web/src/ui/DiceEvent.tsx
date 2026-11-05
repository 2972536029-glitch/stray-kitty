import {useEffect, useRef, useState} from 'react';
import type {EventDefinition} from '../contracts';
import {eventTiers} from '../modules/events/presentation';
import './encounter.css';
export {default as Dice} from './Dice';

const rewardNames: Record<string,string> = {fish:'鱼干',stamps:'邮票',clue:'线索',material:'材料'};
function fateSummary(reward?: {fish?:number;stamps?:number;clue?:number;material?:number}, pressure = 0): string {
  const parts = Object.entries(reward ?? {}).filter(([,v]) => v > 0).map(([k,v]) => `${rewardNames[k] ?? k}+${v}`);
  if (pressure) parts.push(`黑影压力${pressure > 0 ? '+' : ''}${pressure}`);
  return parts.length ? parts.join(' · ') : '无直接得失';
}

export default function DiceEvent({event, disabled, rolling, random = false, partyCats, pushTokens = 0, onChoose}: {
  event:EventDefinition;disabled:boolean;rolling:boolean;random?:boolean;partyCats?:readonly string[];pushTokens?:number;
  onChoose:(optionId:string,usePush?:boolean) => void;
}) {
  const [selected,setSelected] = useState('');
  const submitted = useRef(false);
  useEffect(() => {if (!disabled && !rolling) submitted.current = false;}, [disabled,rolling]);
  const option = event.options.find(o => o.id === selected);
  const hasCat = (id:string) => partyCats?.includes(id) ?? false;
  const revealFates = hasCat('diandian') && event.tags.includes('trap');
  const forageGuard = hasCat('tuanzi') && event.tags.includes('foraging');
  const visibleOptions = event.options.filter(o => !o.requireCat || hasCat(o.requireCat));
  const choose = (usePush = false) => {
    if (!option || disabled || rolling || submitted.current) return;
    submitted.current = true;onChoose(selected,usePush);
  };
  return <section className="event-card encounter-sheet event-choice" aria-labelledby="encounter-title">
    <header className="encounter-heading"><span>{random ? '路上的偶遇' : '眼前的发现'}</span><h2 id="encounter-title">{event.title}</h2></header>
    <p className="encounter-story">{event.text}</p>
    <div className="choice-list encounter-choices" aria-label="选择行动">{visibleOptions.map((o,i) =>
      <button key={o.id} aria-pressed={o.id === selected} disabled={disabled || rolling} onClick={() => setSelected(o.id)}>
        <span className="choice-index" aria-hidden="true">0{i+1}</span><span className="choice-label">{o.label}</span><span className="choice-check" aria-hidden="true">{o.id === selected ? '✓' : '↗'}</span>
        {revealFates && <span className="option-fates">{eventTiers.map(t => <i key={t.id}><b>{t.label}</b>{fateSummary(o.outcomes[t.id].reward,o.outcomes[t.id].tdMod?.shadowPressure)}</i>)}</span>}
      </button>)}</div>
    <footer className="encounter-actions">
      <details className="encounter-rules"><summary>判定说明</summary><div>{eventTiers.map(t => <span key={t.id}><b>{t.range}</b>{t.label}</span>)}{forageGuard && <p>团子同行：觅食失手仍保留一半收获。</p>}</div></details>
      <div className="encounter-roll-actions">{option && pushTokens > 0 && <button className="push-btn" disabled={disabled || rolling} title="掷两组，取更好的一组" onClick={() => choose(true)}>伙伴鼓励 <small>×{pushTokens}</small></button>}
        <button className="encounter-roll" disabled={disabled || rolling || !option} onClick={() => choose()}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="16" r="1"/></svg>{rolling ? '正在掷骰…' : '掷出骰子'}<span aria-hidden="true">→</span></button>
      </div>
    </footer>
  </section>;
}
