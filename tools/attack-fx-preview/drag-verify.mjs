import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {startDragPreview} from './drag-server.mjs';
import {repo} from './server.mjs';

const output=path.resolve(process.argv[2]??path.join(repo,'test-results/cat-drag'));
await mkdir(output,{recursive:true});
const server=await startDragPreview(),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[],requests=[],records=[];let failure,current='initial';
page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push({url:request.url(),error:request.failure()?.errorText}));
const ghost=page.getByTestId('battle-drag-ghost');
const center=async locator=>{const b=await locator.boundingBox();assert(b,'target must have layout');return {x:b.x+b.width/2,y:b.y+b.height/2};};
const pos=async locator=>({x:Number(await locator.getAttribute('data-x')),y:Number(await locator.getAttribute('data-y'))});
async function open(chapter){await page.evaluate(chapter=>window.battleDragFixture.open(chapter),chapter);await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-phase','ready');await expect(page.getByTestId(`${chapter}-board`)).toBeVisible();}
async function begin(locator,offset={x:0,y:0}){const point=await center(locator);point.x+=offset.x;point.y+=offset.y;await page.mouse.move(point.x,point.y);await page.mouse.down();return point;}
async function move(point,dx=38,dy=-22){await page.mouse.move(point.x+dx,point.y+dy,{steps:5});await expect(ghost).toBeVisible();return {x:point.x+dx,y:point.y+dy};}
async function drop(locator){const point=await center(locator);await page.mouse.move(point.x,point.y,{steps:7});await page.mouse.up();await expect(ghost).toHaveCount(0);}
try{
  await page.goto('http://127.0.0.1:8187/__drag-fixture');await page.waitForFunction(()=>!!window.battleDragFixture);
  for(const chapter of ['chapter','market','greenhouse','tunnel','finale']){
    current=chapter;await open(chapter);
    const cat=page.getByTestId(`${chapter}-cat-guard`),source=cat.locator('..'),initial=await pos(cat),battle=page.getByTestId(`${chapter}-battle`);
    const cells=page.locator(`[data-testid="${chapter}-board"] button[data-deployable="true"]`);
    const empty=await cells.evaluateAll(nodes=>nodes.filter(node=>!node.querySelector('[data-status="active"]')).map(node=>({id:node.dataset.testid,cell:node.dataset.cell})));assert(empty.length);
    const target=page.getByTestId(empty[0].id),[x,y]=empty[0].cell.split(',').map(Number);
    const start=await begin(source,{x:6,y:-5});await page.mouse.move(start.x+3,start.y);await expect(ghost).toHaveCount(0);
    const pointer=await move(start);const first=await ghost.boundingBox();assert(first);
    assert.deepEqual(await pos(cat),initial,'dragging must not move engine grid position before release');await expect(cat).toHaveCSS('visibility','hidden');
    await page.mouse.move(pointer.x+51,pointer.y+27,{steps:4});const second=await ghost.boundingBox();assert(Math.abs(second.x-first.x-51)<1);assert(Math.abs(second.y-first.y-27)<1);
    await expect(ghost).toHaveAttribute('data-client-x',String(pointer.x+51));await expect(ghost).toHaveAttribute('data-client-y',String(pointer.y+27));
    await page.screenshot({path:path.join(output,`${chapter}-held.png`)});await drop(target);await expect(cat).toHaveAttribute('data-x',String(x));await expect(cat).toHaveAttribute('data-y',String(y));await expect(page.getByTestId(`${chapter}-cat-menu`)).toHaveCount(0);
    records.push({chapter,case:'follow-pointer-and-valid-drop',initial,target:{x,y},ghostDelta:{x:second.x-first.x,y:second.y-first.y}});
    await open(chapter);const caster=page.getByTestId(`${chapter}-cat-caster`),casterInitial=await pos(caster);await begin(cat.locator('..'));await drop(caster.locator('..'));assert.deepEqual(await pos(cat),casterInitial);assert.deepEqual(await pos(caster),initial);records.push({chapter,case:'occupied-cat-swap'});
    await open(chapter);await begin(cat.locator('..'));await drop(page.locator(`[data-testid="${chapter}-board"] [data-boss-footprint="true"]`).first());assert.deepEqual(await pos(cat),initial);records.push({chapter,case:'boss-cell-rejected'});
    await begin(cat.locator('..'));await move(await center(cat.locator('..')));await page.mouse.move(4,4,{steps:8});await page.mouse.up();await expect(ghost).toHaveCount(0);assert.deepEqual(await pos(cat),initial);records.push({chapter,case:'outside-board-rejected'});
    const held=await begin(cat.locator('..'));await move(held);await page.evaluate(()=>window.battleDragFixture.setPaused(true));await expect(ghost).toHaveCount(0);await page.mouse.up();assert.deepEqual(await pos(cat),initial);records.push({chapter,case:'external-pause-cancels'});
    await page.evaluate(()=>window.battleDragFixture.setPaused(false));await begin(cat.locator('..'));await move(await center(cat.locator('..')));await page.evaluate(()=>window.battleDragFixture.retry());await expect(ghost).toHaveCount(0);await page.mouse.up();assert.deepEqual(await pos(cat),initial);records.push({chapter,case:'retry-cancels'});
    await page.getByTestId(chapter==='chapter'?'chapter-start':`${chapter}-play-toggle`).click();await expect(battle).toHaveAttribute('data-phase','battle');await begin(cat.locator('..'));await move(await center(cat.locator('..')));await expect(battle).toHaveAttribute('data-effective-speed','0');const elapsed=await battle.getAttribute('data-elapsed');await page.waitForTimeout(180);assert.equal(await battle.getAttribute('data-elapsed'),elapsed);await page.mouse.move(4,4);await page.mouse.up();records.push({chapter,case:'live-battle-held-pauses'});
    await open(chapter);const touch=await context.newCDPSession(page),p=await center(cat.locator('..'));
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+45,y:p.y-20,id:1}]});await expect(ghost).toBeVisible();await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(ghost).toHaveCount(0);assert.deepEqual(await pos(cat),initial);await touch.detach();records.push({chapter,case:'real-touch-pointer-cancel'});
  }
  current='narrow';await page.setViewportSize({width:640,height:900});await open('tunnel');const overview=page.getByRole('button',{name:'查看全图',exact:true});if(await overview.count())await overview.click();
  const cat=page.getByTestId('tunnel-cat-guard'),start=await begin(cat.locator('..'));await move(start,40,20);const rect=await ghost.boundingBox();assert(Math.abs(rect.x+rect.width/2-start.x-40)<1);assert(Math.abs(rect.y+rect.height/2-start.y-20)<1);await page.screenshot({path:path.join(output,'tunnel-narrow-held.png')});await page.mouse.move(4,4);await page.mouse.up();await expect(ghost).toHaveCount(0);records.push({chapter:'tunnel',case:'narrow-scaled-board-follows'});
  current='l00';await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.battleDragFixture.open('l00'));const l00=page.locator('section[aria-label="序章塔防战斗"]');await expect(l00).toHaveAttribute('data-phase','ready');await page.getByTestId('battle-speed-toggle').click();await page.getByTestId('battle-play-toggle').click();await expect(l00).toHaveAttribute('data-phase','teach_position',{timeout:60000});
  const caster=page.getByTestId('battle-cat-caster'),initial=await pos(caster),p=await begin(caster);await move(p);assert.deepEqual(await pos(caster),initial);await expect(caster).toHaveCSS('opacity','0');await page.screenshot({path:path.join(output,'l00-held.png')});await drop(page.getByTestId('battle-cell-A4'));await expect(l00).toHaveAttribute('data-phase','teach_energy');assert.deepEqual(await pos(caster),{x:3,y:0});records.push({chapter:'l00',case:'tutorial-real-drag-advances'});
  await page.getByTestId('battle-begin-skill-practice').click();await expect(l00).toHaveAttribute('data-phase','teach_move');await begin(page.getByTestId('battle-cat-guard'));await drop(page.getByTestId('battle-cell-B5'));await expect(l00).toHaveAttribute('data-phase','teach_live_move');
  await begin(caster);await move(await center(caster));await expect(l00).toHaveAttribute('data-effective-speed','0.5');const time=Number(await l00.getAttribute('data-battle-time'));await page.waitForTimeout(200);assert(Number(await l00.getAttribute('data-battle-time'))>time,'live movement tutorial must keep advancing while held');await drop(page.getByTestId('battle-cell-C4'));await expect(l00).toHaveAttribute('data-phase','skill_charge');records.push({chapter:'l00',case:'live-move-keeps-battle-running'});
  assert.equal(errors.length,0);assert.equal(requests.length,0);console.log(`PASS ${records.length} real pointer cases`);
}catch(error){failure=error;console.error(current,error);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:!failure,scope:'Actual six battle components and original engines, no persistent saves or test engine transforms',current,records,errors,requests,failure:failure?.stack},null,2));await context.close();await browser.close();await server.close();}
if(failure)process.exitCode=1;
