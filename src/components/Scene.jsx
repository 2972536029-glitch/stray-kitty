import { motion } from 'framer-motion'
import PixelCat from './PixelCat'
import MapArtSlot from '../features/map/MapArtSlot'

function Rain() {
  return <div className="rain" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{left:`${(i*47)%103}%`,animationDelay:`-${(i%9)*.31}s`,animationDuration:`${.8+(i%5)*.12}s`}} />)}</div>
}

export default function Scene({ node }) {
  const isBox = node.scene === 'box'
  const isPoster = node.scene === 'poster'
  return <section className={`scene scene-${node.scene || 'alley'}`}>
    <MapArtSlot scene={node.scene} />
    <div className="pixel-sky"><span className="moon" /></div>
    <div className="city-back"><i/><i/><i/><i/><i/></div>
    <div className="alley-wall">
      <div className="brick b1"/><div className="brick b2"/><div className="brick b3"/><div className="brick b4"/>
      <div className="lamp"><span/><b/></div>
      {isPoster && <motion.div className="lost-poster" initial={{rotate:-8,scale:.8}} animate={{rotate:-3,scale:1}}>
        <b>寻 猫 启 事</b><PixelCat breed="miaomiao" size={74}/><strong>喵喵</strong><small>家里的蓝色饭碗<br/>一直在等你</small>
      </motion.div>}
      {!isPoster && <div className="graffiti">CAT<br/>ROUTE <span>→</span></div>}
    </div>
    <div className="ground"><div className="puddle"/><div className="can prop">◒</div><div className="fishbone prop">&gt;—</div></div>
    <Rain/>
    <motion.div className="hero-cat" key={node.id} initial={{x:-24,opacity:0}} animate={{x:0,opacity:1}}>
      <PixelCat breed="miaomiao" mood={isPoster?'worried':'idle'} />
      <span className="cat-label">喵喵<small>傲娇家猫</small></span>
    </motion.div>
    {isBox && <motion.div className="box-cat" initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} transition={{delay:.2}}>
      <div className="cardboard-box"><span>↑ 小 心 轻 放 ↑</span></div>
      <PixelCat breed="diandian" size={128} mood="worried" />
      <span className="cat-label">点点<small>受伤的奶牛猫</small></span>
    </motion.div>}
    <div className="scene-vignette"/>
  </section>
}
