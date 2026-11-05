import PixelCat from './PixelCat';
import StartMenuBackdrop from './StartMenuBackdrop';
import GameButton from './GameButton';

// Keep the title focused on entering the saved journey.
export default function StartScreen({
  hasProgress,
  disabled,
  signedIn,
  onLogin,
  onStart
}: {
  hasProgress: boolean;
  signedIn: boolean;
  onLogin: () => void;
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
        <GameButton className="start-play" aria-label={signedIn?'继续冒险':'登录'} icon={signedIn?"play":"account"} disabled={disabled} onClick={signedIn?onStart:onLogin}
          label={signedIn ? '继续冒险' : '登录'} sub={signedIn ? '沿着上次的猫爪印继续' : '登录账号，记住回家的路'}/>
      </div>
      {!signedIn&&<button type="button" className="start-guest" aria-label="暂不登录" disabled={disabled} onClick={onStart}>暂不登录<span>{hasProgress?'接着本机旅程':'先去小巷看看'} ›</span></button>}
    </div>
  </section>;
}
