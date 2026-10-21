import { motion } from 'framer-motion'
import PixelCat from './PixelCat'

export default function EndScreen({onRestart}) {
  return <div className="end-screen">
    <div className="end-stars">✦　·　✦　·　✦</div>
    <motion.div className="end-card" initial={{scale:.7,rotate:-3,opacity:0}} animate={{scale:1,rotate:0,opacity:1}}>
      <small>SPRINT 1 · THIN SLICE COMPLETE</small><h1>回家的路，<br/><em>也是救援的开始。</em></h1>
      <div className="end-cats"><PixelCat breed="miaomiao" size={130} mood="brave"/><PixelCat breed="diandian" size={110}/><PixelCat breed="tuanzi" size={122}/><PixelCat breed="momo" size={112}/></div>
      <p>你找到了寻猫启事，也决定先帮助伙伴。<br/>下一站：午夜集市与废弃花房。</p>
      <div className="reward-box"><span>本次获得</span><b>✦ 猫爪邮票 ×2</b><b>♥ 点点的信任</b></div>
      <button className="primary-btn" onClick={onRestart}>再玩一次</button>
    </motion.div>
  </div>
}
