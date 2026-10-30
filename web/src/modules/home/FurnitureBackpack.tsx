import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Catalog,GameCommand,GameState} from '../../contracts';
import Modal from '../../ui/Modal';
import {HOME_FRAMES,loadHomeArtwork,type HomeArtwork} from './assets';
import {HOME_SIZE,homeStage} from './layout';
import {homeInventory,type HomeItem} from './objects';
import {drawHomeSprite,paintHomestead,paintHomeObject} from './painter';
import {homeHit,homeLayoutChanges,validHomePosition,type HomeDraft} from './editor';
import './backpack.css';

interface Props {state:GameState;catalog:Catalog;busy:boolean;pending:boolean;error:string;initialFurniture?:string;onSave:(c:GameCommand)=>Promise<boolean>;onRetry:()=>void;onClose:()=>void}
type Drag={key:string;pointer:number;start:{x:number;y:number};offset:{x:number;y:number};point?:{x:number;y:number};moved:boolean;inside:boolean};
function Thumbnail({item,art}:{item:HomeItem;art?:HomeArtwork}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,128,96);if(!art)return;const f=HOME_FRAMES[item.sprite],w=Math.min(112,80*f.width/f.height);drawHomeSprite(ctx,art,item.sprite,64,88,w);},[item.sprite,art]);
  return <canvas ref={ref} width={128} height={96} aria-hidden="true"/>;
}
export default function FurnitureBackpack({state,catalog,busy,pending,error,initialFurniture,onSave,onRetry,onClose}:Props){
  const [base,setBase]=useState(()=>structuredClone(state));
  const [draft,setDraft]=useState<HomeDraft>(()=>structuredClone(state.homeLayout??{}));
  const [undo,setUndo]=useState<HomeDraft[]>([]),[redo,setRedo]=useState<HomeDraft[]>([]);
  const [selection,setSelection]=useState(initialFurniture?'furniture:'+initialFurniture:'');
  const [filter,setFilter]=useState('bag'),[query,setQuery]=useState('');
  const [bagOpen,setBagOpen]=useState(true);
  const [art,setArt]=useState<HomeArtwork>(),[artError,setArtError]=useState('');
  const [drag,setDragState]=useState<Drag|null>(null),dragRef=useRef<Drag|null>(null);
  const setDrag=(value:Drag|null)=>{dragRef.current=value;setDragState(value);};
  const [size,setSize]=useState({w:1000,h:680}),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
  const panDrag=useRef<{pointer:number;x:number;y:number;origin:{x:number;y:number}}|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),bag=useRef<HTMLElement>(null);
  const sent=useRef(false),[notice,setNotice]=useState('');
  const draftState=useMemo(()=>({...base,homeLayout:draft}),[base,draft]);
  const items=useMemo(()=>homeInventory(draftState).map(item=>({...item,name:item.furnitureId?catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name:item.name})),[draftState,catalog]);
  const selected=items.find(item=>item.layoutKey===selection);
  const changes=homeLayoutChanges(base,draftState),locked=busy||pending;
  const conflict=state.revision!==base.revision&&!sent.current;
  const scale=Math.min(size.w/HOME_SIZE.width,size.h/HOME_SIZE.height)*zoom;
  const view={scale,x:(size.w-HOME_SIZE.width*scale)/2+pan.x,y:(size.h-HOME_SIZE.height*scale)/2+pan.y};
  const viewRef=useRef(view);viewRef.current=view;
  const local=(clientX:number,clientY:number)=>{const c=canvas.current!,rect=c.getBoundingClientRect(),v=viewRef.current;return{x:Math.round(((clientX-rect.left)*c.clientWidth/rect.width-v.x)/v.scale),y:Math.round(((clientY-rect.top)*c.clientHeight/rect.height-v.y)/v.scale),inside:clientX>=rect.left&&clientX<=rect.right&&clientY>=rect.top&&clientY<=rect.bottom};};
  const commit=(key:string,x:number,y:number,stored:boolean)=>{
    const item=items.find(i=>i.layoutKey===key);if(!item||locked||conflict)return;
    if(!stored&&!validHomePosition(item,x,y)){setNotice('请放在花房范围内；挂饰可以布置在墙面。');return;}
    if(item.x===x&&item.y===y&&item.stored===stored)return;
    setUndo(history=>[...history.slice(-39),draft]);setRedo([]);
    setDraft({...draft,[key]:{x,y,stored}});setNotice(stored?'已收进背包，保存后生效。':'位置已调整，保存后伙伴会到新位置互动。');
  };
  const stepUndo=()=>{if(locked||!undo.length)return;setRedo(history=>[...history,draft]);setDraft(undo.at(-1)!);setUndo(undo.slice(0,-1));setDrag(null);setNotice('已撤销上一步。');};
  const stepRedo=()=>{if(locked||!redo.length)return;setUndo(history=>[...history,draft]);setDraft(redo.at(-1)!);setRedo(redo.slice(0,-1));setDrag(null);setNotice('已重做上一步。');};
  const cancel=()=>{if(locked)return;if(dragRef.current){setDrag(null);setNotice('已取消这次拖动。');return;}onClose();};
  const save=async()=>{if(locked||conflict||!changes.length||dragRef.current)return;sent.current=true;const ok=await onSave({type:'SAVE_HOME_LAYOUT',changes});if(ok)onClose();else{sent.current=false;setNotice('布置草稿已保留，请根据提示重试。');}};
  useEffect(()=>{let active=true;void loadHomeArtwork().then(value=>{if(active)setArt(value);}).catch(e=>{if(active)setArtError(String(e.message));});return()=>{active=false;};},[]);
  useEffect(()=>{const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({w:Math.max(1,Math.round(width)),h:Math.max(1,Math.round(height))});});observer.observe(stage.current!);return()=>observer.disconnect();},[]);
  // An idempotent Retry may finish after the original Save response was lost.
  useEffect(()=>{if(pending||busy||state.revision===base.revision||!changes.length)return;if(changes.every(c=>{const p=state.homeLayout?.[c.key];return p&&p.x===c.x&&p.y===c.y&&p.stored===c.stored;}))onClose();},[state,pending,busy]);
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      if(panDrag.current?.pointer===event.pointerId){const d=panDrag.current,v=viewRef.current,maxX=Math.max(0,(HOME_SIZE.width*v.scale-size.w)/2),maxY=Math.max(0,(HOME_SIZE.height*v.scale-size.h)/2);setPan({x:Math.max(-maxX,Math.min(maxX,d.origin.x+event.clientX-d.x)),y:Math.max(-maxY,Math.min(maxY,d.origin.y+event.clientY-d.y))});return;}
      const d=dragRef.current;if(!d||event.pointerId!==d.pointer)return;
      const point=local(event.clientX,event.clientY);setDrag({...d,moved:d.moved||Math.hypot(event.clientX-d.start.x,event.clientY-d.start.y)>4,inside:point.inside,point:{x:point.x+d.offset.x,y:point.y+d.offset.y}});
    };
    const up=(event:PointerEvent)=>{
      if(panDrag.current?.pointer===event.pointerId){panDrag.current=null;return;}
      const d=dragRef.current;if(!d||event.pointerId!==d.pointer)return;
      const point=local(event.clientX,event.clientY);setDrag(null);
      if(!d.moved)return;
      if(point.inside)commit(d.key,point.x+d.offset.x,point.y+d.offset.y,false);
      else{const rect=bag.current!.getBoundingClientRect();const item=items.find(i=>i.layoutKey===d.key);if(item&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom)commit(d.key,item.x,item.y,true);else setNotice('落点在场景外，已取消这次拖动。');}
    };
    const cancelled=()=>{setDrag(null);panDrag.current=null;};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelled);window.addEventListener('blur',cancelled);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelled);window.removeEventListener('blur',cancelled);};
  },[items,draft,locked,conflict,size]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement).closest('input,select,textarea')||locked)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)stepRedo();else stepUndo();return;}
      if(event.key==='Escape'&&dragRef.current){event.preventDefault();event.stopPropagation();setDrag(null);return;}
      if(!selected)return;
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();commit(selected.layoutKey,selected.x,selected.y,true);}
      const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(arrows[event.key]&&!selected.stored){event.preventDefault();const [x,y]=arrows[event.key],step=event.shiftKey?16:4;commit(selected.layoutKey,selected.x+x*step,selected.y+y*step,false);}
    };
    window.addEventListener('keydown',keyboard,true);return()=>window.removeEventListener('keydown',keyboard,true);
  },[selected,draft,undo,redo,locked]);
  const preview=drag?.moved&&drag.inside&&drag.point?{...draftState,homeLayout:{...draft,[drag.key]:{...drag.point,stored:false}}}:draftState;
  const valid=!drag?.point||!selected||validHomePosition(selected,drag.point.x,drag.point.y);
  useEffect(()=>{
    const c=canvas.current!,dpr=Math.min(2,window.devicePixelRatio||1);c.width=size.w*dpr;c.height=size.h*dpr;
    const ctx=c.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#192a28';ctx.fillRect(0,0,size.w,size.h);
    ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);paintHomestead(ctx,preview,art);
    const current=homeInventory(preview).find(i=>i.layoutKey===selection&&!i.stored);
    if(current){const f=HOME_FRAMES[current.sprite],h=current.width*f.height/f.width;ctx.strokeStyle=valid?'#ffe19a':'#ff8377';ctx.lineWidth=2/view.scale;ctx.setLineDash([7/view.scale,4/view.scale]);ctx.strokeRect(current.x-current.width/2-5,current.y-h-5,current.width+10,h+10);ctx.setLineDash([]);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(current.x,current.y,4/view.scale,0,Math.PI*2);ctx.fill();
      if(drag?.moved&&drag.inside){ctx.globalAlpha=.35;paintHomeObject(ctx,current,art);ctx.globalAlpha=1;}}
    c.dataset.editorView=JSON.stringify(view);c.dataset.editorItems=JSON.stringify(homeInventory(preview));
  },[preview,selection,art,size,zoom,pan,valid]);
  const begin=(event:ReactPointerEvent,item:HomeItem,fromBag:boolean)=>{
    if(locked||conflict||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);setSelection(item.layoutKey);
    const p=local(event.clientX,event.clientY);setDrag({key:item.layoutKey,pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},offset:fromBag?{x:0,y:0}:{x:item.x-p.x,y:item.y-p.y},moved:false,inside:!fromBag});
  };
  const shown=items.filter(item=>(filter==='all'||(filter==='bag'?item.stored:!item.stored))&&item.name.includes(query));
  return <Modal title="家具背包 · 布置模式" onClose={cancel} className="furniture-backpack">
    <header className="backpack-header"><div><span>OUR LITTLE GREENHOUSE / {homeStage(base)}</span><h2>家具背包 <small>布置模式</small></h2></div><div className="backpack-save"><button disabled={locked} onClick={()=>{setDrag(null);if(!locked)onClose();}}>取消布置</button><button className="backpack-primary" disabled={locked||conflict||!changes.length||!!drag} onClick={()=>void save()}>{busy?'正在保存…':`保存布置${changes.length?' · '+changes.length:''}`}</button></div></header>
    <div className="backpack-body"><section ref={bag} className={`backpack-bag${drag?' accepting':''}${bagOpen?'':' folded'}`} aria-label="家具背包">
      <div className="backpack-bag-head"><button className="backpack-bag-toggle" aria-expanded={bagOpen} aria-controls="backpack-items" onClick={()=>setBagOpen(value=>!value)}>{bagOpen?'▼ 收起背包':'▲ 展开背包'}</button><b>把喜欢的角落搬进家</b><p>往上拖入花房 · 拖回来收起</p><input aria-label="搜索家具" placeholder="找一件家具…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="backpack-tabs" role="tablist" aria-label="家具筛选">{[['bag','背包'],['scene','场景'],['all','全部']].map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} onClick={()=>setFilter(id)}>{label} {items.filter(i=>id==='all'||(id==='bag'?i.stored:!i.stored)).length}</button>)}</div>
      <div className="backpack-grid" id="backpack-items" hidden={!bagOpen} onWheel={e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX))e.currentTarget.scrollLeft+=e.deltaY;}}>{shown.map(item=><button key={item.layoutKey} className={`backpack-item${selection===item.layoutKey?' selected':''}`} data-layout-key={item.layoutKey} aria-label={`选择${item.name}`} aria-pressed={selection===item.layoutKey} disabled={locked||conflict} onPointerDown={e=>begin(e,item,true)} onClick={()=>setSelection(item.layoutKey)}><Thumbnail item={item} art={art}/><b>{item.name}</b><small>{item.stored?'在背包里':'已摆放'} · {item.furnitureId?'收藏家具':'阶段家具'}</small></button>)}{!shown.length&&<p className="backpack-empty">{query?'没有找到这件家具。':'家具都在场景里啦。点击场景中的家具，就能移动或收回。'}</p>}</div>
    </section><div className="backpack-scene-column"><div className="backpack-toolbar"><div><button aria-label="撤销" disabled={locked||!undo.length} onClick={stepUndo}>↶ 撤销</button><button aria-label="重做" disabled={locked||!redo.length} onClick={stepRedo}>↷ 重做</button><button disabled={!drag} onClick={()=>{setDrag(null);setNotice('已取消这次拖动。');}}>取消本次移动</button></div><div><button aria-label="缩小场景" onClick={()=>{setZoom(z=>Math.max(1,z-.25));setPan({x:0,y:0});}}>−</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>{Math.round(zoom*100)}%</button><button aria-label="放大场景" onClick={()=>setZoom(z=>Math.min(2.5,z+.25))}>＋</button></div></div>
      <div className="backpack-scene" ref={stage}><canvas ref={canvas} aria-label="花房家具布置场景" data-artwork={art?'ready':'loading'} onPointerDown={e=>{if(locked||conflict)return;const point=local(e.clientX,e.clientY),item=homeHit(items,point.x,point.y);if(item){begin(e,item,false);return;}if(selected?.stored){commit(selected.layoutKey,point.x,point.y,false);return;}setSelection('');e.currentTarget.setPointerCapture(e.pointerId);panDrag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,origin:pan};}}/></div>
      <footer className="backpack-selection">{selected?<><div><b>{selected.name}</b><small>宽约 {Math.round(selected.width/1.7)} 厘米 · {selected.stored?'从背包拖入，或点场景放下':'拖动移动 · 方向键微调 · Delete 收回'}{selected.wall?' · 墙面挂饰':''}</small></div><button disabled={locked||conflict} onClick={()=>commit(selected.layoutKey,selected.stored?820:selected.x,selected.stored?(selected.wall?310:540):selected.y,!selected.stored)}>{selected.stored?'放到场景中央':'收回背包'}</button></>:<p>选中家具后拖动；点空白处拖动画面，使用 ＋ / − 查看细节。</p>}</footer>
    </div></div>
    <div className="backpack-status" role="status">{artError||(!art?'正在加载花房素材…':notice||'所有改动在保存后生效；取消布置会恢复进入前的样子。')}</div>
    {error&&<div className="backpack-error" role="alert">{error} <button disabled={busy} onClick={onRetry}>重试上次保存</button></div>}
    {pending&&!busy&&<p className="backpack-error">保存结果待确认，请重试上次保存。</p>}
    {conflict&&!pending&&<div className="backpack-error">进度已在另一处更新。<button onClick={()=>{setBase(structuredClone(state));setDraft(structuredClone(state.homeLayout??{}));setUndo([]);setRedo([]);setDrag(null);}}>载入最新布置</button></div>}
  </Modal>;
}
