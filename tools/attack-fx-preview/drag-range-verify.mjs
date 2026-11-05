import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {startDragPreview} from './drag-server.mjs';
import {repo} from './server.mjs';

const output=path.resolve(process.argv[2]??path.join(repo,'test-results/drag-range'));await mkdir(output,{recursive:true});
const server=await startDragPreview(8188),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)}),page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);
const errors=[],records=[];let failure,current;
page.on('pageerror',error=>errors.push(error.message));const ghost=page.getByTestId('battle-drag-ghost');
const sort=rows=>rows.map(p=>`${p.x},${p.y}`).sort();
async function center(locator){const b=await locator.boundingBox();assert(b);return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function position(cat){return {x:Number(await cat.getAttribute('data-x')),y:Number(await cat.getAttribute('data-y'))};}
async function moveTo(locator){const p=await center(locator);await page.mouse.move(p.x,p.y,{steps:5});}
async function expected(chapter,id,at){return page.evaluate(async({chapter,id,at})=>{
  if(chapter==='l00'){const {getAttackCells}=await import('/web/src/modules/battle/l00/ranges.ts');return getAttackCells({...window.fixtureRuntime.getSnapshot().cats.find(cat=>cat.id===id),x:at.x,y:at.y});}
  const config=await import(`/web/src/modules/battle/${chapter}/config.ts`),engine=await import(`/web/src/modules/battle/${chapter}/engine.ts`),{createBattleGeometry}=await import('/web/src/modules/battle/shared/geometry.ts');const factory=engine[`create${chapter[0].toUpperCase()+chapter.slice(1)}Battle`];return createBattleGeometry(config.CELLS,config.MAP.obstacles).attackCells({...factory().cats.find(cat=>cat.id===id),x:at.x,y:at.y});
},{chapter,id,at});}
async function assertRanges(prefix,range,label){
  const want=sort(range);
  await expect.poll(async()=>page.locator(`[data-testid="${prefix}-board"] [data-attack-range="true"]`).evaluateAll(nodes=>nodes.map(node=>{const name=node.dataset.testid.split('-cell-')[1];return node.dataset.cell??`${Number(name.slice(1))-1},${name.charCodeAt(0)-65}`;}).sort()),{message:`${label}: DOM range`}).toEqual(want);
  await expect.poll(async()=>page.getByTestId(`${prefix}-board`).evaluate(board=>window.rangeDraws.get(board.querySelector('canvas'))??[]),{message:`${label}: actual Canvas range`}).toEqual(want);
}
async function seedL00(){await page.evaluate(async()=>{const {CAT_TYPES}=await import('/web/src/modules/battle/l00/config.ts');const runtime=window.fixtureRuntime,state=runtime.getSnapshot(),makeCat=(id,x,y)=>({id,...CAT_TYPES[id],x,y,hp:CAT_TYPES[id].maxHp,status:'active',cooldown:0,attacks:0,damageTaken:0,blockedCount:0,maxBlocks:CAT_TYPES[id].block,energy:0,shield:0,shieldRemaining:0});runtime.state={...state,phase:'battle',paused:true,wave:1,nextWaveIn:999,cats:[state.cats.find(cat=>cat.id==='hero'),makeCat('caster',3,0),makeCat('guard',4,1)]};runtime.emit();});}
try{
  await page.goto('http://127.0.0.1:8188/__drag-fixture?controls=1');await page.waitForFunction(()=>!!window.battleDragFixture);
  await page.evaluate(async()=>{
    window.rangeDraws=new WeakMap();const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,fill=proto.fillRect,probe=document.createElement('canvas').getContext('2d');const attackStyles=['#8ee2cb30','#8ee2cb28'].map(color=>{probe.fillStyle=color;return probe.fillStyle;});
    proto.clearRect=function(...args){if(args[0]===0&&args[1]===0&&this.canvas.closest('[data-testid$="-board"]'))window.rangeDraws.set(this.canvas,[]);return clear.apply(this,args);};
    proto.fillRect=function(x,y,w,h){if(attackStyles.includes(this.fillStyle)&&this.canvas.closest('[data-testid$="-board"]')&&[72,90].includes(w)&&w===h){const size=w===90?100:80,rows=window.rangeDraws.get(this.canvas)??[];rows.push(`${Math.floor(x/size)},${Math.floor(y/size)}`);window.rangeDraws.set(this.canvas,rows.sort());}return fill.call(this,x,y,w,h);};
    const {PrologueBattle}=await import('/web/src/modules/battle/l00/runtime.ts');const start=PrologueBattle.prototype.start;PrologueBattle.prototype.start=function(...args){window.fixtureRuntime=this;return start.apply(this,args);};
  });
  for(const chapter of ['chapter','market','greenhouse','tunnel','finale','l00']){
    current=chapter;const prefix=chapter==='l00'?'battle':chapter;
    await page.getByRole('combobox',{name:'选择章节'}).selectOption(chapter);
    if(chapter==='l00'){await expect(page.locator('section[aria-label="序章塔防战斗"]')).toHaveAttribute('data-phase','ready');await seedL00();}else await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-phase','ready');
    await expect(page.getByTestId(`${prefix}-board`)).toBeVisible();const cat=page.getByTestId(`${prefix}-cat-guard`),source=chapter==='l00'?cat:cat.locator('..'),initial=await position(cat);
    const targetData=chapter==='l00'?{id:'battle-cell-B3',x:2,y:1}:await page.getByTestId(`${prefix}-board`).evaluate((board,initial)=>{const nodes=[...board.querySelectorAll('button[data-deployable="true"]')].filter(node=>!node.querySelector('[data-status="active"]'));const node=nodes.find(node=>{const [x,y]=node.dataset.cell.split(',').map(Number);return Math.abs(x-initial.x)+Math.abs(y-initial.y)>=2;});if(!node)throw Error('No legal empty drag target');const [x,y]=node.dataset.cell.split(',').map(Number);return {id:node.dataset.testid,x,y};},initial);
    const target=page.getByTestId(targetData.id),originalRange=await expected(chapter,'guard',initial),movedRange=await expected(chapter,'guard',targetData);assert.notDeepEqual(sort(originalRange),sort(movedRange));
    await source.click();await assertRanges(prefix,originalRange,'selected source');const start=await center(source);await page.mouse.move(start.x,start.y);await page.mouse.down();await moveTo(target);await expect(ghost).toBeVisible();assert.deepEqual(await position(cat),initial);await assertRanges(prefix,movedRange,'held at legal target');await page.screenshot({path:path.join(output,`${chapter}-range-follows.png`)});
    await page.mouse.move(4,4,{steps:6});await assertRanges(prefix,[],'held outside board');assert.deepEqual(await position(cat),initial);
    const invalid=chapter==='l00'?page.getByTestId('battle-cell-B7'):page.locator(`[data-testid="${prefix}-board"] [data-boss-footprint="true"]`).first();await moveTo(invalid);await assertRanges(prefix,[],'held at forbidden cell');assert.deepEqual(await position(cat),initial);
    await moveTo(target);await assertRanges(prefix,movedRange,'return to valid cell');await page.keyboard.press('Escape');await expect(ghost).toHaveCount(0);await page.mouse.up();assert.deepEqual(await position(cat),initial);await source.click();await assertRanges(prefix,originalRange,'cancel then inspect original position');
    const again=await center(source);await page.mouse.move(again.x,again.y);await page.mouse.down();await moveTo(target);await page.mouse.up();await expect(ghost).toHaveCount(0);await expect(cat).toHaveAttribute('data-x',String(targetData.x));await expect(cat).toHaveAttribute('data-y',String(targetData.y));await (chapter==='l00'?cat:cat.locator('..')).click();await assertRanges(prefix,movedRange,'drop then inspect actual new position');records.push({chapter,initial,target:targetData,originalRange,movedRange,canvasAndDomMatched:true,logicPositionUnchangedWhileHeld:true,outsideAndForbiddenClear:true,cancelAndDropCorrect:true,l00SnapshotInjection:chapter==='l00'});
  }
  assert.equal(errors.length,0);console.log('PASS 6 real battle components: DOM + Canvas range follows legal drag target, invalid clears, cancel/drop correct');
}catch(error){failure=error;console.error(current,error);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}finally{await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:!failure,current,scope:'Focused real-pointer range preview checks. L00 uses a valid paused test-only battle snapshot; no production engine or save mutation.',records,errors,failure:failure?.stack},null,2));await browser.close();await server.close();}if(failure)process.exitCode=1;
