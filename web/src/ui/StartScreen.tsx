import PixelCat from './PixelCat';
import StartMenuBackdrop from './StartMenuBackdrop';
import GameButton from './GameButton';

// Keep the title focused on entering the saved journey.
export default function StartScreen({
  hasProgress,
  disabled,
  onStart
}: {
  hasProgress: boolean;
  disabled: boolean;
  onStart: () => void;
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
      </div>
    </div>
  </section>;
}
