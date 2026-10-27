import type {BattleCarryId} from '../../contracts';
import type {BattleCarryState} from './carry';

interface Position {x: number; y: number}
export interface CarryWaveEntry {kind: string; route?: string; lane?: number}
interface WaveGroup {entrance: string; enemy: string; count: number}
export interface CarryWavePreview {wave: number; label: string; total: number; groups: WaveGroup[]}
interface CarryPanelProps {
  carry: BattleCarryState;
  phase: 'ready' | 'battle' | 'won' | 'lost';
  wave: number;
  waves: readonly (readonly CarryWaveEntry[])[];
  entrances: Readonly<Record<string, Position>>;
  enemies: Readonly<Record<string, {name: string}>>;
  disabled: boolean;
  onUse: () => void;
}
const NAMES: Record<BattleCarryId, string> = {
  lantern: '小灯', mirror: '镜片', bell: '铃铛', box: '纸箱', dog: '老黄大狗', dove: '咕咕鸽子', rats: '鼠群小队', kitten: '获救小猫',
};
const ICONS: Record<BattleCarryId, string> = {lantern: '◉', mirror: '◇', bell: '♧', box: '▣', dog: '♟', dove: '↗', rats: '≈', kitten: '✿'};
const cellName = ({x, y}: Position) => `${String.fromCharCode(65 + y)}${x + 1}`;

/** Read the real wave table; scouting never changes the spawn clock or invents enemies. */
export function getCarryWavePreview(waves: CarryPanelProps['waves'], wave: number, phase: CarryPanelProps['phase'], entrances: CarryPanelProps['entrances'], enemies: CarryPanelProps['enemies']): CarryWavePreview[] {
  if (!waves.length) return [];
  const current = Math.min(waves.length, Math.max(1, wave));
  const numbers = phase === 'ready' || wave < 1 ? [1] : current < waves.length ? [current, current + 1] : [current];
  return numbers.map((number, index) => {
    const groups: WaveGroup[] = [];
    for (const entry of waves[number - 1]) {
      const position = entrances[entry.route ?? String(entry.lane)];
      const entrance = position ? cellName(position) : '入口待确认';
      const enemy = enemies[entry.kind]?.name ?? entry.kind;
      const existing = groups.find(group => group.entrance === entrance && group.enemy === enemy);
      if (existing) existing.count++;
      else groups.push({entrance, enemy, count: 1});
    }
    return {wave: number, label: phase === 'ready' || wave < 1 ? '首波预告' : index > 0 ? '下一波' : number === waves.length ? '最后一波' : '当前波', total: waves[number - 1].length, groups};
  });
}

export function canUseCarry(carry: BattleCarryState, phase: CarryPanelProps['phase'], disabled: boolean): boolean {
  return carry.id === 'mirror' && !carry.used && phase === 'battle' && !disabled;
}

export function carryDescription(carry: BattleCarryState): string {
  const entrance = cellName(carry.anchor);
  switch (carry.id) {
    case 'lantern': return `${entrance} 周围 2 格（曼哈顿距离）每 4 秒对范围内每只小怪造成 20 伤害，不影响首领。`;
    case 'mirror': return '手动使用一次，让全部小怪停止移动与攻击 3 秒；不影响首领。';
    case 'bell': return '开始守护时，在场猫各获得 20 能量，上限 100；本场只触发一次。';
    case 'box': return `首波从 ${entrance} 进入的本路小怪各在入口等待 2 秒后放行；不占部署格。`;
    case 'dog': return `${entrance} 这一路的小怪移速降低 25%；与技能减速取较慢效果，不相乘。`;
    case 'dove': return '报出真实波表的入口、怪种与数量，不改变出怪时间。';
    default: return carry.warning ?? '未识别的事件带入已忽略，本场可正常继续。';
  }
}

export function CarryPanel({carry, phase, wave, waves, entrances, enemies, disabled, onUse}: CarryPanelProps) {
  if (!carry.id && !carry.warning) return null;
  const animal = carry.id === 'dog' || carry.id === 'dove';
  const usable = canUseCarry(carry, phase, disabled);
  const preview = carry.id === 'dove' ? getCarryWavePreview(waves, wave, phase, entrances, enemies) : [];
  const status = carry.id === 'mirror' ? carry.freezeRemaining > 0 ? `小怪暂停剩余 ${carry.freezeRemaining.toFixed(1)} 秒` : carry.used ? '本场已使用' : phase === 'ready' ? '开始守护后可用' : disabled ? '暂停期间不可使用' : '本场可用一次'
    : carry.id === 'bell' ? carry.used ? '开场能量已带入' : '开始守护时生效'
    : carry.id === 'box' ? phase === 'ready' ? '仅首波生效' : carry.boxActive ? '首波入口延迟中' : '首波效果已结束'
    : carry.id === 'lantern' ? `已触发 ${carry.pulses} 次` : null;
  return <section className={`battle-carry-panel${carry.warning ? ' is-unrecognized' : ''}`} aria-label={animal ? '动物来报恩' : '从事件带来'} data-testid="battle-carry-panel" data-carry={carry.id ?? 'unknown'} data-used={carry.used} data-freeze={carry.freezeRemaining.toFixed(2)} data-pulses={carry.pulses} data-box-active={carry.boxActive}>
    <div className="battle-carry-heading"><span className="battle-carry-icon" aria-hidden="true">{carry.id ? ICONS[carry.id] : '?'}</span><div><small>{animal ? '动物来报恩' : '从事件带来'}</small><strong>{carry.id ? NAMES[carry.id] : '未识别的事件带入'}</strong></div></div>
    <div className="battle-carry-copy"><p>{carryDescription(carry)}</p>{status && <small data-testid="battle-carry-status">{status}</small>}
      {preview.length > 0 && <div className="battle-carry-scout" data-testid="battle-carry-preview">{preview.map(item => <p key={item.wave} data-wave={item.wave}><b>{item.label} · 第 {item.wave} 波 · 共 {item.total} 只</b><span>{item.groups.map(group => `${group.entrance} ${group.enemy} ×${group.count}`).join('；')}</span></p>)}</div>}
    </div>
    {carry.id === 'mirror' && <button type="button" data-testid="battle-carry-use" disabled={!usable} onClick={onUse}>使用镜片</button>}
  </section>;
}
