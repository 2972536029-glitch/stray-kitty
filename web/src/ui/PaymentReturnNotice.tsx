import {useEffect,useState} from 'react';
import type {RechargePack} from '../contracts';
import type {GameApiPort} from '../core/ports';
import {returnedPayment,type PaymentReturn} from '../app/paymentReturn';
import RewardNotice from './RewardNotice';

// Read-only delivery tracking survives the full-page checkout and panel closure.
export default function PaymentReturnNotice({saved,packs,api,onCharged,onClose}:{saved:PaymentReturn;packs:RechargePack[];api:GameApiPort;onCharged:()=>Promise<void>;onClose:()=>void}) {
  const [credited,setCredited]=useState(false);
  useEffect(()=>{
    let cancelled=false,checking=false,delivered=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      if(cancelled||checking||delivered)return;
      checking=true;clearTimeout(timer);
      try {
        const history=await api.paymentHistory(saved.playerId);
        if(cancelled)return;
        if(returnedPayment(saved,history.txns??[])) {
          await onCharged();
          if(!cancelled){delivered=true;setCredited(true);}
          return;
        }
      }catch{/* Recheck on focus and keep waiting for server delivery. */}
      finally{checking=false;if(!cancelled&&!delivered)timer=setTimeout(()=>void poll(),Date.now()-saved.startedAt<300000?3000:30000);}
    };
    const wake=()=>{if(!document.hidden)void poll();};
    void poll();window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
    return()=>{cancelled=true;clearTimeout(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};
  },[saved,api,onCharged]);
  const pack=packs.find(pack=>pack.id===saved.packId);
  return credited&&pack?<RewardNotice receipt={{title:'充值到账啦',items:[{currency:'tuna',amount:pack.tunaGranted}]}} onClose={onClose}/>:null;
}
