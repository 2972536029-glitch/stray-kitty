import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {chapters:'story/chapters', story:'story/nodes', maps:'maps/maps', events:'events/events', eventsBalance:'events/balance', cats:'cats/cats', stages:'battles/stages', furniture:'home/furniture', slots:'home/slots', items:'items/items', pools:'lottery/pools', products:'shop/products', tutorials:'tutorials/steps', assets:'assets/manifest'};
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
  const serverWrittenFlags=['alley_rescued','rescue_story_done','market_unlocked','chapter_2_started','tuanzi_provided'];
  const produced=new Set(serverWrittenFlags);
  for(const n of c.story) for(const f of n.setFlags??[]) produced.add(f);
  for(const e of c.events) for(const o of e.options) for(const tier of ['crit','success','partial','fail'])
    for(const f of o.outcomes?.[tier]?.flags??[]) produced.add(f);
  for(const e of c.events) for(const f of e.requiresFlags??[]) if(!produced.has(f)) errors.push(`chain flag without producer: ${e.id} 需要 ${f}`);
  for(const p of c.pools) {
    if(!Number.isInteger(p.cost)||p.cost<1||p.entries.length===0||p.entries.some(e=>!has('furniture',e.furnitureId)||!Number.isInteger(e.weight)||e.weight<=0)) errors.push(`pool invalid: ${p.id}`);
  }
  for(const stage of c.stages) if(![stage.lanes,stage.columns,stage.waves].every(n=>Number.isSafeInteger(n)&&n>0)||stage.chapterId!==undefined&&!has('chapters',stage.chapterId)) errors.push(`stage invalid: ${stage.id}`);
  const sold = new Set();
  for(const p of c.products) {
    if(!has('furniture',p.furnitureId)||!Number.isSafeInteger(p.price)||p.price<1||p.currencyId!=='stamp'||!['available','disabled'].includes(p.status)||sold.has(p.furnitureId)) errors.push(`product invalid: ${p.id}`);
    sold.add(p.furnitureId);
  }
  for(const e of c.events) {
    if(e.options.length===0||!e.triggers?.length||e.category==='story'&&e.triggers.includes('random')||new Set(e.options.map(o=>o.id)).size!==e.options.length) errors.push(`event invalid: ${e.id}`);
    if(e.triggers.includes('random')&&(!Array.isArray(e.maps)||!e.maps.length||e.maps.some(id=>!c.maps.some(m=>m.id===id)))) errors.push(`event random zone: ${e.id}`);
    if(e.options.some(o=>o.requireCat&&!c.cats.some(cat=>cat.id===o.requireCat))) errors.push(`event option cat: ${e.id}`);
    const CARRIES=['lantern','mirror','bell','box','dog','dove'];
    for(const o of e.options) for(const tier of ['crit','success','partial','fail']) if(o.outcomes?.[tier]?.carry !== undefined && !CARRIES.includes(o.outcomes[tier].carry)) errors.push(`event carry: ${e.id}/${o.id}/${tier} 未知战备物`);
    if(e.requiresFlags!==undefined&&(!Array.isArray(e.requiresFlags)||!e.requiresFlags.length||e.requiresFlags.some(f=>typeof f!=='string'||!f))) errors.push(`event chain flags: ${e.id}`);    for(const o of e.options) for(const tier of ['crit','success','partial','fail']) {
      const result=o.outcomes?.[tier];
      if(!result?.text||Object.values(result?.reward??{}).some(n=>!Number.isSafeInteger(n)||n<0)||result?.tdMod&&![-1,0,1].includes(result.tdMod.shadowPressure)) errors.push(`event outcome: ${e.id}/${o.id}/${tier}`);
      if(result?.situation&&!c.story.some(n=>n.id===result.situation.storyNodeId&&n.exit==='preparation')) errors.push(`event situation: ${e.id}/${o.id}/${tier}`);
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
  console.log('Content IDs, references and generated catalogs verified.');
}
