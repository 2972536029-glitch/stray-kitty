import {useEffect, useRef, useState} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import {ChapterLoadout} from '../modules/battle/ChapterLoadout';
import {MarketLoadout} from '../modules/battle/MarketLoadout';
import {GreenhouseLoadout} from '../modules/battle/GreenhouseLoadout';
import {TunnelLoadout} from '../modules/battle/TunnelLoadout';
import {FinaleLoadout} from '../modules/battle/FinaleLoadout';
import {playSound} from './soundEffects';
import {chapterExploreCommand, chapterStoryCommand} from '../core/chapter-navigation';

const PANEL_OPEN_KEY = 'stray-kitty.make-it-ours.open';
// 记忆玩家上次的折叠/展开状态；第一次进花房（还没有记忆）默认展开。
function rememberedOpen(): boolean {
  try {
    const saved = localStorage.getItem(PANEL_OPEN_KEY);
    return saved === null || saved === 'open';
  } catch {
    return true;
  }
}

const CHATTER_CALLBACKS: {flag: string; speaker: string; text: string}[] = [
  {flag: 'sack_cat_freed', speaker: '团子', text: '“上回麻袋里那只小的，今天蹲在墙头冲我摆尾巴。这巷子啊，记情。”'},
  {flag: 'shadow_chased', speaker: '点点', text: '“那道影子……我一个人的时候也见过。别怕，在灯下站一会儿就好。”'},
  {flag: 'thin_cat_fed', speaker: '团子', text: '“那小崽子今天又远远跟着呢。喂过一口的，猫记一辈子。”'},
  {flag: 'rats_truce', speaker: '团子', text: '“跟墙洞那家子处得不错。巷子里，多个朋友少堵墙。”'},
  {flag: 'brave_miaomiao', speaker: '点点', text: '“你挡在纸箱前的那下……我记着呢。”'},
  {flag: 'trap_disarmed', speaker: '团子', text: '“那个夹子拆得好。老麻雀要是还在，也会这么说。”'},
  {flag: 'light_found', speaker: '喵喵', text: '“小灯还亮着。有光的地方，就是路。”'},
  {flag: 'shadow_weakness_known', speaker: '喵喵', text: '“黑影怕光——这可是花钱买来的道理，本咪都记着呢。”'},
  {flag: 'wall_kitten_friend', speaker: '旁白', text: '回花房的路上，墙头方向传来一声短促的招呼，像在替你们看着巷口。'},
];

// 家具选择器：原位展开的暖色像素木牌列表（替代系统原生下拉），保留 listbox/option 语义与键盘可用性。
function FurniturePicker({value, options, disabled, onChange}: {value: string; options: {id: string; label: string}[]; disabled: boolean; onChange: (id: string) => void}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {if (!rootRef.current?.contains(event.target as Node)) {setOpen(false);playSound('close');}};
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const current = options.find(option => option.id === value)?.label ?? '还没有家具';
  return <div className={`furniture-picker${open ? ' open' : ''}`} ref={rootRef}>
    <button type="button" className="furniture-picker-button" disabled={disabled} aria-label="选择家具" aria-haspopup="listbox" aria-expanded={open} onClick={() => {setOpen(!open);playSound(open ? 'close' : 'open');}}>
      <span className="furniture-picker-caption" aria-hidden="true">选择家具</span>
      <b>{current}</b>
      <span className="furniture-picker-chev" aria-hidden="true">▾</span>
    </button>
    {open && <ul className="furniture-picker-list" role="listbox" aria-label="家具列表">
      {options.map((option, index) => <li key={option.id}>
        <button type="button" role="option" aria-selected={option.id === value} className={option.id === value ? 'selected' : ''} style={{animationDelay: `${Math.min(index * 26, 208)}ms`}} disabled={disabled} onClick={() => {onChange(option.id);setOpen(false);playSound('pickup');}}>{option.label}</button>
      </li>)}
    </ul>}
  </div>;
}

