import {useState} from 'react';
import type {Catalog, GameCommand, GameState} from '../contracts';
import {ChapterLoadout} from '../modules/battle/ChapterLoadout';
import {MarketLoadout} from '../modules/battle/MarketLoadout';
import {GreenhouseLoadout} from '../modules/battle/GreenhouseLoadout';
import {TunnelLoadout} from '../modules/battle/TunnelLoadout';
import {FinaleLoadout} from '../modules/battle/FinaleLoadout';
import {exploreChapter2Command, startChapter2Command} from './chapterCommands';

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

export default function HomePanel({state, catalog, disabled, onCommand, onShop, onRecharge}: {state: GameState; catalog: Catalog; disabled: boolean; onCommand: (command: GameCommand) => void; onShop: () => void; onRecharge: () => void}) {
  const [selected, setSelected] = useState('cardboard_nest');
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
  return <section className="journal-card home-panel"><span className="eyebrow">MAKE IT OURS</span><h2>整理我们的家</h2>
    {state.flags.includes('alley_rescued') && <ChapterLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <MarketLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('momo_joined') && <GreenhouseLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <TunnelLoadout disabled={disabled} onCommand={onCommand}/>}
    {state.flags.includes('alley_rescued') && <FinaleLoadout disabled={disabled} onCommand={onCommand}/>}
    <div className="renovation-card" style={{marginTop: '4px', padding: '10px 12px', border: '1px solid var(--line-subtle, #3d4a44)', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(122, 156, 130, .12), rgba(244, 214, 137, .10))'}}>
      <span className="eyebrow">GREENHOUSE RENOVATION</span>
      <h3 style={{margin: '2px 0 6px', fontSize: '15px'}}>🛠️ 花房修缮 · 阶段 {stage}/4「{stageTitles[stage - 1]}」</h3>
      <div style={{display: 'flex', gap: '4px', marginBottom: '8px'}} aria-label="修缮进度">
        {stageTitles.map((title, index) => <div key={title} title={title} style={{flex: 1, height: '8px', borderRadius: '4px', background: index < stage ? 'linear-gradient(90deg, #f4d689, #e2a03f)' : 'var(--line-subtle, #3d4a44)', opacity: index < stage ? 1 : 0.5}}/>)}
      </div>
      <p style={{margin: '0 0 8px', fontSize: '13px', lineHeight: 1.5}} className="muted">{stageHints[stage - 1]}</p>
      {nextRenovation ? <>
        <p style={{margin: '0 0 4px', fontSize: '13px', lineHeight: 1.5}}><b>下一工程：</b>{nextRenovation.name} —— {nextRenovation.description}</p>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
          <span className="muted" style={{fontSize: '13px'}}>所需：◆ 材料 ×{nextMaterial}{nextStamp > 0 ? ` ＋ ✦ 邮票 ×${nextStamp}` : ''}（现有 ◆{material} ✦{stamp}）</span>
          {nextMaterial > 0 && <span style={{flexBasis: '100%', height: '6px', borderRadius: '3px', background: 'var(--line-subtle, #3d4a44)', overflow: 'hidden'}}><span style={{display: 'block', width: `${Math.min(100, Math.round(material / nextMaterial * 100))}%`, height: '100%', background: 'linear-gradient(90deg, #8fbf9f, #5f9d74)'}}/></span>}
        </div>
        <button disabled={disabled || !affordable} onClick={() => onCommand({type: 'REPAIR_HOME'})}>{affordable ? `🔨 动手修缮：${nextRenovation.name}` : `🔨 材料还不够（◆${material}/${nextMaterial}）`}</button>
      </> : kingdomFounded
        ? <p style={{margin: 0, fontSize: '13px'}} className="muted">🎉 修缮全部完成！暖黄串灯下的流浪猫王国正热闹着，街坊们常来送水碗和猫粮。</p>
        : <p style={{margin: 0, fontSize: '13px'}} className="muted">花房已经修缮完毕，点亮终章后，这里会成为真正的流浪猫王国。</p>}
    </div>
    <label className="select-label">选择家具<select value={furniture} onChange={e => setSelected(e.target.value)} disabled={disabled}>{state.furniture.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>
    <div className="slot-list">{catalog.slots.map(slot => {const locked = lockedSlots.has(slot.id);return <button className="secondary" key={slot.id} disabled={disabled || !furniture || locked} onClick={() => onCommand({type: 'PLACE_FURNITURE', furnitureId: furniture, slotId: slot.id})}>{locked ? '🔒 ' : ''}{slot.name}<small>{locked ? '完成对应修缮后解锁' : state.placements[slot.id] ? name(state.placements[slot.id]) : '还空着，放一件家具'}</small></button>;})}</div>
    <button className="shop-home" disabled={disabled} onClick={onShop}>去猫国商店挑一件家具 ↗</button>
    {drawPools.map(pool => {const tunaPool = (pool.currency ?? 'stamp') === 'tuna';const total = pool.entries.reduce((sum, e) => sum + e.weight, 0) || 1;const balance = tunaPool ? state.currencies.tuna ?? 0 : state.currencies.stamp ?? 0;const short = balance < pool.cost;return <div className={`pool-card ${tunaPool ? 'pool-tuna' : 'pool-stamp'}`} key={pool.id}>
      <div className="pool-head"><b>{tunaPool ? '🥫 金枪鱼豪华包裹' : '✦ 邮票包裹'}</b><span>{pool.name}</span></div>
      <button disabled={disabled || short} onClick={() => onCommand({type: 'DRAW_FURNITURE', poolId: pool.id})} aria-label={tunaPool ? `打开星空温室包裹，消耗 ${pool.cost} 罐金枪鱼` : `打开雨夜包裹，消耗 ${pool.cost} 邮票`}>{tunaPool ? `✨ 打开星空温室包裹 · 🥫 ${pool.cost} 罐` : `打开雨夜包裹 · ✦ ${pool.cost} 邮票`}{short ? (tunaPool ? '（罐头不足）' : '（邮票不足）') : ''}</button>
      {tunaPool && short && <button className="secondary pool-recharge" disabled={disabled} onClick={onRecharge}>🥫 罐头不足，去补给小站看看 ↗</button>}
      <p className="muted">{pool.entries.map(e => `${name(e.furnitureId)} ${Math.round(e.weight / total * 100)}%`).join('，')}；重复家具转化为 2 份材料。</p>
    </div>;})}
    <p className="home-result unpack-flash" key={`${state.revision}:${state.lastResult.message}`} role="status">{state.lastResult.message}</p>
    {CHATTER_CALLBACKS.some(c => state.flags.includes(c.flag)) && (
      <div className="cat-chatter-box" style={{margin: '10px 0', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', borderLeft: '3px solid #ffb300', fontSize: '13px'}}>
        <div style={{fontWeight: 'bold', color: '#ffb300', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px'}}>
          <span>🐾 伙伴日常絮语</span>
          <span style={{fontSize: '11px', color: 'var(--text-subtle, #a0aec0)', fontWeight: 'normal'}}>（世界记住了你的善意与选择）</span>
        </div>
        {CHATTER_CALLBACKS.filter(c => state.flags.includes(c.flag)).map((c, i) => (
          <div key={i} style={{marginTop: i > 0 ? '6px' : '0', color: 'var(--text-normal, #e2e8f0)', lineHeight: '1.4'}}>
            <strong style={{color: '#90cdf4'}}>{c.speaker}</strong>：{c.text}
          </div>
        ))}
      </div>
    )}
    {(state.flags.includes('alley_rescued') || state.flags.includes('rescue_story_done')) && (
      !state.flags.includes('chapter_2_started') ? (
        <button data-testid="chapter2-start" className="primary-action-btn" disabled={disabled} onClick={() => onCommand(startChapter2Command())}>
          🌙 启程：第二章《午夜集市》 →
        </button>
      ) : (
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          <button data-testid="chapter2-explore" className="primary-action-btn" disabled={disabled} onClick={() => onCommand(exploreChapter2Command())}>
            🌙 前往午夜集市 →
          </button>
          <button className="quiet" disabled={disabled} onClick={() => onCommand(startChapter2Command())}>
            📖 重温第二章剧情
          </button>
        </div>
      )
    )}
    {(state.flags.includes('chapter_2_started') || state.flags.includes('market_unlocked')) && (
      !state.flags.includes('chapter_3_started') ? (
        <button className="primary-action-btn" style={{marginTop: '8px'}} disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'greenhouse_intro_1'})}>
          🌿 启程：第三章《废弃花房》 →
        </button>
      ) : (
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px'}}>
          <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'greenhouse_intro_1'})}>
            📖 重温第三章剧情
          </button>
        </div>
      )
    )}
    {state.flags.includes('greenhouse_fortified') && (
      !state.flags.includes('chapter_4_started') ? (
        <button className="primary-action-btn" style={{marginTop: '8px'}} disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'rescue_intro_1'})}>
          🐾 启程：第四章《消失的猫咪们》 →
        </button>
      ) : (
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px'}}>
          <button className="primary-action-btn" disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'tunnel'})}>
            🐾 前往地下暗道 →
          </button>
          <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'rescue_intro_1'})}>
            📖 重温第四章剧情
          </button>
        </div>
      )
    )}
    {(state.flags.includes('chapter_4_started') || state.flags.includes('tunnel_explored')) && (
      !state.flags.includes('finale_started') ? (
        (state.inventory.clue ?? 0) < 3 ? (
          <div style={{marginTop: '8px', padding: '10px 12px', background: 'rgba(255, 180, 0, 0.08)', borderRadius: '8px', border: '1px dashed #e2a03f'}}>
            <div style={{fontSize: '13px', color: '#ffb300', fontWeight: 'bold', marginBottom: '4px'}}>
              🔍 废弃大仓库线索不足（当前收集：{state.inventory.clue ?? 0} / 3）
            </div>
            <div style={{fontSize: '12px', color: 'var(--text-subtle, #a0aec0)', marginBottom: '8px', lineHeight: '1.4'}}>
              前往总仓库需至少 3 条线索。线索不足无法锁定据点，大家决定先回集市多打听些情报再行动。
            </div>
            <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
              <button className="primary-action-btn" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'finale_clue_insufficient'})}>
                💬 听阿策分析线索 →
              </button>
              <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE', mapId: 'market'})}>
                🌙 回集市收集线索 →
              </button>
            </div>
          </div>
        ) : (
          <button className="primary-action-btn" style={{marginTop: '8px'}} disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'finale_intro_1'})}>
            🌟 启程：终章《点亮流浪猫王国》（线索已齐备 {state.inventory.clue ?? 3}/3） →
          </button>
        )
      ) : (
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px'}}>
          <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'finale_intro_1'})}>
            📖 重温终章大结局
          </button>
        </div>
      )
    )}
    {state.flags.includes('finale_completed') && (
      <div className="celebration-card" style={{marginTop: '12px', padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 140, 0, 0.15))', border: '1px solid #e2a03f', borderRadius: '12px'}}>
        <div style={{fontWeight: 'bold', color: '#ffb300', fontSize: '15px', marginBottom: '4px'}}>👑 全剧终 · 流浪猫王国落成！</div>
        <div style={{fontSize: '13px', color: 'var(--text-subtle, #a0aec0)', lineHeight: '1.5'}}>
          喵喵与伙伴们用光明驱散了废弃仓库的所有黑影，救回了全部被困猫咪。花房如今挂起暖黄串灯、搭起纸箱城堡，成为了温暖坚固的流浪猫王国！喵喵回到主人身边吃到了金枪鱼，也每天都会回来和大家一起守护王国！
        </div>
      </div>
    )}
    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px'}}>
      <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'GO_EXPLORE'})}>再去小巷走走 →</button>
      <button className="quiet" disabled={disabled} onClick={() => onCommand({type: 'START_STORY', nodeId: 'chapter1_intro'})}>📖 重温第一章剧情</button>
    </div>
  </section>;
}
