import { motion } from 'framer-motion'
import PixelCat from '../../components/PixelCat'
import XsollaMark from './XsollaMark'

export default function StartScreen({ onStart, onShop }) {
  return <div className="start-screen">
    <div className="start-shape red"/><div className="start-shape blue"/><div className="start-shape yellow"/>
    <header className="start-brand"><XsollaMark/><span>INTERNSHIP GAME PROJECT · 2026</span></header>
    <motion.section className="start-title" initial={{opacity:0}} animate={{opacity:1}}>
      <div className="start-cats"><PixelCat breed="tuanzi" size={105}/><PixelCat breed="miaomiao" size={165}/><PixelCat breed="diandian" size={112}/></div>
      <small>PIXEL RESCUE · TOWER DEFENSE</small>
      <h1>小猫回家记</h1><h2>流浪猫王国</h2>
      <p>“咪想回家。原来不是所有猫都有家。<b>那就帮它们找到家。</b>”</p>
      <div className="start-actions">
        <button className="start-play" onClick={onStart}><span>▶</span><b>开始冒险</b><small>从金枪鱼事件开始</small></button>
        <button className="start-shop" onClick={onShop}><span>▣</span><b>猫国商店</b><small>用猫爪邮票装饰家园</small></button>
      </div>
    </motion.section>
    <footer><span>XSOLLA GARAGE · SPRINT 1</span><b>保护 · 救援 · 一起创造家</b></footer>
  </div>
}
