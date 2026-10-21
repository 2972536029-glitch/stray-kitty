import { useState } from 'react'
import { motion } from 'framer-motion'
import XsollaMark from '../brand/XsollaMark'

export const storeItems = [
  {id:'blue_bowl',icon:'●',name:'蓝色饭碗',type:'家的回忆',price:1,color:'blue'},
  {id:'red_cushion',icon:'♥',name:'蝴蝶结软垫',type:'花房家具',price:2,color:'red'},
  {id:'sun_lamp',icon:'☀',name:'小太阳灯',type:'安全照明',price:2,color:'yellow'},
  {id:'box_castle',icon:'⌂',name:'纸箱小城堡',type:'点点最爱',price:3,color:'box'},
]

export default function StoreModal({ stamps, owned, onBuy, onClose }) {
  const [notice,setNotice]=useState('家具不会影响通关，只为猫咪们把花房变成家。')
  const buy=(item)=>{
    if(owned.includes(item.id)) return
    if(stamps<item.price){ setNotice('猫爪邮票不够啦！完成救援可以获得更多。'); return }
    onBuy(item); setNotice(`购买成功！「${item.name}」已送往废弃花房。`)
  }
  return <div className="shop-overlay" onClick={onClose}>
    <motion.section className="cat-shop" initial={{scale:.86,y:25}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()}>
      <header><XsollaMark compact/><div><small>SANDBOX WEB SHOP</small><h2>猫国神秘包裹</h2></div><div className="shop-wallet">✦ <b>{stamps}</b><small>猫爪邮票</small></div><button onClick={onClose}>×</button></header>
      <div className="shop-banner"><span>NEW</span><div><b>花房开张纪念</b><small>每一件家具，都是“这里可以安心睡觉”的证明。</small></div><i>🐾</i></div>
      <div className="shop-grid">{storeItems.map(item=>{
        const has=owned.includes(item.id)
        return <article key={item.id} className={`shop-item ${item.color} ${has?'owned':''}`}>
          <div className="item-art"><span>{item.icon}</span><i>✦</i></div><small>{item.type}</small><h3>{item.name}</h3>
          <button disabled={has} onClick={()=>buy(item)}>{has?'已送达花房':<>✦ {item.price}　购买</>}</button>
        </article>
      })}</div>
      <div className="shop-notice"><span>i</span>{notice}</div>
      <footer><span>模拟商店 · 不产生真实支付</span><XsollaMark compact/></footer>
    </motion.section>
  </div>
}
