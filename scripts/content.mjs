import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {chapters:'story/chapters', story:'story/nodes', maps:'maps/maps', events:'events/events', eventsBalance:'events/balance', cats:'cats/cats', stages:'battles/stages', furniture:'home/furniture', slots:'home/slots', renovations:'home/renovations', items:'items/items', pools:'lottery/pools', parcelRewards:'lottery/rewards', products:'shop/products', rechargePacks:'economy/recharge-packs', tutorials:'tutorials/steps', assets:'assets/manifest'};
files.homeDecor='home/decor';
files.homeSurfaces='home/surfaces';
export function readCatalog() {
  return {version:'2026.10.22.1', ...Object.fromEntries(Object.entries(files).map(([key, file]) => [key, JSON.parse(fs.readFileSync(path.join(root, 'web/content', file+'.json'), 'utf8'))]))};
}
export function validateContent(c) {
  const errors=[];
  for (const key of Object.keys(files).filter(k => k !== 'tutorials' && k !== 'eventsBalance')) {
    const ids=c[key].map(x=>x.id);
    if (ids.some(id=>!id) || new Set(ids).size!==ids.length) errors.push(`${key}: missing/duplicate ID`);
  }
  const has=(key,id)=>c[key].some(x=>x.id===id);
  for(const item of c.homeSurfaces)if(!['wallpaper','floor'].includes(item.kind)||!['original','moss','moon'].includes(item.style)||!item.name||!item.description||!item.default&&(!has('pools',item.poolId)||!Number.isInteger(item.requiredOwned)||item.requiredOwned<1||item.requiredOwned>c.pools.find(p=>p.id===item.poolId)?.entries.length))errors.push(`home surface invalid: ${item.id}`);
  const furnishingCategories=['wall','decor','table','bed','seat','storage','plant','rug','lighting','toy'];
  for(const item of c.furniture)if(!furnishingCategories.includes(item.category)||!Number.isSafeInteger(item.widthCm)||item.widthCm<10||item.widthCm>250)errors.push(`furniture size/category invalid: ${item.id}`);
  for(const item of c.homeDecor)if(!furnishingCategories.includes(item.category))errors.push(`stage furniture category invalid: ${item.id}`);
  for(const d of c.homeDecor){
    const a=d.acquisition;
    if(a&&(!d.storedByDefault||!a.description||!['craft','gift'].includes(a.kind)||a.kind==='craft'&&(!Number.isSafeInteger(a.material)||a.material<1)||a.kind==='gift'&&(d.stage!==4||a.material!==undefined)))errors.push(`home acquisition invalid: ${d.id}`);
    if(d.renovatedFrom&&!c.homeDecor.some(p=>p.stage<d.stage&&p.objectId===d.renovatedFrom&&p.category===d.category))errors.push(`home renovation category invalid: ${d.id}`);
  }
  const repairIds=new Set();
  for(const r of c.renovations){
    const earlier=new Set(),total={};
    for(const p of r.parts??[]){
      if(!p.id||repairIds.has(p.id)||!p.name||!p.description||![p.x,p.y].every(Number.isFinite)||p.x<0||p.x>1672||p.y<0||p.y>941||(p.requires??[]).some(id=>!earlier.has(id)))errors.push(`repair part invalid: ${r.id}/${p.id}`);
      repairIds.add(p.id);earlier.add(p.id);
      for(const [key,n]of Object.entries(p.cost??{})){if(!['material','stamp','tuna'].includes(key)||!Number.isSafeInteger(n)||n<0)errors.push(`repair cost invalid: ${p.id}`);total[key]=(total[key]??0)+n;}
    }
    if(r.parts?.length&&new Set([...Object.keys(total),...Object.keys(r.cost??{})]).size&&[...new Set([...Object.keys(total),...Object.keys(r.cost??{})])].some(key=>(total[key]??0)!==(r.cost?.[key]??0)))errors.push(`repair costs differ from stage: ${r.id}`);
  }
  for(const d of c.homeDecor) if(![1,2,3,4].includes(d.stage)||d.id!==`stage:${d.stage}:${d.objectId}`||!d.name||!d.sprite||!Number.isFinite(d.width)||d.width<=0||![d.x,d.y].every(Number.isInteger)||d.replacementSlot&&!has('slots',d.replacementSlot)) errors.push(`home decor invalid: ${d.id}`);
  for(const n of c.story){if(!has('chapters',n.chapterId)||n.next&&!has('story',n.next)||!['','explore','home','preparation'].includes(n.exit)) errors.push(`story reference: ${n.id}`);}
  for(const m of c.maps) if(m.dangerLevel!==undefined&&(!Number.isInteger(m.dangerLevel)||m.dangerLevel<0||m.dangerLevel>3)) errors.push(`map danger: ${m.id}`);
  for(const m of c.maps) for(const p of m.interactions) {
    if(!has('events',p.eventId)||p.x<0||p.y<0||p.x>m.width||p.y>m.height) errors.push(`map reference/bounds: ${p.id}`);
  }
  if(c.eventsBalance.length!==4||c.eventsBalance.some((b,i)=>!Number.isInteger(b.dangerLevel)||b.dangerLevel!==i||!Number.isInteger(b.triggerChance)||b.triggerChance<1||b.triggerChance>1000||!Number.isInteger(b.riskShare)||b.riskShare<1||b.riskShare>1000||!Number.isInteger(b.echoShare)||b.echoShare<1||b.echoShare>1000)) errors.push('eventsBalance invalid: 需要 dangerLevel 0~3 递增的四条 1~1000 千分比配置(含 echoShare)');
  // 红线执法:主线 flag 只能由剧情/服务端写,随机与机遇卡的 outcomes 不得触碰。
  const mainlineFlags=['alley_rescued','rescue_story_done','market_unlocked','chapter_2_started'];
  for(const e of c.events) if(e.category!=='story') for(const o of e.options) for(const tier of ['crit','success','partial','fail'])
    for(const f of o.outcomes?.[tier]?.flags??[]) if(mainlineFlags.includes(f)) errors.push(`mainline flag leak: ${e.id}/${o.id}/${tier} 写入 ${f}`);
  // flag DAG:requiresFlags 的门槛必须有生产者(事件 outcomes / 剧情节点 setFlags / 服务端写入名单)。
  const serverWrittenFlags=['alley_rescued','rescue_story_done','market_unlocked','chapter_2_started','tuanzi_provided','market_cleared'];
  const produced=new Set(serverWrittenFlags);
  for(const renovation of c.renovations) produced.add(renovation.grantsFlag);
  for(const n of c.story) for(const f of n.setFlags??[]) produced.add(f);
  for(const e of c.events) for(const o of e.options) for(const tier of ['crit','success','partial','fail'])
    for(const f of o.outcomes?.[tier]?.flags??[]) produced.add(f);
  for(const e of c.events) for(const f of e.requiresFlags??[]) if(!produced.has(f)) errors.push(`chain flag without producer: ${e.id} 需要 ${f}`);
  if(c.pools.length!==2||c.pools.filter(p=>p.currency==='stamp').length!==1||c.pools.filter(p=>p.currency==='tuna').length!==1) errors.push('pools: exactly one stamp and one tuna theme');
  const pooled=new Set();
  for(const p of c.pools) {
    if(!produced.has(p.requiredFlag)||!['stamp','tuna'].includes(p.currency)||p.pityEvery!==3||p.duplicateMaterial!==2||p.entries.length!==12) errors.push(`pool rules invalid: ${p.id}`);
    for(const entry of p.entries){
      const item=c.furniture.find(f=>f.id===entry.furnitureId);
      if(pooled.has(entry.furnitureId)||!item||item.theme!==p.theme||item.source!==(p.currency==='stamp'?'free_pool':'paid_pool')||!has('slots',item.preferredSlot)||!Number.isSafeInteger(item.widthCm)||item.widthCm<10||item.widthCm>300) errors.push(`pool theme/source/size invalid: ${p.id}/${entry.furnitureId}`);
      pooled.add(entry.furnitureId);
    }
    if(!Number.isInteger(p.cost)||p.cost<1||p.entries.length===0||p.entries.some(e=>!has('furniture',e.furnitureId)||!Number.isInteger(e.weight)||e.weight<=0)) errors.push(`pool invalid: ${p.id}`);
  }
  for(const r of c.parcelRewards) if(!['daily','milestone'].includes(r.kind)||!['home','furnished','flag'].includes(r.condition)||r.requiredFlag&&!produced.has(r.requiredFlag)||![r.stamp,r.tuna].every(n=>Number.isSafeInteger(n)&&n>=0)||r.stamp+r.tuna<1) errors.push(`parcel reward invalid: ${r.id}`);
  for(const stage of c.stages) if(![stage.lanes,stage.columns,stage.waves].every(n=>Number.isSafeInteger(n)&&n>0)||stage.chapterId!==undefined&&!has('chapters',stage.chapterId)) errors.push(`stage invalid: ${stage.id}`);
  const sold = new Set();
  for(const p of c.products) {
    if(!has('furniture',p.furnitureId)||!Number.isSafeInteger(p.price)||p.price<1||p.currencyId!=='stamp'||!['available','disabled'].includes(p.status)||sold.has(p.furnitureId)) errors.push(`product invalid: ${p.id}`);
    sold.add(p.furnitureId);
  }
  // advisorHint(可选,给阿策/解释层的静态说明):不代选、不夹带结局文案、不剧透 flag/其他卡。
  // 未结算档位天然进不来(它是卡级静态文本);缺字段走既有读取方式,零迁移。
  const hintBan=/推荐|建议选|应该选|最好选/;
  const allEventIds=c.events.map(x=>x.id);
  const allFlags=new Set(c.events.flatMap(e=>[...(e.requiresFlags??[]), ...e.options.flatMap(o=>['crit','success','partial','fail'].flatMap(t=>o.outcomes?.[t]?.flags??[]))]));
  for(const e of c.events) {
    if(e.options.length===0||!e.triggers?.length||e.category==='story'&&e.triggers.includes('random')||new Set(e.options.map(o=>o.id)).size!==e.options.length) errors.push(`event invalid: ${e.id}`);
    if(e.triggers.includes('random')&&(!Array.isArray(e.maps)||!e.maps.length||e.maps.some(id=>!c.maps.some(m=>m.id===id)))) errors.push(`event random zone: ${e.id}`);
    if(e.options.some(o=>o.requireCat&&!c.cats.some(cat=>cat.id===o.requireCat))) errors.push(`event option cat: ${e.id}`);
    for(const o of e.options){
      const tierTexts = ['crit','success','partial','fail'].map(t => o.outcomes?.[t]?.text ?? '');
      if(tierTexts.every(t=>t) && new Set(tierTexts).size === 1) errors.push(`event tiers identical: ${e.id}/${o.id} 四档文案全同,掷骰失去意义`);
    }
    const CARRIES=['lantern','mirror','bell','box','dog','dove','rats','kitten'];
    for(const o of e.options) for(const tier of ['crit','success','partial','fail']) if(o.outcomes?.[tier]?.carry !== undefined && !CARRIES.includes(o.outcomes[tier].carry)) errors.push(`event carry: ${e.id}/${o.id}/${tier} 未知战备物`);
    if(e.requiresFlags!==undefined&&(!Array.isArray(e.requiresFlags)||!e.requiresFlags.length||e.requiresFlags.some(f=>typeof f!=='string'||!f))) errors.push(`event chain flags: ${e.id}`);    for(const o of e.options) for(const tier of ['crit','success','partial','fail']) {
      const result=o.outcomes?.[tier];
      if(!result?.text||Object.values(result?.reward??{}).some(n=>!Number.isSafeInteger(n)||n<0)||result?.tdMod&&![-1,0,1].includes(result.tdMod.shadowPressure)) errors.push(`event outcome: ${e.id}/${o.id}/${tier}`);
      if(result?.situation&&!c.story.some(n=>n.id===result.situation.storyNodeId&&n.exit==='preparation')) errors.push(`event situation: ${e.id}/${o.id}/${tier}`);
    }
    // 线索保底红线:fail 档必须 clue>=1——"到场即得,档位管增量"(design/events/random-events-design.md),
    // 左尾玩家的线索门槛(clue>=3)由此获得数学保证。
    for(const o of e.options) if((o.outcomes?.fail?.reward?.clue??0)<1) errors.push(`event fail clue floor: ${e.id}/${o.id} fail 档缺线索保底 clue:1`);
    for(const [scope,hint,max] of [['card',e.advisorHint,120], ...e.options.map(o=>['option:'+o.id,o.advisorHint,60])]) {
      if(hint===undefined) continue;
      if(typeof hint!=='string'||!hint.trim()||hint.includes('\n')||hint.length>max) errors.push(`event advisorHint: ${e.id}/${scope} 需为 1~${max} 字单行文本`);
      else if(hintBan.test(hint)) errors.push(`event advisorHint: ${e.id}/${scope} 不得代选(含推荐措辞)`);
      else if(e.options.some(o=>['crit','success','partial','fail'].some(t=>o.outcomes?.[t]?.text&&hint.includes(o.outcomes[t].text)))) errors.push(`event advisorHint: ${e.id}/${scope} 不得复制结局文案`);
      else if([...allFlags].some(f=>hint.includes(f))) errors.push(`event advisorHint: ${e.id}/${scope} 不得剧透 flag`);
      else if(allEventIds.some(id=>hint.includes(id))) errors.push(`event advisorHint: ${e.id}/${scope} 不得点名事件卡`);
    }
  }
  if(errors.length) throw Error(errors.join('\n'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog=readCatalog(); validateContent(catalog);
  const data=JSON.stringify(catalog,null,2)+'\n';
  for(const out of ['web/content/catalog.json','server/internal/platform/catalog.json']) {
    const target=path.join(root,out);
    if(process.argv.includes('--check')) {if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==data) throw Error(`${out} is stale; run npm run content:sync`);}
    else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  }
  const spatialSource=fs.readFileSync(path.join(root,'level_design/chapter5/source/v07/warehouse_geometry_v07.json'));
  const spatialTarget=path.join(root,'server/internal/service/warehouse_geometry.json');
  if(process.argv.includes('--check')) {if(!fs.existsSync(spatialTarget)||!fs.readFileSync(spatialTarget).equals(spatialSource))throw Error('warehouse geometry mirror is stale; run content:sync');}
  else fs.writeFileSync(spatialTarget,spatialSource);
  // AI-only story handoff: keep the backend's embedded copy identical to the
  // authored UI summaries without adding story metadata to gameplay contracts.
  const storySource=fs.readFileSync(path.join(root,'web/content/story/advisor-home.json'));
  const notes=JSON.parse(storySource.toString('utf8'));
  const validList=(values,required)=>Array.isArray(values)&&(!required||values.length>0)&&new Set(values).size===values.length&&values.every(value=>typeof value==='string'&&value.trim().length>0);
  if(!Array.isArray(notes)||new Set(notes.map(note=>note?.id)).size!==notes.length||notes.some(note=>!note||['id','title','text'].some(key=>typeof note[key]!=='string'||!note[key].trim())||!validList(note.requiredFlags,true)||!validList(note.requiredCats,false)||note.requiredCats.some(id=>!catalog.cats.some(cat=>cat.id===id))||!validList(note.sourceNodes,true)||note.sourceNodes.some(id=>!catalog.story.some(node=>node.id===id))))throw Error('advisor-home story summaries or visibility/source conditions are invalid');
  const storyTarget=path.join(root,'server/internal/service/advisor_home_story.json');
  if(process.argv.includes('--check')) {if(!fs.existsSync(storyTarget)||!fs.readFileSync(storyTarget).equals(storySource))throw Error('advisor home story mirror is stale; run content:sync');}
  else fs.writeFileSync(storyTarget,storySource);
  console.log('Content IDs, references and generated catalogs verified.');
}
