import type {BattleCarryId, EventResolution} from '../contracts';
import {eventTiers} from '../modules/events/presentation';
import {Dice} from './DiceEvent';

export default function EventResult({resolution, compact = false}: {resolution: EventResolution; compact?: boolean}) {
  const {dice, tier, outcome} = resolution;
  const names = {fish: '鱼干', stamps: '邮票', clue: '线索', material: '材料'};
  const carryNames: Record<BattleCarryId, string> = {lantern: '小灯', mirror: '镜片', bell: '铃铛', box: '纸箱', dog: '老黄协助', dove: '咕咕协助'};
  const carryLabel = outcome.carry ? carryNames[outcome.carry] : undefined;
  const reward = Object.entries(outcome.reward ?? {}).filter(([, value]) => value > 0);
  const pressure = outcome.tdMod?.shadowPressure ?? 0;
  return <div className={`event-resolution tier-${tier} ${compact ? 'compact' : ''}`} data-testid="event-resolution">
    <div className="resolution-dice"><div className="dice-pair"><Dice value={dice[0]}/><Dice value={dice[1]}/></div><div><span>{dice[0]} + {dice[1]} = <b>{dice[0] + dice[1]}</b></span><strong>{eventTiers.find(t => t.id === tier)?.label}</strong></div></div>
    {!compact && <><p>{outcome.text}</p><div className="outcome-effects">{reward.map(([id, value]) => <span key={id}>{names[id as keyof typeof names]} +{value}</span>)}<span>黑影压力 {pressure > 0 ? '+1' : pressure < 0 ? '−1' : '不变'}</span>{outcome.situation && <span>{outcome.situation.kind === 'forced_chase' ? '紧急撤离' : '绕路前进'}</span>}{carryLabel && <span className="carry-chip">{carryLabel} · 下一场战斗可用</span>}</div></>}
  </div>;
}
