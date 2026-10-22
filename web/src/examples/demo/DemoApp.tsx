import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {Catalog,GameCommand} from '../../contracts';
import {GameStore} from '../../core/state';
import {currentStory,objective} from '../../core/story';
import {ApiError,HttpGameApi} from '../../adapters/api/client';
import {Viewport} from './Viewport';
import type {Direction} from '../../adapters/platform/input';
import {GameController} from '../../app/controller';
const phases:Record<string,string>={dialogue:'猫咪物语',explore:'小巷探索',event:'一次相遇',preparation:'守护准备',battle:'点亮防线',settlement:'救援结果',home:'我们的花房'};
export default function DemoApp(){
  const [store]=useState(()=>new GameStore());const [port]=useState(()=>new HttpGameApi());const [controller]=useState(()=>new GameController(port,store));
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [catalog,setCatalog]=useState<Catalog|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[near,setNear]=useState(false),[paused,setPaused]=useState(false);
  const [selectedFurniture,setSelectedFurniture]=useState('cardboard_nest');
  const direction=useRef<(direction:Direction,held:boolean)=>void>(()=>{});const booting=useRef(false);
  const initialize=useCallback(async()=>{
    if(booting.current)return;booting.current=true;setBusy(true);setError('');
    try{const [data,progress]=await Promise.all([port.catalog(),port.initialize()]);setCatalog(data);store.replace(progress);}
    catch(e){setError(e instanceof Error?e.message:'暂时无法连接，请重试。');}
    finally{setBusy(false);booting.current=false;}
  },[port,store]);
  useEffect(()=>{void initialize();},[initialize]);
  const send=useCallback(async(command:GameCommand)=>{
    setBusy(true);setError('');
    try{await controller.dispatch(command);}
    catch(e){setError(e instanceof Error?e.message:'操作尚未确认，请重试。');if(e instanceof ApiError&&e.code==='REVISION_CONFLICT'){try{store.replace(await port.load());}catch{/* 保留可见错误，等待用户重试。 */}}}
    finally{setBusy(false);}
  },[controller,port,store]);
  const interact=useCallback(()=>{void send({type:'INTERACT',interactionId:'alley_crate'});},[send]);
  async function retry(){
    const pending=port.pending();if(!pending){await initialize();return;}setBusy(true);setError('');
    try{await port.execute(pending.request,pending.key);const [latest,content]=await Promise.all([port.load(),port.catalog()]);setCatalog(content);store.replace(latest);}catch(e){setError(e instanceof Error?e.message:'仍未确认，请稍后再试。');}finally{setBusy(false);}
  }
  const disabled=busy||paused||!!port.pending();
  const node=state&&catalog?currentStory(catalog,state):undefined;
  const chapter=catalog?.chapters.find(c=>c.id===state?.chapterId);
  const event=catalog?.events.find(e=>e.id===state?.pendingEventId);
  const furnitureName=(id:string)=>catalog?.furniture.find(f=>f.id===id)?.name??id;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="小猫回家记首页"><span className="brand-mark">ฅ</span><span><strong>小猫回家记</strong><small>流 浪 猫 王 国</small></span></a>
      <div className="topbar-note">为彼此，找到一个家。</div><span className="edition">首段体验 · 0.1</span></header>
    <main>
      <div className="page-heading"><div><span className="eyebrow">A LITTLE JOURNEY HOME</span><h1>{state?.phase==='home'?'这里，慢慢有了家的样子。':'一只猫的旅程，一群猫的家。'}</h1><p>{chapter?.title??'雨后的城市里，有一段故事正等着你。'}</p></div>
        <div className="wallet"><span>猫爪邮票 <b data-testid="stamps">{state?.currencies.stamp??0}</b></span><span>修缮材料 <b>{state?.inventory.material??0}</b></span></div></div>
      {error&&<div className="error-banner" role="alert">{error}<button disabled={busy} onClick={()=>void retry()}>重试上次操作</button></div>}
      {!state||!catalog?<section className="loading-card"><span className="brand-mark">ฅ</span><h2>{busy?'正在寻找熟悉的气味……':'旅程暂时停在这里'}</h2><p>{busy?'正在打开小巷和你的旅程记录。':'请确认本地服务已启动，然后重试。'}</p>{!busy&&<button onClick={()=>void initialize()}>重新连接</button>}</section>:<div className="game-layout">
        <section className="world-panel">
          <div className="world-toolbar"><div><span className="live-dot"/><strong>{phases[state.phase]}</strong><span className="area-label">{state.phase==='home'?'废弃花房':'雨后小巷'}</span></div><button className="quiet" onClick={()=>setPaused(!paused)}>{paused?'继续旅程':'暂停'}</button></div>
          <div className="world-wrap">
            <Viewport state={state} paused={paused||busy||!!port.pending()} onNear={setNear} onInteract={interact} onResult={result=>void send({type:'COMPLETE_BATTLE',...result})} onDirectionReady={fn=>{direction.current=fn;}}/>
            {state.phase==='dialogue'&&node&&<div className="dialogue-card"><span className="speaker">{node.speaker}</span><p>{node.text}</p><button disabled={disabled} onClick={()=>void send({type:'ADVANCE_STORY',nodeId:node.id})}>继续故事 <span>→</span></button></div>}
            {state.phase==='event'&&event&&<div className="event-card"><span className="eyebrow">一 个 小 小 的 选 择</span><h2>{event.title}</h2><p>{event.text}</p><div className="choice-list">{event.options.map(option=><button key={option.id} disabled={disabled} onClick={()=>void send({type:'CHOOSE_EVENT',eventId:event.id,optionId:option.id})}>{option.label}<small>六面骰判定 · {option.threshold} 点及以上有额外收获</small></button>)}</div><small>不论判定结果如何，救援都会继续。</small></div>}
            {state.phase==='preparation'&&<div className="event-card"><span className="dice-value">{state.lastResult.roll?`骰子 · ${state.lastResult.roll} 点`:'再试一次'}</span><h2>为伙伴点亮一条路</h2><p>{state.lastResult.message}</p><p className="muted">进入独立的三路守护场景，点击空格放置光源。每个光源消耗两格能量，能量会缓慢恢复。</p><button disabled={disabled} onClick={()=>void send({type:'START_BATTLE',stageId:'alley_rescue'})}>开始守护 →</button></div>}
            {state.phase==='settlement'&&<div className="event-card"><span className="eyebrow">{state.lastResult.outcome==='won'?'A SAFE WAY HOME':'TRY A LITTLE DIFFERENTLY'}</span><h2>{state.lastResult.outcome==='won'?'点点，跟我们走吧。':'再一起想想办法。'}</h2><p>{state.lastResult.message}</p>{state.lastResult.firstClear&&<p className="reward-note">首次救援：点点加入 · 纸箱猫窝 · 猫爪邮票 ×2 · 材料 ×3</p>}<button disabled={disabled} onClick={()=>void send({type:'CONTINUE'})}>{state.lastResult.outcome==='won'?'带伙伴回家 →':'调整防线，再试一次'}</button></div>}
            {paused&&<div className="pause-label">旅程已暂停</div>}
          </div>
          <div className="world-footer"><p>{catalog.tutorials.find(t=>t.phase===state.phase)?.text??'每次相遇，都可能成为回家路上的一点光。'}</p>
            {state.phase==='explore'&&<><div className="direction-pad">{(['up','left','down','right'] as Direction[]).map((d,i)=><button key={d} aria-label={`向${['上','左','下','右'][i]}移动`} disabled={disabled} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);direction.current(d,true);}} onPointerUp={()=>direction.current(d,false)} onLostPointerCapture={()=>direction.current(d,false)}>{['↑','←','↓','→'][i]}</button>)}</div>{near&&<button disabled={disabled} onClick={interact}>查看纸箱 · E</button>}{state.flags.includes('alley_rescued')&&<button disabled={disabled} onClick={()=>void send({type:'GO_HOME'})}>回到花房</button>}</>}
          </div>
        </section>
        <aside className="journal">
          <section className="journal-card"><span className="eyebrow">OUR LITTLE QUEST</span><h2>现在的小目标</h2><p>{objective(state)}</p><ol className="quest-steps"><li className="done">遇见团子</li><li className={state.phase!=='dialogue'?'done':''}>寻找纸箱里的叫声</li><li className={state.cats.includes('diandian')?'done':''}>守护点点的撤离路线</li><li className={state.flags.includes('rescue_story_done')?'done':''}>一起安顿花房</li></ol></section>
          <section className="journal-card"><div className="card-title"><h2>一路上的伙伴</h2><span>{state.cats.length} / {catalog.cats.length}</span></div><div className="cat-list">{catalog.cats.map(cat=><div className={`cat-entry ${state.cats.includes(cat.id)?'':'locked'}`} key={cat.id}><span className="cat-avatar" style={{background:cat.color}}>ฅ</span><div><strong>{state.cats.includes(cat.id)?cat.name:'尚未遇见'}</strong><small>{state.cats.includes(cat.id)?cat.description:'还有新的相遇，在前方等待。'}</small></div></div>)}</div></section>
          {state.phase==='home'&&<section className="journal-card"><span className="eyebrow">MAKE IT OURS</span><h2>整理我们的家</h2><label className="select-label">选择家具<select value={selectedFurniture} onChange={e=>setSelectedFurniture(e.target.value)}>{state.furniture.map(id=><option key={id} value={id}>{furnitureName(id)}</option>)}</select></label><div className="slot-list">{catalog.slots.map(slot=><button className="secondary" key={slot.id} disabled={disabled} onClick={()=>void send({type:'PLACE_FURNITURE',furnitureId:selectedFurniture,slotId:slot.id})}>{slot.name}<small>{state.placements[slot.id]?furnitureName(state.placements[slot.id]):'还空着，放一件家具'}</small></button>)}</div><button disabled={disabled||state.currencies.stamp<1} onClick={()=>void send({type:'DRAW_FURNITURE',poolId:'rainy_box'})}>打开雨夜包裹 · 1 邮票</button>{state.lastResult.outcome&&<p className="muted" aria-live="polite">{state.lastResult.message}</p>}<p className="muted">雨夜包裹：毛毯 60%，小灯 40%；重复家具转化为 2 份材料。</p><button className="quiet" disabled={disabled} onClick={()=>void send({type:'GO_EXPLORE'})}>再去小巷走走 →</button></section>}
          <div className="save-note"><span className="live-dot"/>{busy?'正在记录旅程……':port.pending()?'有一次操作等待确认':'旅程已自动保存'}<small>刷新页面后，可以继续。</small></div>
        </aside>
      </div>}
    </main><footer className="site-footer"><span>不是所有猫都有家。那就为彼此，创造一个家。</span><span>探索 · 救援 · 相伴</span></footer>
  </div>;
}
