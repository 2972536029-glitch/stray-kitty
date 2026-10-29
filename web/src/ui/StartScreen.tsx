import PixelCat from './PixelCat';
import StartMenuBackdrop from './StartMenuBackdrop';

// 轩扬 react-demo 的开场构图与文案；进度由外部传入，开始按钮不重置存档。
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
  return <section className="start-screen">
    <StartMenuBackdrop/>
    <header className="start-brand"><span className="xsolla-wordmark">XSOLLA<span> GARAGE</span></span><small>INTERNSHIP GAME PROJECT · 2026</small></header>
    <div className="start-title">
      <div className="start-cats"><PixelCat breed="tuanzi" size={120}/><PixelCat breed="miaomiao" size={185}/><PixelCat breed="diandian" size={125}/></div>
      <span className="eyebrow">PIXEL RESCUE · A LITTLE JOURNEY HOME</span>
      <h1>小猫回家记</h1><h2>流浪猫王国</h2>
      <p>咪想回家。原来不是所有猫都有家。<strong>那就帮它们找到家。</strong></p>
      <div className="start-actions">
        <button className="start-play" disabled={disabled} onClick={onStart}>
          <span aria-hidden="true">▶</span>
          <span><b>{hasProgress ? '继续冒险' : '开始冒险'}</b><small>{hasProgress ? '沿着上次的猫爪印继续' : '从金枪鱼事件开始'}</small></span>
        </button>
        <button className="start-shop" disabled={disabled} onClick={onShop}>
          <span aria-hidden="true">▣</span>
          <span><b>猫国商店</b><small>用猫爪邮票装饰家园</small></span>
        </button>
        {hasProgress && onReset && (
          <button type="button" className="start-reset" disabled={disabled} onClick={onReset} title="清空当前保存的进度，从序章重新体验">
            <span>↺ 重新开始（重置为新存档）</span>
          </button>
        )}
        {onAuth && (
          <button type="button" className="start-reset" disabled={disabled} onClick={onAuth} title="把旅程绑定到用户名密码，换设备也能取回">
            <span>👤 小猫账号{hasProgress ? ' · 保存这段旅程' : ' · 登录取回旅程'}</span>
          </button>
        )}
      </div>
      <div className="start-save">{hasProgress ? '旅程已自动保存，伙伴们在等你。' : '探索小巷 · 守护伙伴 · 一起创造家'}</div>
    </div>
    <footer><span>XSOLLA GARAGE · SPRINT 1</span><b>保护 · 救援 · 一起创造家</b></footer>
  </section>;
}
