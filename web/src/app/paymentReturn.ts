import type {PaymentTxn} from '../contracts';

const KEY='stray-kitty.payment-return.v1';
export interface PaymentReturn {
  playerId:string; packId:string; startedAt:number; knownTxnIds:string[];
  overlay:'home'|'recharge'; homeTab:'recharge'; parcelPool?:string; fromParcels:boolean;
}
export function readPaymentReturn():PaymentReturn|null {
  try {
    const saved=JSON.parse(sessionStorage.getItem(KEY)??'null') as PaymentReturn|null;
    if(!saved||typeof saved.playerId!=='string'||typeof saved.packId!=='string'||!Number.isFinite(saved.startedAt)||!Array.isArray(saved.knownTxnIds)||!saved.knownTxnIds.every(id=>typeof id==='string')||!['home','recharge'].includes(saved.overlay))return null;
    return saved;
  }catch{return null;}
}
export function savePaymentReturn(saved:PaymentReturn){sessionStorage.setItem(KEY,JSON.stringify(saved));}
export function clearPaymentReturn(){try{sessionStorage.removeItem(KEY);}catch{/* The receipt can still close in memory. */}}
export function returnedPayment(saved:PaymentReturn,txns:PaymentTxn[]) {
  // The channel transaction ID differs from the token's ID. Compare against the
  // authoritative history read immediately before checkout, never a recent-time guess.
  return txns.find(txn=>txn.playerId===saved.playerId&&txn.packId===saved.packId&&txn.status==='confirmed'&&txn.id.startsWith('xs-')&&!saved.knownTxnIds.includes(txn.id));
}

export function clearPaymentReturnParameter(){
  const clean=(target:Window)=>{const url=new URL(target.location.href);if(url.searchParams.get('payment')==='return'){url.searchParams.delete('payment');target.history.replaceState(null,'',url);}};
  clean(window);
  // Clean our mobile host, without reading an unrelated cross-origin top page
  // when the game itself is embedded by another site.
  try{if(window.parent!==window&&window.parent.location.origin===window.location.origin)clean(window.parent);}catch{/* Cross-origin hosts own their URL. */}
}
