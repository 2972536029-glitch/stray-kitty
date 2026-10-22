import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {chapters:'story/chapters', story:'story/nodes', maps:'maps/maps', events:'events/events', cats:'cats/cats', stages:'battles/stages', furniture:'home/furniture', slots:'home/slots', items:'items/items', pools:'lottery/pools', tutorials:'tutorials/steps', assets:'assets/manifest'};
export function readCatalog() {
  return {version:'2026.10.22.1', ...Object.fromEntries(Object.entries(files).map(([key, file]) => [key, JSON.parse(fs.readFileSync(path.join(root, 'web/content', file+'.json'), 'utf8'))]))};
}
export function validateContent(c) {
  const errors=[];
  for (const key of Object.keys(files).filter(k => k !== 'tutorials')) {
    const ids=c[key].map(x=>x.id);
    if (ids.some(id=>!id) || new Set(ids).size!==ids.length) errors.push(`${key}: missing/duplicate ID`);
  }
  const has=(key,id)=>c[key].some(x=>x.id===id);
  for(const n of c.story){if(!has('chapters',n.chapterId)||n.next&&!has('story',n.next)) errors.push(`story reference: ${n.id}`);}
  for(const m of c.maps) for(const p of m.interactions) {
    if(!has('events',p.eventId)||p.x<0||p.y<0||p.x>m.width||p.y>m.height) errors.push(`map reference/bounds: ${p.id}`);
  }
  for(const p of c.pools) {
    if(!Number.isInteger(p.cost)||p.cost<1||p.entries.length===0||p.entries.some(e=>!has('furniture',e.furnitureId)||!Number.isInteger(e.weight)||e.weight<=0)) errors.push(`pool invalid: ${p.id}`);
  }
  for(const stage of c.stages) if(stage.lanes<1||stage.columns<1||stage.waves<1) errors.push(`stage invalid: ${stage.id}`);
  for(const e of c.events) if(e.options.length===0||e.options.some(o=>o.threshold<1||o.threshold>6||o.material<0)) errors.push(`event invalid: ${e.id}`);
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
