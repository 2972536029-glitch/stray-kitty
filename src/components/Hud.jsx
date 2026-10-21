import { motion } from 'framer-motion'

const Stat = ({ icon, value, label, tone }) => (
  <div className={`hud-stat ${tone}`} title={label}>
    <span className="hud-icon">{icon}</span><b>{value}</b>
  </div>
)

export default function Hud({ stats, chapter, onMap, onShop }) {
  return <header className="hud">
    <div className="brand-lockup">
      <div className="paw-mark">🐾</div>
      <div><small>流浪猫王国</small><strong>小猫回家记</strong></div>
    </div>
    <motion.div className="chapter-pill" key={chapter} initial={{y:-12,opacity:0}} animate={{y:0,opacity:1}}>
      <i /> {chapter} <i />
    </motion.div>
    <div className="hud-stats">
      <Stat icon="♥" value={stats.heart} label="勇气" tone="heart" />
      <Stat icon="◆" value={stats.fish} label="鱼干" tone="fish" />
      <Stat icon="✦" value={stats.stamps} label="猫爪邮票" tone="stamp" />
      <button className="shop-button" onClick={onShop}><span>▣</span><b>商店</b></button>
      <button className="map-button" onClick={onMap}><span>▦</span><b>猫爪地图</b></button>
    </div>
  </header>
}
