import { motion } from 'framer-motion'
import PixelCat from '../../components/PixelCat'

const stops = [
  { id:'home', icon:'⌂', name:'蓝碗之家', note:'咪最初想回去的地方', state:'known' },
  { id:'alley', icon:'▦', name:'陌生小巷', note:'遇见点点 · 当前区域', state:'current' },
  { id:'market', icon:'★', name:'午夜集市', note:'寻找黑影的线索', state:'locked' },
  { id:'greenhouse', icon:'❀', name:'废弃花房', note:'一起建造新的家', state:'locked' },
]

export default function WorldMap({ onClose }) {
  return <motion.div className="map-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
    <motion.section className="world-map" initial={{scale:.86,y:30}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()}>
      <button className="map-close" onClick={onClose}>×</button>
      <header><small>猫爪地图 · CHAPTER ROUTE</small><h2>沿着气味，寻找家的方向</h2><p>“家”不只在终点，也会在伙伴身边慢慢长出来。</p></header>
      <div className="map-paper">
        <div className="map-river"/><div className="map-cloud c1">☁</div><div className="map-cloud c2">☁</div>
        <div className="map-route">
          {stops.map((stop,i)=><div className={`map-stop ${stop.state}`} key={stop.id}>
            <span className="map-dot">{stop.icon}</span><b>{stop.name}</b><small>{stop.note}</small>
            {i===1&&<div className="map-miao"><PixelCat breed="miaomiao" size={70}/><i>你在这里</i></div>}
          </div>)}
        </div>
      </div>
      <footer><span>⌂ 找回自己的家</span><b>→</b><span>♥ 帮伙伴找到家</span><b>→</b><span>❀ 一起创造家</span></footer>
    </motion.section>
  </motion.div>
}
