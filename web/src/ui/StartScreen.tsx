import PixelCat from './PixelCat';

// 轩扬 react-demo 的开场构图与文案；进度由外部传入，开始按钮不重置存档。
export default function StartScreen({hasProgress, disabled, onStart, onShop}: {hasProgress: boolean; disabled: boolean; onStart: () => void; onShop: () => void}) {
  return <section className="start-screen">
    <div className="start-shape shape-red" aria-hidden="true"/><div className="start-shape shape-blue" aria-hidden="true"/>
    <header className="start-brand"><span className="xsolla-wordmark">XSOLLA<span> GARAGE</span></span><small>INTERNSHIP GAME PROJECT · 2026</small></header>
    <div className="start-title">
      <div className="start-cats"><PixelCat breed="tuanzi" size={120}/><PixelCat breed="miaomiao" size={185}/><PixelCat breed="diandian" size={125}/></div>
      <span className="eyebrow">PIXEL RESCUE · A LITTLE JOURNEY HOME</span>
      <h1>小猫回家记</h1><h2>流浪猫王国</h2>
      <p>咪想回家。原来不是所有猫都有家。<strong>那就帮它们找到家。</strong></p>
      <div className="start-actions"><button className="start-play" disabled={disabled} onClick={onStart}><span aria-hidden="true">▶</span><span><b>{hasProgress ? '继续冒险' : '开始冒险'}</b><small>{hasProgress ? '沿着上次的猫爪印继续' : '从金枪鱼事件开始'}</small></span></button><button className="start-shop" disabled={disabled} onClick={onShop}><span aria-hidden="true">▣</span><span><b>猫国商店</b><small>用猫爪邮票装饰家园</small></span></button></div>
      <div className="start-save">{hasProgress ? '旅程已自动保存，伙伴们在等你。' : '探索小巷 · 守护伙伴 · 一起创造家'}</div>
    </div>
    <footer><span>XSOLLA GARAGE · SPRINT 1</span><b>保护 · 救援 · 一起创造家</b></footer>
  </section>;
}
