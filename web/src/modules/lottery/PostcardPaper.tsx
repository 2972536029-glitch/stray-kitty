import PostcardCanvas,{type StrokePoint} from './PostcardCanvas';
import PostalMark from './PostalMark';
import QueuedImage from './QueuedImage';

function Postcode({sender=false}:{sender?:boolean}){
  return <div className={`postal-postcode ${sender?'sender':''}`} aria-label={sender?'寄件人邮政编码':'收件人邮政编码'}><span className="postal-postcode-boxes">{Array.from({length:6},(_,i)=><i key={i}/>)}</span><small>{sender?'寄件人邮编':'邮政编码'}</small></div>;
}

export default function PostcardPaper({count,stroke,onChange,onComplete,drawing,sending}:{count:number;stroke:StrokePoint[];onChange:(points:StrokePoint[])=>void;onComplete:()=>void;drawing:boolean;sending:boolean}){
  return <div className="postal-postcard" aria-hidden={!drawing&&!sending}>
    <span className="postal-postcard-art" aria-hidden="true"><QueuedImage url="/assets/lottery/postal-postcard-illustrated-v2.png" alt="" hideUntilReady/></span>
    <Postcode/>
    <div className="postal-card-letterhead" aria-hidden="true"><span>明 信 片</span><small>POST CARD · 猫爪邮局</small></div>
    <span className="postal-card-divider" aria-hidden="true"/>
    <div className="postal-postage" aria-label="猫爪邮政纪念邮票"><small>猫 爪 邮 政</small><PostalMark/><span>PAW POST</span><b>1</b></div>
    <div className="postal-postmark" aria-hidden="true"><span>猫爪邮局</span><PostalMark/><small>花房 · 寄出留念</small></div>
    <div className="postal-address"><small>收件人地址 / TO</small><p>猫国 · 玻璃花房</p><p>喵喵和伙伴们 <span>收</span></p><p className="postal-sender-line">猫爪邮局 <span>寄</span></p></div>
    <div className="postal-card-sender"><span>猫爪邮局 · 花房投递所</span><Postcode sender/></div>
    <p className="postal-card-caption">一笔心意，随 {count} 份包裹寄回家。</p>
    <div className="postal-writing"><PostcardCanvas stroke={stroke} onChange={onChange} onComplete={onComplete} disabled={!drawing}/>{!stroke.length&&drawing&&<div className="postal-writing-hint"><span>按住，画下随心的一笔</span><small>整张明信片都可以画 · 松开即寄出</small></div>}</div>
    {sending&&<div className="postal-sent-stamp" aria-hidden="true">已寄出<PostalMark/></div>}
  </div>;
}
