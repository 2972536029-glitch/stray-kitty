import PixelCat from './PixelCat';
import StartMenuBackdrop from './StartMenuBackdrop';
import GameButton from './GameButton';

// 轩扬 react-demo 的开场构图与文案；进度由外部传入，开始按钮不重置存档。
// 三个主按钮统一走 GameButton：同一几何与图标尺寸，居中对称排布（无进度时两个，有进度时三个）。
export default function StartScreen({
  hasProgress,
  disabled,
  onStart,
  onShop,
  onReset
}: {
  hasProgress: boolean;
  disabled: boolean;
  onStart: () => void;
  onShop: () => void;
  onReset?: () => void;
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
        <GameButton className="start-play" icon="play" disabled={disabled} onClick={onStart}
          label={hasProgress ? '继续冒险' : '开始冒险'} sub={hasProgress ? '沿着上次的猫爪印继续' : '从金枪鱼事件开始'}/>
        <GameButton className="start-shop" icon="shop" disabled={disabled} onClick={onShop}
          label="猫国商店" sub="用猫爪邮票装饰家园"/>
        {hasProgress && onReset && (
          <GameButton className="start-reset" icon="reset" disabled={disabled} onClick={onReset}
            label="重新开始" sub="重置为新存档" title="清空当前保存的进度，从序章重新体验"/>
        )}
      </div>
      <div className="start-save">{hasProgress ? '旅程已自动保存，伙伴们在等你。' : '探索小巷 · 守护伙伴 · 一起创造家'}</div>
    </div>
    <footer><span>XSOLLA GARAGE · SPRINT 1</span><b>保护 · 救援 · 一起创造家</b></footer>
  </section>;
}