export default function HomePanel({state, catalog, disabled, onCommand, onShop, onRecharge, onWarehouse}: {state: GameState; catalog: Catalog; disabled: boolean; onCommand: (command: GameCommand) => void; onShop: () => void; onRecharge: () => void; onWarehouse: () => void}) {
  const [selected, setSelected] = useState('cardboard_nest');
  // 伸缩抽屉：先按收缩态挂载，延迟一拍再展开，让玩家看清“这里有一个可以伸缩的面板”。
  const [open, setOpen] = useState(rememberedOpen);
  const [revealed, setRevealed] = useState(false);
  // 首次展开走 1s 的慢速滑入，之后恢复常规速度。
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 180);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!revealed || !open || settled) return;
    const timer = setTimeout(() => setSettled(true), 1100);
    return () => clearTimeout(timer);
  }, [revealed, open, settled]);
  const expanded = revealed && open;
  const toggle = (next: boolean) => {
    setOpen(next);
    playSound(next ? 'open' : 'close');
    try {localStorage.setItem(PANEL_OPEN_KEY, next ? 'open' : 'closed');} catch {/* 隐私模式下记忆失败，不影响本次游玩 */}
  };
  const furniture = state.furniture.includes(selected) ? selected : state.furniture[0] ?? '';
  const name = (id: string) => catalog.furniture.find(f => f.id === id)?.name ?? id;
  // 双货币包裹:免费邮票包裹与付费金枪鱼豪华包裹在家园并列,一键抽取并播开箱反馈。
  const drawPools = catalog.pools.filter(p => ['rainy_box', 'starlight_greenhouse'].includes(p.id));
  // 花房四阶修缮:阶段 1 是初始漏雨状态,阶段 2/3 由 REPAIR_HOME 逐段推进,阶段 4 随终章 flag 自动点亮。
  const renovations = catalog.renovations ?? [];
  const kingdomFounded = state.flags.includes('finale_completed') || state.flags.includes('kingdom_founded');
  const nextRenovation = renovations.find(r => !state.flags.includes(r.grantsFlag));
  const stage = kingdomFounded ? 4 : renovations.filter(r => state.flags.includes(r.grantsFlag)).length + 1;
  const stageTitles = ['漏雨避雨处', '封窗止水', '原木温室与猫爬架', '流浪猫王国庆典'];
  const stageHints = ['屋顶还漏着雨，大家先挤在纸箱边避雨。', '破窗钉上木板、堵住漏缝，花房干燥又温暖。', '原木横梁架起天窗，阳光洒下条条光斑。', '暖黄串灯亮起，街坊们送来了水碗与毛毯。'];
  const material = state.inventory.material ?? 0;
  const stamp = state.currencies.stamp ?? 0;
  const nextMaterial = nextRenovation?.cost?.material ?? 0;
  const nextStamp = nextRenovation?.cost?.stamp ?? 0;
  const affordable = material >= nextMaterial && stamp >= nextStamp;
  // 尚未完成修缮工程解锁的槽位保持锁定(如高空横梁需先完成阶段 3)。
  const lockedSlots = new Set<string>();
  for (const r of renovations) if (!state.flags.includes(r.grantsFlag)) for (const slotId of r.unlockSlots ?? []) lockedSlots.add(slotId);
  const hasBattleTrials = state.flags.includes('alley_rescued') || state.flags.includes('momo_joined');
  const needsGreenhouseDefense = state.flags.includes('chapter_3_started') && state.flags.includes('momo_joined') && !state.flags.includes('greenhouse_fortified');
  return <section className={`journal-card home-panel ${expanded ? 'home-panel-open' : 'home-panel-closed'}${settled ? '' : ' home-panel-entering'}`}>
    {!expanded && <button className="home-drawer-tab" aria-expanded={false} aria-controls="make-it-ours-panel" onClick={() => toggle(true)}><span aria-hidden="true">◀</span><small>整理家园</small></button>}
    <div className="home-panel-content" id="make-it-ours-panel">
      <div className="home-panel-head"><div className="home-panel-title"><span className="eyebrow">MAKE IT OURS</span><h2>整理我们的家</h2></div><button className="home-panel-close" aria-expanded onClick={() => toggle(false)} aria-controls="make-it-ours-panel"><span aria-hidden="true">✕</span><small>收起</small></button></div>
      <button className="home-warehouse-entry" data-sound="open" onClick={() => {playSound('open');onWarehouse();}}>▧ 家园仓库<small>查看库存 · 选择出战补给</small></button>
    {(needsGreenhouseDefense || state.flags.includes('greenhouse_fortified')) && <section className="home-mainline-step" aria-label="主线进度">
      {needsGreenhouseDefense ? <>
        <h3>下一步：守住花房防线</h3>
        <p>墨墨已经加入。完成第三章花房保卫战后，就能跟随墨墨进入第四章地下通道。</p>
        <button className="primary-action-btn" data-testid="chapter3-defense-start" disabled={disabled} onClick={() => onCommand({type:'START_BATTLE',stageId:'greenhouse_boss'})}>继续第三章：守住花房防线 →</button>
      </> : <>
        <h3>第四章：消失的猫咪们</h3>
        <p>花房防线已经守住，地下通道已开放。跟随墨墨寻找失踪的伙伴。</p>
        {!state.flags.includes('chapter_4_started') ? <button className="primary-action-btn" data-testid="chapter4-start" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('rescue'))}>🐾 启程：第四章《消失的猫咪们》 →</button> : <>
          <button className="primary-action-btn" data-testid="chapter4-explore" disabled={disabled} onClick={() => onCommand(chapterExploreCommand('tunnel'))}>🐾 前往地下暗道 →</button>
          <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('rescue'))}>📖 重温第四章剧情</button>
        </>}
      </>}
    </section>}
    <div className="chapter-exploration-trials" aria-label="章节试玩">
      <button disabled={disabled} onClick={() => onCommand(chapterExploreCommand('alley'))}>进入第一章试玩 · 雨后小巷探索</button>
      {state.flags.includes('chapter_2_started') && <button disabled={disabled} onClick={() => onCommand(chapterExploreCommand('market'))}>进入第二章试玩 · 午夜集市探索</button>}
      {state.flags.includes('market_exit_crossed') && <button disabled={disabled} onClick={() => onCommand(chapterStoryCommand('greenhouse'))}>进入第三章剧情 · 探索尚未开放</button>}
      {state.flags.includes('greenhouse_fortified') && <button disabled={disabled} onClick={() => onCommand(chapterExploreCommand('tunnel'))}>进入第四章试玩 · 地下通道探索</button>}
      {state.flags.includes('tunnel_explored') && state.flags.includes('cats_rescued_batch1') && (state.inventory.clue ?? 0) >= 3 && <button disabled={disabled} onClick={() => onCommand(chapterStoryCommand('finale'))}>进入第五章剧情 · 探索尚未开放</button>}
    </div>
    {hasBattleTrials && <h3 className="chapter-loadout-kicker" style={{margin: '4px 0 0'}}>战斗试玩 · 花房防线胜利可解锁第四章</h3>}
    {state.flags.includes('alley_rescued') && <ChapterLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <MarketLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('momo_joined') && <GreenhouseLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <TunnelLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <FinaleLoadout disabled={disabled} onCommand={onCommand}/>}
    <div className="renovation-card">
      <span className="eyebrow">GREENHOUSE RENOVATION</span>
      <h3 className="renovation-title">🛠️ 花房修缮 · 阶段 {stage}/4「{stageTitles[stage - 1]}」</h3>
      <div className="renovation-track" aria-label="修缮进度">
        {stageTitles.map((title, index) => <div key={title} title={title} className={`renovation-seg ${index < stage ? 'done' : ''}`}/>)}
      </div>
      <p className="renovation-hint muted">{stageHints[stage - 1]}</p>
      {nextRenovation ? <>
        <p className="renovation-next"><b>下一工程：</b>{nextRenovation.name} —— {nextRenovation.description}</p>
        <div className="renovation-cost-row">
          <span className="muted renovation-cost-label">所需：◆ 材料 ×{nextMaterial}{nextStamp > 0 ? ` ＋ ✦ 邮票 ×${nextStamp}` : ''}（现有 ◆{material} ✦{stamp}）</span>
          {nextMaterial > 0 && <span className="renovation-progress"><span style={{width: `${Math.min(100, Math.round(material / nextMaterial * 100))}%`}}/></span>}
        </div>
        <button disabled={disabled || !affordable} data-sound="pickup" onClick={() => {playSound('pickup');onCommand({type: 'REPAIR_HOME'});}}>{affordable ? `🔨 动手修缮：${nextRenovation.name}` : `🔨 材料还不够（◆${material}/${nextMaterial}）`}</button>
      </> : kingdomFounded
        ? <p className="renovation-done muted">🎉 修缮全部完成！暖黄串灯下的流浪猫王国正热闹着，街坊们常来送水碗和猫粮。</p>
        : <p className="renovation-done muted">花房已经修缮完毕，点亮终章后，这里会成为真正的流浪猫王国。</p>}
    </div>
    <FurniturePicker value={furniture} options={state.furniture.map(id => ({id, label: name(id)}))} disabled={disabled} onChange={setSelected}/>
    <div className="slot-list">{catalog.slots.map(slot => {const locked = lockedSlots.has(slot.id);return <button className="secondary" key={slot.id} disabled={disabled || !furniture || locked} onClick={() => onCommand({type: 'PLACE_FURNITURE', furnitureId: furniture, slotId: slot.id})}>{locked ? '🔒 ' : ''}{slot.name}<small>{locked ? '完成对应修缮后解锁' : state.placements[slot.id] ? name(state.placements[slot.id]) : '还空着，放一件家具'}</small></button>;})}</div>
    <button className="shop-home" disabled={disabled} onClick={onShop}>去猫国商店挑一件家具 ↗</button>
    {drawPools.map(pool => {const tunaPool = (pool.currency ?? 'stamp') === 'tuna';const total = pool.entries.reduce((sum, e) => sum + e.weight, 0) || 1;const balance = tunaPool ? state.currencies.tuna ?? 0 : state.currencies.stamp ?? 0;const short = balance < pool.cost;return <div className={`pool-card ${tunaPool ? 'pool-tuna' : 'pool-stamp'}`} key={pool.id}>
      <div className="pool-head"><b>{tunaPool ? '🥫 金枪鱼豪华包裹' : '✦ 邮票包裹'}</b><span>{pool.name}</span></div>
      <button disabled={disabled || short} data-sound="pickup" onClick={() => {playSound('pickup');onCommand({type: 'DRAW_FURNITURE', poolId: pool.id});}} aria-label={tunaPool ? `打开星空温室包裹，消耗 ${pool.cost} 罐金枪鱼` : `打开雨夜包裹，消耗 ${pool.cost} 邮票`}>{tunaPool ? `✨ 打开星空温室包裹 · 🥫 ${pool.cost} 罐` : `打开雨夜包裹 · ✦ ${pool.cost} 邮票`}{short ? (tunaPool ? '（罐头不足）' : '（邮票不足）') : ''}</button>
      {tunaPool && short && <button className="secondary pool-recharge" disabled={disabled} onClick={onRecharge}>🥫 罐头不足，去补给小站看看 ↗</button>}
      <p className="muted">{pool.entries.map(e => `${name(e.furnitureId)} ${Math.round(e.weight / total * 100)}%`).join('，')}；重复家具转化为 2 份材料。</p>
    </div>;})}
    <p className="home-result unpack-flash" key={`${state.revision}:${state.lastResult.message}`} role="status">{state.lastResult.message}</p>
    {CHATTER_CALLBACKS.some(c => state.flags.includes(c.flag)) && (
      <div className="cat-chatter-box">
        <div className="cat-chatter-head">
          <span>🐾 伙伴日常絮语</span>
          <span className="cat-chatter-sub">（世界记住了你的善意与选择）</span>
        </div>
        {CHATTER_CALLBACKS.filter(c => state.flags.includes(c.flag)).map((c, i) => (
          <div key={i} className="cat-chatter-item">
            <strong>{c.speaker}</strong>：{c.text}
          </div>
        ))}
      </div>
    )}
    {(state.flags.includes('alley_rescued') || state.flags.includes('rescue_story_done')) && (
      !state.flags.includes('chapter_2_started') ? (
        <button data-testid="chapter2-start" className="primary-action-btn" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('market'))}>
          🌙 启程：第二章《午夜集市》 →
        </button>
      ) : (
        <div className="home-action-row">
          <button data-testid="chapter2-explore" className="primary-action-btn" disabled={disabled} onClick={() => onCommand(chapterExploreCommand('market'))}>
            🌙 前往午夜集市 →
          </button>
          <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('market'))}>
            📖 重温第二章剧情
          </button>
        </div>
      )
    )}
    {state.flags.includes('market_cleared') && state.flags.includes('market_exit_crossed') && (
      !state.flags.includes('chapter_3_started') ? (
        <button className="primary-action-btn home-action-gap" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('greenhouse'))}>
          🌿 启程：第三章剧情（结识墨墨后守护花房） →
        </button>
      ) : (
        <div className="home-action-row home-action-gap">
          <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('greenhouse'))}>
            📖 重温第三章剧情
          </button>
        </div>
      )
    )}
    {state.flags.includes('tunnel_explored') && state.flags.includes('cats_rescued_batch1') && (
      !state.flags.includes('finale_started') ? (
        (state.inventory.clue ?? 0) < 3 ? (
          <div className="clue-card home-action-gap">
            <div className="clue-card-title">
              🔍 废弃大仓库线索不足（当前收集：{state.inventory.clue ?? 0} / 3）
            </div>
            <div className="clue-card-hint">
              前往总仓库需至少 3 条线索。线索不足无法锁定据点，大家决定先回集市多打听些情报再行动。
            </div>
            <div className="home-action-row">
              <button className="primary-action-btn" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'finale_clue_insufficient'})}>
                💬 听阿策分析线索 →
              </button>
              <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterExploreCommand('market'))}>
                🌙 回集市收集线索 →
              </button>
            </div>
          </div>
        ) : (
          <button className="primary-action-btn home-action-gap" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('finale'))}>
            🌟 启程：终章剧情（仓库探索地图尚未开放；战斗试玩独立）（线索已齐备 {state.inventory.clue ?? 3}/3） →
          </button>
        )
      ) : (
        <div className="home-action-row home-action-gap">
          <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('finale'))}>
            📖 重温终章大结局
          </button>
        </div>
      )
    )}
    {state.flags.includes('finale_completed') && (
      <div className="celebration-card home-action-gap">
        <div className="celebration-title">👑 全剧终 · 流浪猫王国落成！</div>
        <div className="celebration-text">
          喵喵与伙伴们用光明驱散了废弃仓库的所有黑影，救回了全部被困猫咪。花房如今挂起暖黄串灯、搭起纸箱城堡，成为了温暖坚固的流浪猫王国！喵喵回到主人身边吃到了金枪鱼，也每天都会回来和大家一起守护王国！
        </div>
      </div>
    )}
    <div className="home-action-row home-action-gap">
      <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterExploreCommand('alley'))}>再去小巷走走 →</button>
      <button className="quiet" disabled={disabled} onClick={() => onCommand(chapterStoryCommand('alley'))}>📖 重温第一章剧情</button>
    </div>
    </div>
  </section>;
}
