import PostcardCanvas,{type StrokePoint} from './PostcardCanvas';
import PostalMark from './PostalMark';

export default function PostcardPaper({count,stroke,onChange,onComplete,drawing,sending}:{count:number;stroke:StrokePoint[];onChange:(points:StrokePoint[])=>void;onComplete:()=>void;drawing:boolean;sending:boolean}){
  return <div className="postal-postcard" aria-hidden={!drawing&&!sending}>
    <span className="postal-card-border" aria-hidden="true"/><span className="postal-card-clip" aria-hidden="true"/>
    <div className="postal-address"><small>PAW POST / CORRESPONDENCE</small><span>致：我们的小小的家</span></div>
    <div className="postal-card-letterhead" aria-hidden="true"><span>把小小心意，寄回家</span><small>HAND-DRAWN POSTCARD · No. {String(count).padStart(2,'0')}</small></div>
    <div className="postal-postage" aria-hidden="true"><small>猫 爪 邮 政</small><PostalMark/><span>HOME · 01</span></div>
    <div className="postal-postmark" aria-hidden="true">PAW POST<br/>WITH LOVE</div>
    <aside className="postal-card-note" aria-hidden="true">
      <span className="postal-note-label">A LETTER FOR YOU</span><h4>给家的<br/>一点心意</h4><p>把今天的小小期待，<br/>留在这一张纸上。<br/>一笔，也是一封信。</p>
      <svg className="postal-letter-sketch" viewBox="0 0 150 132" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="m22 65 51-31 52 31v45H22Z" fill="#f2e4cb"/><path d="M34 80V20h77v60L73 101Z" fill="#fff7e8"/><path d="M44 32h34m-34 9h51m-51 9h40m-40 9h52" opacity=".45"/><path d="m22 66 51 35 52-35m-103 44 39-28m64 28L86 82"/><path d="M89 25c-7-9-15 2-5 8l8 5 6-9c5-9-7-14-9-4Z" fill="#c17b6740" stroke="#b36e59"/><path d="m18 114-9-12m1 19 14-4m106-8 8-12m-3 22 10 3M4 62l9 1m-5-7 1 12" opacity=".6"/></svg>
      <span className="postal-note-signature">猫爪邮局 敬寄</span><small>ONE LINE, A LITTLE LOVE.</small>
    </aside>
    <div className="postal-writing"><span className="postal-writing-label" aria-hidden="true">留 一 点 你 的 笔 迹 <small>YOUR LITTLE NOTE</small></span><PostcardCanvas stroke={stroke} onChange={onChange} onComplete={onComplete} disabled={!drawing}/>{!stroke.length&&drawing&&<div className="postal-writing-hint"><span>按住，画下随心的一笔</span><small>画完松开，包裹就会寄来</small><i aria-hidden="true">✧</i></div>}</div>
    <div className="postal-card-colophon" aria-hidden="true"><PostalMark/><span>来自猫爪邮局<small>DELIVERED WITH CARE</small></span></div><p className="postal-card-caption">随手留下一笔，余下的交给惊喜。</p>
    {sending&&<div className="postal-sent-stamp" aria-hidden="true">已寄出<PostalMark/></div>}
  </div>;
}
