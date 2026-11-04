import PixelCat from './PixelCat';
import StartMenuBackdrop from './StartMenuBackdrop';
import GameButton from './GameButton';

// Environment art is decorative; start, save, shop and reset retain their callbacks.
export default function StartScreen({
  hasProgress,
  disabled,
  onStart,
  onShop,
  onReset,
  onAuth
}: {
  hasProgress: boolean;
  disabled: boolean;
  onStart: () => void;
  onShop: () => void;
  onReset?: () => void;
  onAuth?: () => void;
}) {
  return <section className="start-screen opening-title">
    <StartMenuBackdrop/>
    <header className="start-brand"><span className="xsolla-wordmark">XSOLLA<span> GARAGE</span></span><small>INTERNSHIP GAME PROJECT · 2026</small></header>
    <div className="start-title">
      <div className="start-cats"><PixelCat breed="tuanzi" size={96}/><PixelCat breed="miaomiao" size={144}/><PixelCat breed="diandian" size={96}/></div>
      <span className="eyebrow">PIXEL RESCUE · A LITTLE JOURNEY HOME</span>
      <h1>小猫回家记</h1><h2>流浪猫王国</h2>
      <p>咪想回家。原来不是所有猫都有家。<strong>那就帮它们找到家。</strong></p>
      <div className="start-actions">
        <GameButton className="start-play" icon="play" disabled={disabled} onClick={onStart}
          label={hasProgress ? '继续冒险' : '开始冒险'} sub={hasProgress ? '沿着上次的猫爪印继续' : '从金枪鱼事件开始'}/>
        <GameButton className="start-shop" icon="shop" disabled={disabled} onClick={onShop}
          label="猫国商店" sub="用猫爪邮票装饰家园"/>
        {hasProgress && onReset && (
          <GameButton className="start-reset" icon="reset" disabled={disabled} onClick={onReset}
            label="重新开始" sub="重置为新存档" title="清空当前保存的进度，从序章重新体验"/>
        )}
      </div>
      {onAuth && <button type="button" className="start-account" disabled={disabled} onClick={onAuth} title="把旅程绑定到用户名密码，换设备也能取回">
        <svg viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M6 1h4v1h1v5h-1v1H6V7H5V2h1zM4 9h8v1h2v5H2v-5h2z"/></svg>
        <span>小猫账号 · {hasProgress ? '保存这段旅程' : '登录取回旅程'}</span><span aria-hidden="true">↗</span>
      </button>}
      <div className="start-save">{hasProgress ? '旅程已自动保存，伙伴们在等你。' : '探索小巷 · 守护伙伴 · 一起创造家'}</div>
    </div>
    <footer><span>XSOLLA GARAGE · SPRINT 1</span><b>保护 · 救援 · 一起创造家</b></footer>
  </section>;
}
