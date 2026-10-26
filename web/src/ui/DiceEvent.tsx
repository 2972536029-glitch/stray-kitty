import {useEffect, useState} from 'react';
import type {EventDefinition} from '../contracts';
import PixelCat from './PixelCat';
import {eventTiers} from '../modules/events/presentation';

const dots: Record<number, number[]> = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
export function Dice({value = 1, rolling = false}: {value?: number; rolling?: boolean}) {
  // 抛掷等待期间点数快速闪换,配合 dice-toss 动画营造翻滚感。
  const [flicker, setFlicker] = useState(1);
  useEffect(() => {
    if (!rolling) return;
    const timer = setInterval(() => setFlicker(v => v % 6 + 1), 130);
    return () => clearInterval(timer);
  }, [rolling]);
  const shown = rolling ? flicker : value;
  return <div className={`dice ${rolling ? 'rolling' : ''}`} role="img" aria-label={rolling ? '骰子滚动中' : `骰子 ${value} 点`}>{Array.from({length: 9}, (_, i) => <i key={i} className={(dots[shown] ?? dots[1]).includes(i) ? 'on' : ''}/>)}</div>;
}
// 只选择选项与展示等待动画；实际骰点仍由 CHOOSE_EVENT 的服务端响应决定。
// random=true 时是"事来找你"的随机相遇:入场带暗色预告拍,眉标显示服务端预告句。
// 伙伴标签技能(v1.1):点点在队+陷阱标签→识破(各选项四档后果可见);团子在队+觅食标签→讨生活(失败保底一半,服务端结算)。
const rewardNames: Record<string, string> = {fish: '鱼干', stamps: '邮票', clue: '线索', material: '材料'};

function fateSummary(reward?: {fish?: number; stamps?: number; clue?: number; material?: number}, pressure = 0): string {
  const parts = Object.entries(reward ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${rewardNames[k] ?? k}+${v}`);
  if (pressure > 0) parts.push('黑影压力+1');
  if (pressure < 0) parts.push('黑影压力-1');
  return parts.length ? parts.join('·') : '无直接得失';
}

export default function DiceEvent({event, disabled, rolling, random = false, teaser, partyCats, pushTokens = 0, onChoose}: {event: EventDefinition; disabled: boolean; rolling: boolean; random?: boolean; teaser?: string; partyCats?: readonly string[]; pushTokens?: number; onChoose: (optionId: string, usePush?: boolean) => void}) {
  const [selected, setSelected] = useState('');
  const option = event.options.find(o => o.id === selected);
  const hasCat = (id: string) => partyCats?.includes(id) ?? false;
  const revealFates = hasCat('diandian') && event.tags.includes('trap');
  const forageGuard = hasCat('tuanzi') && event.tags.includes('foraging');
  // 选项级 requireCat:队伍里没有对应伙伴时整个选项不渲染(如墨墨的暗处小路);服务端同样拒绝。
  const visibleOptions = event.options.filter(o => !o.requireCat || hasCat(o.requireCat));
  return <section className={`event-card event-choice ${random ? 'random-encounter' : ''}`}>{random
    ? <span className="eyebrow encounter-teaser">⚡ {teaser ?? '好像有什么要发生了……'}</span>
    : <span className="eyebrow">一次相遇 · 2D6</span>}{(revealFates || forageGuard) && <div className="party-hint">{revealFates && <span>👁 点点的目光锐利——陷阱的后果清晰可见</span>}{forageGuard && <span>🐾 团子跟在身边——觅食失手也不会空手而归</span>}</div>}<div className="event-cats"><PixelCat size={74}/><span>· · 🐾 · ·</span><PixelCat breed="diandian" size={74} mood="worried"/></div><h2>{event.title}</h2><p>{event.text}</p>
    <div className="choice-list">{visibleOptions.map(o => <button key={o.id} aria-pressed={o.id === selected} disabled={disabled} onClick={() => setSelected(o.id)}>{o.label}<small>{o.requireCat ? '需要伙伴同行' : o.id === selected ? '已选择' : '选择行动'}</small>{revealFates && <span className="option-fates">{eventTiers.map(t => <i key={t.id}><b>{t.label}</b>{t.id === 'crit' ? fateSummary(o.outcomes.crit.reward, o.outcomes.crit.tdMod?.shadowPressure) : t.id === 'success' ? fateSummary(o.outcomes.success.reward) : t.id === 'partial' ? fateSummary(o.outcomes.partial.reward, o.outcomes.partial.tdMod?.shadowPressure) : `${fateSummary(o.outcomes.fail.reward, o.outcomes.fail.tdMod?.shadowPressure)}${forageGuard ? '(保底一半)' : ''}`}</i>)}</span>}</button>)}</div>
    <div className="event-tiers" aria-label="双骰四档规则">{eventTiers.map(t => <span key={t.id} title={`概率 ${t.probability}`}><b>{t.range}</b>{t.label}</span>)}</div>
    <div className="dice-zone"><div className="dice-pair"><Dice rolling={rolling}/><Dice rolling={rolling}/></div><div><small>{option ? '喵喵掷两颗骰子，点数相加' : '先选择一种行动'}</small><button disabled={disabled || !option} onClick={() => onChoose(selected)}>{rolling ? '命运滚动中…' : '掷出骰子'}</button>{option && pushTokens > 0 && <button className="push-btn" disabled={disabled} title="掷两组取更好的一组;每关首次守护成功会攒回一枚" onClick={() => onChoose(selected, true)}>伙伴鼓励 ×{pushTokens}</button>}</div></div><p className="muted">点数相加决定结果。无论结果如何，救援都会继续。</p>
  </section>;
}
