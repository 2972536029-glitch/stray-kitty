import type {Catalog, GameState} from '../contracts';
import Modal from './Modal';

const art: Record<string, {icon: string; color: string}> = {blue_bowl: {icon: '◒', color: 'blue'}, red_cushion: {icon: '♥', color: 'red'}, sun_lamp: {icon: '☀', color: 'yellow'}, box_castle: {icon: '⌂', color: 'box'}};
export default function ShopPanel({state, catalog, disabled, error, onBuy, onRetry, onClose, onRecharge}: {state: GameState; catalog: Catalog; disabled: boolean; error: string; onBuy: (productId: string) => void; onRetry: () => void; onClose: () => void; onRecharge: () => void}) {
  const atHome = state.phase === 'home';
  const purchased = catalog.products.some(p => p.furnitureId === state.lastResult.outcome);
  const tunaPool = catalog.pools.find(p => p.id === 'starlight_greenhouse');
  const tunaShort = !!tunaPool && (state.currencies.tuna ?? 0) < tunaPool.cost;
  return <Modal title="猫国商店" onClose={onClose} className="cat-shop">
    <header><div><span className="eyebrow">MAKE IT OURS</span><h2>猫国商店</h2></div><div className="shop-wallets">
      <div className="shop-wallet">✦ <b>{state.currencies.stamp ?? 0}</b><small>猫爪邮票</small></div>
      <button className="shop-wallet tuna" onClick={onRecharge} aria-label="金枪鱼罐头，点击充值" title="点击打开金枪鱼补给小站">🥫 <b>{state.currencies.tuna ?? 0}</b><small>金枪鱼罐头 · 充值</small></button>
    </div></header>
    <div className="shop-banner"><span>NEW</span><div><b>花房开张纪念 · 星空温室包裹</b><p>每一件家具，都是“这里可以安心睡觉”的证明。豪华包裹用 🥫 金枪鱼开启，重复会化作修缮材料。</p></div></div>
    {!atHome && <p className="shop-notice">{state.flags.includes('alley_rescued') ? '回到花房后，就可以为伙伴挑选家具。' : '完成首次救援、安顿花房后开放购买。'}</p>}
    {atHome && tunaPool && <div className="shop-tuna-entry">
      <div><b>🥫 金枪鱼豪华包裹 · 星空温室</b><p>{tunaPool.entries.map(e => catalog.furniture.find(f => f.id === e.furnitureId)?.name ?? e.furnitureId).join('、')}；✦ 邮票包裹请回花房开启。</p></div>
      <div className="shop-tuna-actions">
        <button className="primary-action-btn" disabled={disabled || tunaShort} onClick={onRecharge}>{tunaShort ? `🥫 充值（还差 ${tunaPool.cost - (state.currencies.tuna ?? 0)} 罐）` : '🥫 去补给小站充值'}</button>
      </div>
    </div>}
    <div className="shop-grid">{catalog.products.map(product => {
      const furniture = catalog.furniture.find(f => f.id === product.furnitureId);
      const owned = state.furniture.includes(product.furnitureId);
      const locked = !!product.requiredFlag && !state.flags.includes(product.requiredFlag);
      const affordable = (state.currencies[product.currencyId] ?? 0) >= product.price;
      const style = art[product.furnitureId] ?? {icon: '✦', color: 'blue'};
      return <article key={product.id} className={`shop-item ${style.color} ${owned ? 'owned' : ''}`}>
        <div className="item-art" aria-hidden="true">{style.icon}<small>✦</small></div><span>{furniture?.theme}</span><h3>{furniture?.name ?? product.furnitureId}</h3>
        <button disabled={disabled || owned || locked || !atHome || !affordable || product.status !== 'available'} onClick={() => onBuy(product.id)} aria-label={owned ? `${furniture?.name}已拥有` : `购买${furniture?.name}，${product.price}邮票`}>
          {owned ? '已送达花房' : `✦ ${product.price}　${!affordable && atHome ? '邮票不足' : '购买'}`}
        </button>
      </article>;
    })}</div>
    {error ? <div className="shop-notice shop-error" role="alert">{error}<button onClick={onRetry} disabled={disabled}>重试上次操作</button></div> : <p className="shop-notice" role="status">{purchased ? state.lastResult.message : '每件家具只需购买一次，送达后在花房选择位置摆放。'}</p>}
    <footer>家具仅用于装饰，不影响通关。邮票包裹免费；金枪鱼为演示充值（模拟卡号），不产生真实扣款。</footer>
  </Modal>;
}
