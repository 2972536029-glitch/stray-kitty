import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from './store/gameStore'
import Hud from './components/Hud'
import Scene from './components/Scene'
import StoryPanel from './components/StoryPanel'
import CatRoster from './components/CatRoster'
import DiceEvent from './components/DiceEvent'
import TowerDefense from './features/tower-defense'
import EndScreen from './components/EndScreen'
import WorldMap from './features/map/WorldMap'
import StartScreen from './features/brand/StartScreen'
import StoreModal from './features/store/StoreModal'

export default function App() {
  const game = useGameStore()
  const [mapOpen,setMapOpen] = useState(false)
  const [shopOpen,setShopOpen] = useState(false)
  const node = game.getNode()
  useEffect(()=>{
    const phaseNames={START:'start',STORY:'story',ROLL_DICE:'dice_event',TOWER_DEFENSE:'tower_defense',END:'chapter_end'}
    console.info('[Kittych demo] phase_entered',phaseNames[game.phase])
  },[game.phase])
  if (!node) return <div className="fatal">剧情节点走丢了 ฅ(•ㅅ•❀)ฅ</div>
  return <main className={`app phase-${game.phase.toLowerCase()}`}>
    <AnimatePresence mode="wait">
      {game.phase === 'START' ? <motion.div key="start" className="phase-layer" initial={{opacity:0}} animate={{opacity:1}}><StartScreen onStart={game.startGame} onShop={()=>setShopOpen(true)}/></motion.div>
      : game.phase === 'TOWER_DEFENSE' ? <motion.div key="tower" className="phase-layer" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><TowerDefense onComplete={game.finishDefense}/></motion.div>
      : game.phase === 'END' ? <motion.div key="end" className="phase-layer" initial={{opacity:0}} animate={{opacity:1}}><EndScreen onRestart={game.restart}/></motion.div>
      : <motion.div key="story-shell" className="phase-layer" initial={{opacity:0}} animate={{opacity:1}}>
          <Hud stats={game.stats} chapter={game.chapter} onMap={()=>setMapOpen(true)} onShop={()=>setShopOpen(true)}/>
          <Scene node={node}/>
          <CatRoster active={node.scene==='box'?'diandian':'miaomiao'}/>
          {game.phase==='STORY'&&<StoryPanel node={node} onNext={game.advance}/>} 
          {game.phase==='ROLL_DICE'&&<DiceEvent selected={game.selectedChoice} result={game.diceResult} onChoose={game.choose} onResolve={game.resolveDice} onContinue={game.finishDice}/>} 
        </motion.div>}
    </AnimatePresence>
    <AnimatePresence>{mapOpen&&<WorldMap onClose={()=>setMapOpen(false)}/>}</AnimatePresence>
    <AnimatePresence>{shopOpen&&<StoreModal stamps={game.stats.stamps} owned={game.ownedFurniture} onBuy={game.buyFurniture} onClose={()=>setShopOpen(false)}/>}</AnimatePresence>
    {game.phase!=='START'&&<div className="theme-ribbon"><span>咪想回家。</span><span>原来不是所有猫都有家。</span><b>那就帮它们找到家。</b></div>}
    <div className="screen-corners" aria-hidden="true"><i/><i/><i/><i/></div>
  </main>
}
