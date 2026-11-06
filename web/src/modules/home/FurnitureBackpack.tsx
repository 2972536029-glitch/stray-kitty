import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Catalog,GameCommand,GameState,HomePlacement,HomeSurfaces} from '../../contracts';
import type {DemoScene} from '../../examples/demo/scene';
import {HOME_FRAMES,loadHomeArtwork,type HomeArtwork} from './assets';
import SurfacePreview from './SurfacePreview';
import {HOME_SURFACES,homeSurfaceSelection,ownsHomeSurface} from './surfaces';
import {homeInventory,type HomeItem} from './objects';
import {drawHomeSprite} from './painter';
import {homeHit,homeLayoutChanges,validHomePosition,type HomeDraft} from './editor';
import {FURNITURE_CATEGORIES,type FurnitureCategory} from './furnishings';
import './backpack.css';

interface Props {scene:DemoScene;state:GameState;catalog:Catalog;busy:boolean;pending:boolean;error:string;initialFurniture?:string;onSave:(c:GameCommand)=>Promise<boolean>;onRetry:()=>void;onClose:()=>void}
type Snapshot={layout:HomeDraft;surfaces:HomeSurfaces};
type Drag={key:string;pointer:number;start:{x:number;y:number};offset:{x:number;y:number};point?:{x:number;y:number};moved:boolean;inside:boolean};
function Thumbnail({item,art}:{item:HomeItem;art?:HomeArtwork}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current!.getContext('2d')!;ctx.clearRect(0,0,128,96);if(!art)return;const f=HOME_FRAMES[item.sprite],w=Math.min(112,80*f.width/f.height);drawHomeSprite(ctx,art,item.sprite,64,88,w);},[item.sprite,art]);
  return <canvas ref={ref} width={128} height={96} aria-hidden="true"/>;
}
export default function FurnitureBackpack({scene,state,catalog,busy,pending,error,initialFurniture,onSave,onRetry,onClose}:Props){
  const [base,setBase]=useState(()=>structuredClone(state));
  const [draft,setDraft]=useState<HomeDraft>(()=>structuredClone(state.homeLayout??{}));
  const [undo,setUndo]=useState<Snapshot[]>([]),[redo,setRedo]=useState<Snapshot[]>([]);
  const initialSurface=HOME_SURFACES.find(item=>'surface:'+item.id===initialFurniture);
  const [finishDraft,setFinishDraft]=useState(()=>homeSurfaceSelection(state));
  const [kind,setKind]=useState<'furniture'|'wallpaper'|'floor'>(initialSurface?.kind??'furniture'),[surfaceSelection,setSurfaceSelection]=useState(initialSurface?.id??'');
  const [selection,setSelection]=useState(initialSurface?'':initialFurniture?(initialFurniture.startsWith('stage:')?initialFurniture:'furniture:'+initialFurniture):'');
  const [category,setCategory]=useState<FurnitureCategory|'all'>('all');
  const [bagOpen,setBagOpen]=useState(true);
  const [art,setArt]=useState<HomeArtwork>(),[artError,setArtError]=useState('');
  const [drag,setDragState]=useState<Drag|null>(null),dragRef=useRef<Drag|null>(null);
  const setDrag=(value:Drag|null)=>{dragRef.current=value;setDragState(value);};
  const [zoom,setZoom]=useState(scene.homeZoomLevel);
  const panDrag=useRef<{pointer:number;x:number;y:number;startX:number;startY:number;moved:boolean;placeKey?:string}|null>(null);
  const bag=useRef<HTMLElement>(null),contextActions=useRef<HTMLDivElement>(null),contextName=useRef<HTMLDivElement>(null);
  const sent=useRef(false),[notice,setNotice]=useState('');
  const draftState=useMemo(()=>({...base,homeLayout:draft,homeSurfaces:finishDraft}),[base,draft,finishDraft]);
  const items=useMemo(()=>homeInventory(draftState).map(item=>({...item,name:item.furnitureId?catalog.furniture.find(f=>f.id===item.furnitureId)?.name??item.name:item.name})),[draftState,catalog]);
  const sheetKey=[...new Set(items.map(item=>HOME_FRAMES[item.sprite].sheet))].sort().join('|');
  const selected=items.find(item=>item.layoutKey===selection);
  const selectionStart=useRef<{key:string;placement:HomePlacement}|null>(null);
  const selectItem=(item?:HomeItem)=>{
    if(item&&selectionStart.current?.key!==item.layoutKey)selectionStart.current={key:item.layoutKey,placement:{x:item.x,y:item.y,stored:item.stored}};
    if(!item)selectionStart.current=null;
    setSelection(item?.layoutKey??'');
  };
  // A collection entry can open the editor with a furniture item already selected.
  useEffect(()=>{if(selected&&selectionStart.current?.key!==selected.layoutKey)selectionStart.current={key:selected.layoutKey,placement:{x:selected.x,y:selected.y,stored:selected.stored}};},[selected]);
  const changes=homeLayoutChanges(base,draftState),locked=busy||pending;
  const baseSurfaces=homeSurfaceSelection(base),surfaceDirty=finishDraft.wallpaper!==baseSurfaces.wallpaper||finishDraft.floor!==baseSurfaces.floor;
  const dirty=!!changes.length||surfaceDirty;
  const snapshot=():Snapshot=>({layout:draft,surfaces:finishDraft});
  const conflict=state.revision!==base.revision&&!sent.current;
  const local=(x:number,y:number)=>scene.homeClientToWorld(x,y);
  const commit=(key:string,x:number,y:number,stored:boolean)=>{
    const item=items.find(i=>i.layoutKey===key);if(!item||locked||conflict)return;
    if(!stored&&!validHomePosition(item,x,y)){setNotice('请放在花房范围内；挂饰可以布置在墙面。');return;}
    if(item.x===x&&item.y===y&&item.stored===stored)return;
    setUndo(history=>[...history.slice(-39),snapshot()]);setRedo([]);
    setDraft({...draft,[key]:{x,y,stored}});setNotice(stored?'已收进背包，保存后生效。':'位置已调整，保存后伙伴会到新位置互动。');
  };
  const cancelSelection=()=>{if(locked||conflict)return;const start=selectionStart.current;if(start){const {x,y,stored}=start.placement;commit(start.key,x,y,stored);}setDrag(null);selectItem();setNotice('已取消这件家具的调整。');};
  const confirmSelection=()=>{if(locked||conflict)return;selectItem();setNotice('已确定家具位置，保存布置后生效。');};
  const collectSelection=()=>{if(!selected||locked||conflict)return;commit(selected.layoutKey,selected.x,selected.y,true);selectItem();};
  const clearFurniture=()=>{
    if(locked||conflict||!items.some(item=>!item.stored))return;
    setUndo(history=>[...history.slice(-39),snapshot()]);setRedo([]);
    const layout={...draft};for(const item of items)if(!item.stored)layout[item.layoutKey]={x:item.x,y:item.y,stored:true};
    setDraft(layout);setDrag(null);panDrag.current=null;selectItem();setNotice('场上家具已收回背包，可撤销；保存后生效。');
  };
  const applySurface=(id:string)=>{const item=HOME_SURFACES.find(item=>item.id===id);if(!item||locked||conflict||!ownsHomeSurface(base,item))return;setUndo(history=>[...history.slice(-39),snapshot()]);setRedo([]);setFinishDraft({...finishDraft,[item.kind]:id});setNotice(`${item.name}已预览，保存后生效。`);};
  const stepUndo=()=>{if(locked||conflict||!undo.length)return;setRedo(history=>[...history,snapshot()]);setDraft(undo.at(-1)!.layout);setFinishDraft(undo.at(-1)!.surfaces);setUndo(undo.slice(0,-1));setDrag(null);selectItem();setNotice('已撤销上一步。');};
  const stepRedo=()=>{if(locked||conflict||!redo.length)return;setUndo(history=>[...history,snapshot()]);setDraft(redo.at(-1)!.layout);setFinishDraft(redo.at(-1)!.surfaces);setRedo(redo.slice(0,-1));setDrag(null);selectItem();setNotice('已重做上一步。');};
  const cancel=()=>{if(locked)return;if(dragRef.current){setDrag(null);setNotice('已取消这次拖动。');return;}onClose();};
  const save=async()=>{if(locked||conflict||!dirty||dragRef.current)return;sent.current=true;const ok=await onSave({type:'SAVE_HOME_LAYOUT',changes,...(surfaceDirty?{surfaces:finishDraft}:{})});if(ok)onClose();else{sent.current=false;setNotice('布置草稿已保留，请根据提示重试。');}};
  useEffect(()=>{let active=true;setArtError('');void loadHomeArtwork(items.map(item=>item.sprite)).then(value=>{if(active)setArt(current=>({...current,...value}));}).catch(e=>{if(active)setArtError(String(e.message));});return()=>{active=false;};},[sheetKey]);
  // An idempotent Retry may finish after the original Save response was lost.
  useEffect(()=>{if(pending||busy||state.revision===base.revision||!dirty)return;if(changes.every(c=>{const p=state.homeLayout?.[c.key];return p&&p.x===c.x&&p.y===c.y&&p.stored===c.stored;})&&(!surfaceDirty||JSON.stringify(homeSurfaceSelection(state))===JSON.stringify(finishDraft)))onClose();},[state,pending,busy,finishDraft]);
  // A background revision bump (e.g. a parcel draw resolving after this dialog
  // mounted) must not lock the whole editor behind the conflict banner while
  // the player has touched nothing: rebase silently and keep editing. Drafts
  // with real changes still get the explicit conflict notice.
  useEffect(()=>{if(!conflict||pending||busy||dirty||dragRef.current)return;setBase(structuredClone(state));setDraft(structuredClone(state.homeLayout??{}));setFinishDraft(homeSurfaceSelection(state));setUndo([]);setRedo([]);selectItem();},[conflict,pending,busy,dirty,state]);
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      if(panDrag.current?.pointer===event.pointerId){scene.homeCanvas.style.cursor='grabbing';const d=panDrag.current,moved=d.moved||Math.hypot(event.clientX-d.startX,event.clientY-d.startY)>4;if(moved)scene.panHomeEditor(d,{x:event.clientX,y:event.clientY});panDrag.current={...d,x:event.clientX,y:event.clientY,moved};return;}
      const d=dragRef.current;if(!d||event.pointerId!==d.pointer)return;
      scene.homeCanvas.style.cursor='grabbing';
      const point=local(event.clientX,event.clientY);setDrag({...d,moved:d.moved||Math.hypot(event.clientX-d.start.x,event.clientY-d.start.y)>4,inside:point.inside,point:{x:point.x+d.offset.x,y:point.y+d.offset.y}});
    };
    const up=(event:PointerEvent)=>{
      if(panDrag.current?.pointer===event.pointerId){const d=panDrag.current;panDrag.current=null;scene.homeCanvas.style.cursor='';if(!d.moved&&d.placeKey){const p=local(event.clientX,event.clientY);if(p.inside)commit(d.placeKey,p.x,p.y,false);}return;}
      const d=dragRef.current;if(!d||event.pointerId!==d.pointer)return;
      scene.homeCanvas.style.cursor='';
      const point=local(event.clientX,event.clientY);setDrag(null);
      if(!d.moved)return;
      const rect=bag.current!.getBoundingClientRect(),overBag=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
      if(overBag){const item=items.find(i=>i.layoutKey===d.key);if(item)commit(d.key,item.x,item.y,true);}
      else if(point.inside)commit(d.key,point.x+d.offset.x,point.y+d.offset.y,false);
      else setNotice('落点在场景外，已取消这次拖动。');
    };
    const cancelled=()=>{setDrag(null);panDrag.current=null;scene.homeCanvas.style.cursor='';};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelled);window.addEventListener('blur',cancelled);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelled);window.removeEventListener('blur',cancelled);};
  },[items,draft,locked,conflict,scene]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();return;}
      if((event.target as HTMLElement).closest('input,select,textarea')||locked)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)stepRedo();else stepUndo();return;}
      if(!selected)return;
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();collectSelection();}
      const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(arrows[event.key]&&!selected.stored){event.preventDefault();const [x,y]=arrows[event.key],step=event.shiftKey?16:4;commit(selected.layoutKey,selected.x+x*step,selected.y+y*step,false);}
    };
    window.addEventListener('keydown',keyboard,true);return()=>window.removeEventListener('keydown',keyboard,true);
  },[selected,draft,undo,redo,locked,conflict]);
  const preview=drag?.moved&&drag.inside&&drag.point?{...draftState,homeLayout:{...draft,[drag.key]:{...drag.point,stored:false}}}:draftState;
  const valid=!drag?.point||!selected||validHomePosition(selected,drag.point.x,drag.point.y);
  useEffect(()=>{scene.setHomeEditing({state:preview,selection,valid});},[scene,preview,selection,valid]);
  useEffect(()=>()=>{scene.setHomeEditorBottom(undefined);scene.setHomeEditing(undefined);scene.homeCanvas.style.cursor='';},[scene]);
  const begin=(event:ReactPointerEvent,item:HomeItem,fromBag:boolean)=>{
    if(locked||conflict||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);selectItem(item);setKind('furniture');
    const p=local(event.clientX,event.clientY);setDrag({key:item.layoutKey,pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},offset:fromBag?{x:0,y:0}:{x:item.x-p.x,y:item.y-p.y},moved:false,inside:!fromBag});
  };
  useEffect(()=>{
    const c=scene.homeCanvas;
    const down=(e:PointerEvent)=>{
      if(locked||conflict||e.button!==0)return;
      e.preventDefault();c.setPointerCapture(e.pointerId);
      const p=local(e.clientX,e.clientY),item=homeHit(items,p.x,p.y);
      if(item){selectItem(item);setKind('furniture');setDrag({key:item.layoutKey,pointer:e.pointerId,start:{x:e.clientX,y:e.clientY},offset:{x:item.x-p.x,y:item.y-p.y},moved:false,inside:true});return;}
      if(!p.inside)return;
      if(!selected?.stored)selectItem();panDrag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,placeKey:selected?.stored?selected.layoutKey:undefined};
    };
    // 悬浮光标与高亮：命中可拖家具给 move（可抓取），空白维持 grab（拖动画面）；
    // 拖动/平移期间不参与，光标由 window 的 move/up 处理为 grabbing。
    const hover=(e:PointerEvent)=>{
      if(dragRef.current||panDrag.current)return;
      const p=local(e.clientX,e.clientY),item=p.inside?homeHit(items,p.x,p.y):undefined;
      scene.homeCanvas.style.cursor=item?'move':'grab';
      scene.setHomeHover(item?.layoutKey);
    };
    const leave=()=>{scene.homeCanvas.style.cursor='';scene.setHomeHover(undefined);};
    const wheel=()=>setZoom(scene.homeZoomLevel);
    c.addEventListener('pointerdown',down);c.addEventListener('pointermove',hover);c.addEventListener('pointerleave',leave);c.addEventListener('wheel',wheel);
    return()=>{c.removeEventListener('pointerdown',down);c.removeEventListener('pointermove',hover);c.removeEventListener('pointerleave',leave);c.removeEventListener('wheel',wheel);scene.homeCanvas.style.cursor='';};
  },[scene,items,selected,draft,locked,conflict]);
  const zoomBy=(amount:number)=>{scene.homeZoom(amount);setZoom(scene.homeZoomLevel);};
  const matching=items.filter(item=>item.stored);
  const shown=matching.filter(item=>category==='all'||item.category===category);
  const surfaces=HOME_SURFACES.filter(item=>item.kind===kind&&ownsHomeSurface(base,item)&&finishDraft[item.kind]!==item.id);
  const placeSelected=(item:HomeItem)=>{const rect=scene.homeCanvas.getBoundingClientRect(),point=local(rect.left+rect.width/2,(rect.top+(bag.current?.getBoundingClientRect().top??rect.bottom))/2);commit(item.layoutKey,Math.round(Math.max(80+item.width/2,Math.min(1592-item.width/2,point.x))),Math.round(Math.max(item.wall?150:355,Math.min(item.wall?890:728,point.y))),false);};
  useEffect(()=>{const sync=()=>scene.setHomeEditorBottom(bag.current?.getBoundingClientRect().top);const observer=new ResizeObserver(sync);if(bag.current)observer.observe(bag.current);window.addEventListener('resize',sync);sync();return()=>{observer.disconnect();window.removeEventListener('resize',sync);};},[scene]);
  useEffect(()=>{let frame=0;const position=()=>{const actions=contextActions.current,name=contextName.current;if(actions&&name&&selected&&!selected.stored){
    const sprite=HOME_FRAMES[selected.sprite],point=drag?.moved&&drag.inside&&drag.point?drag.point:selected;
    const foot=scene.homeWorldToClient(point.x,point.y),top=scene.homeWorldToClient(point.x,point.y-selected.width*sprite.height/sprite.width),limit=bag.current?.getBoundingClientRect().top??window.innerHeight;
    for(const node of [name,actions]){node.style.left=Math.max(node.offsetWidth/2+12,Math.min(window.innerWidth-node.offsetWidth/2-12,foot.x))+'px';node.hidden=foot.y<0||top.y>limit||foot.x<0||foot.x>window.innerWidth;}
    name.style.top=Math.max(8,top.y-name.offsetHeight-8)+'px';actions.style.top=Math.max(8,Math.min(limit-actions.offsetHeight-8,foot.y+10))+'px';
  }frame=requestAnimationFrame(position);};position();return()=>cancelAnimationFrame(frame);},[scene,selected,drag]);
  return <section role="region" aria-label="家具背包 · 布置模式" className="furniture-backpack">
    {selected&&!selected.stored&&<><div className="backpack-object-name" ref={contextName}>{selected.name}</div><div className="backpack-object-actions" ref={contextActions} role="group" aria-label={`${selected.name}操作`}>
      <button className="backpack-confirm" aria-label="确定家具位置" title="确定" disabled={locked||conflict||!!drag} onClick={confirmSelection}>√</button>
      <button aria-label="取消家具调整" title="取消" disabled={locked||conflict||!!drag} onClick={cancelSelection}>×</button>
      <button aria-label="收回背包" title="收回背包" disabled={locked||conflict||!!drag} onClick={collectSelection}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12v8h16v-8M4 12h4l2 3h4l2-3h4M12 3v8m-3-3 3 3 3-3"/></svg></button>
    </div></>}
    <section ref={bag} className={`backpack-dock${bagOpen?'':' folded'}`} aria-label="未摆放物品">
      <div className="backpack-controls"><button className="backpack-bag-toggle" aria-expanded={bagOpen} aria-controls="backpack-items" onClick={()=>setBagOpen(value=>!value)}>{bagOpen?'▼ 收起背包':'▲ 展开背包'}</button>
        <nav className="backpack-kind-tabs" aria-label="布置类别">{[['furniture','家具'],['wallpaper','墙纸'],['floor','地板']].map(([id,label])=><button key={id} aria-pressed={kind===id} onClick={()=>{setKind(id as typeof kind);selectItem();}}>{label}</button>)}</nav>
        <button className="backpack-clear" disabled={locked||conflict||!!drag||!items.some(item=>!item.stored)} onClick={clearFurniture}>清空场景</button>
        <div className="backpack-history"><button aria-label="撤销" disabled={locked||conflict||!undo.length} onClick={stepUndo}>↶ 撤销</button><button aria-label="重做" disabled={locked||conflict||!redo.length} onClick={stepRedo}>↷ 重做</button></div>
        <div className="backpack-zoom"><button aria-label="缩小场景" onClick={()=>zoomBy(-.25)}>−</button><button aria-label="重置缩放" onClick={()=>zoomBy(0)}>{Math.round(zoom*100)}%</button><button aria-label="放大场景" onClick={()=>zoomBy(.25)}>＋</button></div>
        <div className="backpack-save"><button disabled={locked} onClick={cancel}>取消布置</button><button className="backpack-primary" disabled={locked||conflict||!dirty||!!drag} onClick={()=>void save()}>{busy?'正在保存…':'保存布置'}</button></div>
      </div>
      {bagOpen&&<>{kind==='furniture'&&<div className="backpack-categories" role="group" aria-label="家具分类"><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>全部 {matching.length}</button>{Object.entries(FURNITURE_CATEGORIES).map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id as FurnitureCategory)}>{label} {matching.filter(item=>item.category===id).length}</button>)}</div>}
        <div className="backpack-grid" id="backpack-items" onWheel={e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX))e.currentTarget.scrollLeft+=e.deltaY;}}>{kind==='furniture'?shown.map(item=><article key={item.layoutKey} className={`backpack-card${selection===item.layoutKey?' selected':''}`} data-layout-key={item.layoutKey}><button className="backpack-item" aria-label={`选择${item.name}`} aria-pressed={selection===item.layoutKey} disabled={locked||conflict} onPointerDown={e=>begin(e,item,true)} onClick={()=>{selectItem(item);setKind('furniture');}}><Thumbnail item={item} art={art}/><b>{item.name}</b></button>{selection===item.layoutKey&&<div className="backpack-card-actions"><button disabled={locked||conflict} onClick={()=>placeSelected(item)}>放入场景</button><button aria-label="取消选中家具" onClick={()=>selectItem()}>×</button></div>}</article>):surfaces.map(item=><article key={item.id} data-surface-id={item.id} className={`backpack-card${surfaceSelection===item.id?' selected':''}`}><button className="backpack-item" aria-pressed={surfaceSelection===item.id} onClick={()=>setSurfaceSelection(item.id)}><SurfacePreview item={item}/><b>{item.name}</b></button>{surfaceSelection===item.id&&<div className="backpack-card-actions"><button disabled={locked||conflict} onClick={()=>applySurface(item.id)}>{item.kind==='wallpaper'?'贴上墙纸':'铺上地板'}</button></div>}</article>)}</div>
        {!(kind==='furniture'?shown.length:surfaces.length)&&<p className="backpack-empty">{kind==='furniture'?matching.length?'这个分类暂无未摆放家具。':'家具都已摆好，点击场景中的家具可以移动或收回。':'暂无未使用的款式，可到家具收藏中查看获取方式。'}</p>}
      </>}
      <div className="backpack-status" role="status">{artError||(!art?'正在加载花房素材…':notice||'拖入家具或点击空地放下 · 拖动空白处移动视野 · 保存后生效')}</div>
      {error&&<div className="backpack-error" role="alert">{error}<button disabled={busy} onClick={onRetry}>重试保存</button></div>}
      {conflict&&!pending&&<div className="backpack-error">进度已在另一处更新。<button onClick={()=>{setBase(structuredClone(state));setDraft(structuredClone(state.homeLayout??{}));setFinishDraft(homeSurfaceSelection(state));setUndo([]);setRedo([]);setDrag(null);selectItem();}}>载入最新布置</button></div>}
    </section>
  </section>;
}
