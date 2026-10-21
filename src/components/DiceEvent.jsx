import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import events from '../data/events.json'
import PixelCat from './PixelCat'

const dots = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}

export default function DiceEvent({ selected, result, onChoose, onResolve, onContinue }) {
  const event=events.meet_diandian
  const [rolling,setRolling]=useState(false)
  const chosen=event.options.find(x=>x.id===selected)
  const roll=()=>{
    if(!chosen||rolling||result) return
    setRolling(true)
    setTimeout(()=>{
      const raw=Math.floor(Math.random()*6)+1
      onResolve(raw,chosen.modifier,chosen.successReward,chosen.failureCost)
      setRolling(false)
    },950)
  }
  const face=result?.raw||1
  return <div className="event-overlay">
    <div className="event-noise"/>
    <motion.section className="event-card" initial={{scale:.86,opacity:0}} animate={{scale:1,opacity:1}}>
      <div className="event-ribbon"><span>随机事件 · D6</span><b>信任判定</b></div>
      <div className="event-cats"><PixelCat breed="miaomiao" size={120}/><div className="paw-path">· · 🐾 · ·</div><PixelCat breed="diandian" size={120} mood="worried"/></div>
      <h2>{event.title}</h2><p className="event-prompt">{event.prompt}</p>
      <div className="choice-grid">
        {event.options.map(opt=><button key={opt.id} onClick={()=>!result&&onChoose(opt.id)} className={`choice-card ${selected===opt.id?'selected':''}`}>
          <span className="choice-icon">{opt.icon}</span><b>{opt.label}</b><small>{opt.hint}</small><i>{selected===opt.id?'已选择':'选择'}</i>
        </button>)}
      </div>
      <div className="dice-zone">
        <div className="threshold"><small>成功条件</small><b>D6 + 加成 ≥ {event.threshold}</b></div>
        <motion.div className="dice" animate={rolling?{rotate:[0,180,430,720],y:[0,-32,8,0],scale:[1,.84,1.08,1]}:{}} transition={{duration:.9}}>
          {Array.from({length:9},(_,i)=><i key={i} className={dots[face].includes(i)?'on':''}/>) }
        </motion.div>
        <button className="primary-btn" onClick={result?onContinue:roll} disabled={!selected||rolling}>
          {rolling?'命运滚动中…':result?(result.success?'成功 · 继续':'失败 · 继续'):'掷出骰子'}
        </button>
      </div>
      <AnimatePresence>{result&&<motion.div className={`result-toast ${result.success?'success':'fail'}`} initial={{y:18,opacity:0}} animate={{y:0,opacity:1}}>
        <b>{result.success?'信任建立！':'有点尴尬…'}</b><span>骰点 {result.raw}{chosen.modifier?` + ${chosen.modifier}`:''} = {result.total}</span>
      </motion.div>}</AnimatePresence>
    </motion.section>
  </div>
}
