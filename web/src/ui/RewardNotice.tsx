import {useEffect, useRef} from 'react';
import PostalCurrencyIcon from '../modules/lottery/PostalCurrencyIcon';
import './reward-notice.css';

export interface RewardReceipt {
  title: string;
  subtitle?: string;
  items: {currency:'stamp'|'tuna'; amount:number}[];
}

export default function RewardNotice({receipt,onClose}:{receipt:RewardReceipt;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current!;
    dialog.showModal();
    return()=>{dialog.close();previous?.focus();};
  },[]);
  return <dialog ref={ref} className="reward-notice" aria-label={receipt.title} onClick={event=>{event.stopPropagation();onClose();}} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onClose();}}}>
    <span className="reward-notice-star" aria-hidden="true">✦</span>
    <h2>{receipt.title}</h2>
    {receipt.subtitle&&<p>{receipt.subtitle}</p>}
    <div className="reward-notice-items">{receipt.items.filter(item=>item.amount>0).map(item=><div key={item.currency}><PostalCurrencyIcon currency={item.currency}/><span>{item.currency==='stamp'?'猫爪邮票':'金枪鱼罐头'}</span><b>+{item.amount}</b></div>)}</div>
    <button type="button" className="reward-notice-dismiss" autoFocus>点击任意位置关闭</button>
  </dialog>;
}
