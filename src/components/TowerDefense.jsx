import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PixelCat from './PixelCat'

const rows=3, cols=5
const initialEnemies=[
  {id:1,row:0,col:5,hp:3},{id:2,row:1,col:6,hp:3},{id:3,row:2,col:7,hp:3},
  {id:4,row:1,col:9,hp:4},{id:5,row:0,col:11,hp:3},{id:6,row:2,col:12,hp:3},
]

function ShadowGhost({hp}) { return <div className="pixel-ghost"><i/><b/><em/><span>{hp}</span></div> }

export default function TowerDefense({ onComplete }) {
  const [selected,setSelected]=useState('can')
  const [towers,setTowers]=useState({})
  const [enemies,setEnemies]=useState(initialEnemies)
  const [fish,setFish]=useState(8)
  const [base,setBase]=useState(3)
  const [wave,setWave]=useState(1)
  const [status,setStatus]=useState('playing')
  const [tick,setTick]=useState(0)
  const [hint,setHint]=useState('选择防线，再点击格子放置。罐头远攻，纸箱阻挡。')
  const cost=selected==='can'?3:2
  const place=(r,c)=>{
    const key=`${r}-${c}`
    if(status!=='playing'||towers[key]||fish<cost) return
    setTowers({...towers,[key]:{type:selected,hp:selected==='box'?5:3}})
    setFish(fish-cost)
    setHint('放得好！留意发光的路线。')
  }
  useEffect(()=>{
    if(status!=='playing') return
    const timer=setInterval(()=>setTick(t=>t+1),900)
    return()=>clearInterval(timer)
  },[status])
  useEffect(()=>{
    if(!tick||status!=='playing') return
    let nextTowers={...towers}; let nextBase=base; let gained=0
    const next=enemies.map(enemy=>{
      let e={...enemy}; const rowTowers=Object.entries(towers).filter(([k])=>k.startsWith(`${e.row}-`))
      // Any can to the left fires one light pellet every turn.
      const canCount=rowTowers.filter(([k,t])=>t.type==='can' && Number(k.split('-')[1])<e.col).length
      if(canCount) e.hp-=canCount // 光点让黑影逐渐退散。
      if(e.hp<=0){ gained+=1; return null }
      const nextCol=e.col-1
      const blockKey=`${e.row}-${nextCol}`
      if(nextTowers[blockKey]){
        nextTowers[blockKey]={...nextTowers[blockKey],hp:nextTowers[blockKey].hp-1}
        if(nextTowers[blockKey].hp<=0) delete nextTowers[blockKey]
      }else e.col=nextCol
      if(e.col<0){ nextBase-=1; return null }
      return e
    }).filter(Boolean)
    setEnemies(next); setTowers(nextTowers); setBase(nextBase); setFish(f=>Math.min(12,f+gained))
    if(nextBase<=0) { setStatus('failed'); setHint('路线失守了，不过猫咪会重新调整阵地。') }
    else if(next.length===0) { setStatus('won'); setWave(2); setHint('撤离路线已安全，点点顺利通过！') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tick])
  const progress=useMemo(()=>Math.round((1-enemies.length/initialEnemies.length)*100),[enemies.length])
  return <div className="defense-screen">
    <div className="td-topbar">
        <div><small>救援行动 01</small><b>点亮撤离路线</b></div>
      <div className="wave-meter"><span style={{width:`${progress}%`}}/><b>波次 {wave}/1</b></div>
      <div className="base-life">花房路线 {Array.from({length:3},(_,i)=><i key={i} className={i<base?'alive':''}>♥</i>)}</div>
    </div>
    <div className="td-stage">
      <div className="rescue-lane"><PixelCat breed="tuanzi" size={92}/><span>团子正在引路</span></div>
      <div className="grid-wrap">
        <div className="grid-labels"><span>灯光安全区</span><b>← 黑影幽灵从暗处靠近</b></div>
        <div className="td-grid">
          {Array.from({length:rows*cols},(_,i)=>{const r=Math.floor(i/cols),c=i%cols,key=`${r}-${c}`,tower=towers[key]
            return <button key={key} className={`cell row-${r}`} onClick={()=>place(r,c)} aria-label={`第${r+1}行第${c+1}列`}>
              <span className="tile-grain"/>
              {tower&&<motion.div initial={{scale:0}} animate={{scale:1}} className={`tower tower-${tower.type}`}>
                {tower.type==='can'?<><i/><b>✦</b></>:<><i/><b>{tower.hp}</b></>}
              </motion.div>}
              <AnimatePresence>{enemies.filter(e=>e.row===r&&e.col===c).map(e=><motion.div className="enemy" key={e.id} initial={{x:70,opacity:0}} animate={{x:0,opacity:1}}><ShadowGhost hp={e.hp}/></motion.div>)}</AnimatePresence>
            </button>})}
        </div>
        <div className="shadow-edge"/>
      </div>
      <div className="evac-card"><PixelCat breed="diandian" size={82} mood="worried"/><div><small>护送目标</small><b>点点</b><span>正在撤离…</span></div></div>
    </div>
    <div className="tower-dock">
      <div className="resource-pill">◆ <b>{fish}</b><small>鱼干</small></div>
      <button onClick={()=>setSelected('can')} className={selected==='can'?'selected':''}><span className="mini-can">✦</span><b>星光罐头</b><small>发射光点驱散黑影</small><i>◆ 3</i></button>
      <button onClick={()=>setSelected('box')} className={selected==='box'?'selected':''}><span className="mini-box">↑</span><b>纸箱路障</b><small>阻挡黑影前进</small><i>◆ 2</i></button>
      <div className="td-hint">🐾 {hint}</div>
      {status==='won'&&<button className="finish-btn" onClick={onComplete}>查看新线索 →</button>}
      {status==='failed'&&<button className="finish-btn" onClick={()=>{setEnemies(initialEnemies);setTowers({});setBase(3);setFish(9);setStatus('playing');setTick(0)}}>重新布防</button>}
    </div>
  </div>
}
