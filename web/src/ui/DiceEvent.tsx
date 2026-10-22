import {useState} from 'react';
import type {EventDefinition} from '../contracts';
import PixelCat from './PixelCat';
import {eventTiers} from '../modules/events/presentation';

const dots: Record<number, number[]> = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
export function Dice({value = 1, rolling = false}: {value?: number; rolling?: boolean}) {
  return <div className={`dice ${rolling ? 'rolling' : ''}`} role="img" aria-label={rolling ? '骰子滚动中' : `骰子 ${value} 点`}>{Array.from({length: 9}, (_, i) => <i key={i} className={(dots[value] ?? dots[1]).includes(i) ? 'on' : ''}/>)}</div>;
}
// 只选择选项与展示等待动画；实际骰点仍由 CHOOSE_EVENT 的服务端响应决定。
export default function DiceEvent({event, disabled, rolling, onChoose}: {event: EventDefinition; disabled: boolean; rolling: boolean; onChoose: (optionId: string) => void}) {
  const [selected, setSelected] = useState('');
  const option = event.options.find(o => o.id === selected);
  return <section className="event-card event-choice"><span className="eyebrow">一次相遇 · 2D6</span><div className="event-cats"><PixelCat size={74}/><span>· · 🐾 · ·</span><PixelCat breed="diandian" size={74} mood="worried"/></div><h2>{event.title}</h2><p>{event.text}</p>
    <div className="choice-list">{event.options.map(o => <button key={o.id} aria-pressed={o.id === selected} disabled={disabled} onClick={() => setSelected(o.id)}>{o.label}<small>{o.id === selected ? '已选择' : '选择行动'}</small></button>)}</div>
    <div className="event-tiers" aria-label="双骰四档规则">{eventTiers.map(t => <span key={t.id} title={`概率 ${t.probability}`}><b>{t.range}</b>{t.label}</span>)}</div>
    <div className="dice-zone"><div className="dice-pair"><Dice rolling={rolling}/><Dice rolling={rolling}/></div><div><small>{option ? '喵喵掷两颗骰子，点数相加' : '先选择一种行动'}</small><button disabled={disabled || !option} onClick={() => onChoose(selected)}>{rolling ? '命运滚动中…' : '掷出骰子'}</button></div></div><p className="muted">点数相加决定结果。无论结果如何，救援都会继续。</p>
  </section>;
}
