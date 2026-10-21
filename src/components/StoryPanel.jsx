import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

function useTypewriter(text, speed=24) {
  const [shown,setShown] = useState('')
  useEffect(()=>{
    setShown('')
    let i=0
    const timer=setInterval(()=>{ i++; setShown(text.slice(0,i)); if(i>=text.length) clearInterval(timer) },speed)
    return ()=>clearInterval(timer)
  },[text,speed])
  return shown
}

export default function StoryPanel({ node, onNext }) {
  const shown = useTypewriter(node.text)
  const done = shown.length === node.text.length
  return <AnimatePresence mode="wait">
    <motion.div className="dialogue-wrap" key={node.id} initial={{y:28,opacity:0}} animate={{y:0,opacity:1}} exit={{y:-14,opacity:0}}>
      <div className="speaker-tag"><span>◆</span>{node.speaker}</div>
      <button className="dialogue-box" onClick={onNext} aria-label="继续剧情">
        <p>{shown}<span className="type-caret">▮</span></p>
        <div className="dialogue-footer">
          <span>{node.type === 'choice' ? '即将进入事件判定' : node.type === 'tower_defense' ? '即将进入塔防' : '点击任意处继续'}</span>
          {done && <motion.b animate={{y:[0,5,0]}} transition={{repeat:Infinity,duration:1}}>▼</motion.b>}
        </div>
      </button>
    </motion.div>
  </AnimatePresence>
}
