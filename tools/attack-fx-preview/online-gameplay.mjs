import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';

// Live production DOM/canvas observation and ordinary player input only.
// No engine imports, state injection, response replacement, or damage overrides.
export async function verifyOnlineAttack(page,prefix,output){
  const board=page.getByTestId(`${prefix}-board`),battle=page.getByTestId(`${prefix}-battle`),ghost=page.getByTestId('battle-drag-ghost');
  const middle=async locator=>{const box=await locator.boundingBox();assert(box);return {x:box.x+box.width/2,y:box.y+box.height/2};};
  const position=async cat=>({x:Number(await cat.getAttribute('data-x')),y:Number(await cat.getAttribute('data-y'))});
  const cells=await board.locator('button[data-cell]').evaluateAll(nodes=>nodes.map(node=>{const [x,y]=node.dataset.cell.split(',').map(Number);return {x,y,id:node.dataset.testid,deployable:node.dataset.deployable==='true',boss:node.dataset.bossFootprint==='true',obstacle:node.classList.contains('is-obstacle'),occupied:!!node.querySelector('[data-status="active"]')};}));
  const bossCells=cells.filter(cell=>cell.boss);assert(bossCells.length);
  const guard=page.getByTestId(`${prefix}-cat-guard`),initial=await position(guard);
  const range=at=>[{x:at.x,y:at.y},{x:at.x+1,y:at.y},{x:at.x,y:at.y-1},{x:at.x,y:at.y+1}].filter(p=>cells.some(cell=>cell.x===p.x&&cell.y===p.y&&!cell.obstacle)).map(p=>`${p.x},${p.y}`).sort();
  const target=cells.find(cell=>cell.deployable&&!cell.occupied&&range(cell).some(p=>bossCells.some(boss=>p===`${boss.x},${boss.y}`)));
  assert(target,`${prefix}: need a real empty legal melee tile near the boss`);
  const initialBossHp=Number(await page.getByTestId(`${prefix}-boss-health`).getAttribute('aria-valuenow'));
  await page.evaluate(prefix=>{
    const probe=document.createElement('canvas').getContext('2d'),styles=['#8ee2cb30','#8ee2cb28'].map(color=>{probe.fillStyle=color;return probe.fillStyle;});
    const canvas=document.querySelector(`[data-testid="${prefix}-board"] canvas`),ctx=canvas.getContext('2d'),clear=ctx.clearRect,fill=ctx.fillRect,stroke=ctx.stroke;
    const palette={caster:'#bca0ed',guard:'#80cbd3',tuanzi:'#f3a35b',diandian:'#eac185',bruiser:'#c89362',controller:'#8ad4de',momo:'#7aa8d9',taotao:'#efbd70'};
    const normalized=Object.fromEntries(Object.entries(palette).map(([id,color])=>{probe.strokeStyle=color;return [probe.strokeStyle,id];}));
    window.__onlineAttack={prefix,range:[],paletteStrokes:{},bossStarts:[],captures:[],canvas};
    ctx.clearRect=function(...args){if(args[0]===0&&args[1]===0)window.__onlineAttack.range=[];return clear.apply(this,args);};
    ctx.fillRect=function(x,y,w,h){if(styles.includes(this.fillStyle)&&w===72&&h===72)window.__onlineAttack.range.push(`${Math.floor(x/80)},${Math.floor(y/80)}`);return fill.call(this,x,y,w,h);};
    ctx.stroke=function(...args){const id=normalized[this.strokeStyle];if(id)window.__onlineAttack.paletteStrokes[id]=(window.__onlineAttack.paletteStrokes[id]??0)+1;return stroke.apply(this,args);};
  },prefix);
  const assertRange=async wanted=>{
    await expect.poll(()=>board.locator('[data-attack-range="true"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.cell).sort())).toEqual(wanted);
    await expect.poll(()=>page.evaluate(()=>window.__onlineAttack.range.slice().sort())).toEqual(wanted);
  };
  await guard.click();await assertRange(range(initial));
  const from=await middle(guard.locator('..')),to=await middle(page.getByTestId(target.id));await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await expect(ghost).toBeVisible();assert.deepEqual(await position(guard),initial);await assertRange(range(target));
  const ghostBox=await ghost.boundingBox();assert(Math.abs(ghostBox.x+ghostBox.width/2-to.x)<1&&Math.abs(ghostBox.y+ghostBox.height/2-to.y)<1,'ghost must track real pointer center');
  await page.screenshot({path:path.join(output,`${prefix}-online-drag-range.png`)});
  await page.mouse.move(4,4,{steps:6});await assertRange([]);const invalid=await middle(page.getByTestId(bossCells[0].id));await page.mouse.move(invalid.x,invalid.y,{steps:6});await assertRange([]);
  await page.keyboard.press('Escape');await expect(ghost).toHaveCount(0);await page.mouse.up();assert.deepEqual(await position(guard),initial);
  const originalPoint=await middle(guard.locator('..'));await page.mouse.move(originalPoint.x,originalPoint.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();await expect(ghost).toHaveCount(0);assert.deepEqual(await position(guard),{x:target.x,y:target.y});await guard.click();await assertRange(range(target));await page.keyboard.press('Escape');
  // A real legal ranged deployment makes both cat and boss attacks observable
  // quickly, without waiting for enemies to walk from the far spawn points.
  const caster=page.getByTestId(`${prefix}-cat-caster`),casterStart=await position(caster);
  const casterTarget=cells.find(cell=>cell.deployable&&!cell.occupied&&!(cell.x===target.x&&cell.y===target.y)&&bossCells.some(boss=>boss.x-cell.x>=0&&boss.x-cell.x<=3&&Math.abs(boss.y-cell.y)<=1));
  if(casterTarget){const a=await middle(caster.locator('..')),b=await middle(page.getByTestId(casterTarget.id));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();assert.deepEqual(await position(caster),{x:casterTarget.x,y:casterTarget.y});}
  await page.evaluate(prefix=>{
    const live=window.__onlineAttack,boss=document.querySelector(`[data-testid="${prefix}-boss"]`);live.paletteStrokes={};let last=false;
    const observe=()=>{const attacking=boss.getAttribute('data-boss-basic-attacking')==='true';if(attacking&&!last){const n=live.bossStarts.length;live.bossStarts.push({at:performance.now(),attacks:Number(boss.dataset.bossAttacks)});if(n===0)for(const ms of [70,120,168,240,350])setTimeout(()=>{if(live.canvas.isConnected)live.captures.push({ms,png:live.canvas.toDataURL('image/png')});},ms);}last=attacking;};
    live.observer=new MutationObserver(observe);live.observer.observe(boss,{attributes:true,attributeFilter:['data-boss-basic-attacking','data-boss-attacks']});
    const chunks=[],recorder=new MediaRecorder(live.canvas.captureStream(30),{mimeType:'video/webm;codecs=vp9'});recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};live.stop=()=>new Promise(resolve=>{recorder.onstop=async()=>resolve([...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())]);recorder.stop();live.observer.disconnect();});recorder.start();
  },prefix);
  const play=page.getByTestId(prefix==='chapter'?'chapter-start':`${prefix}-play-toggle`);await play.click();await expect(battle).toHaveAttribute('data-phase','battle');
  await page.waitForFunction(prefix=>Number(document.querySelector(`[data-testid="${prefix}-battle"]`).dataset.elapsed)>=8&&window.__onlineAttack.bossStarts.length>=2&&Object.keys(window.__onlineAttack.paletteStrokes).length>=1,prefix,{timeout:30000});
  await play.click();await expect(battle).toHaveAttribute('data-effective-speed','0');await page.screenshot({path:path.join(output,`${prefix}-online-combat.png`)});
  const video=await page.evaluate(()=>window.__onlineAttack.stop());await writeFile(path.join(output,`${prefix}-online-attacks.webm`),Buffer.from(video));
  const observed=await page.evaluate(prefix=>({bossStarts:window.__onlineAttack.bossStarts,paletteStrokes:window.__onlineAttack.paletteStrokes,captures:window.__onlineAttack.captures,elapsed:Number(document.querySelector(`[data-testid="${prefix}-battle"]`).dataset.elapsed),bossAttacks:Number(document.querySelector(`[data-testid="${prefix}-boss"]`).dataset.bossAttacks),catHp:Array.from(document.querySelectorAll(`[data-testid="${prefix}-board"] [data-status]`)).map(cat=>({id:cat.dataset.testid,hp:Number(cat.dataset.hp)}))}),prefix);
  const frames=[];for(const capture of observed.captures){const filename=`${prefix}-online-boss-${capture.ms}ms.png`;await writeFile(path.join(output,filename),Buffer.from(capture.png.split(',')[1],'base64'));frames.push({ms:capture.ms,file:filename});}delete observed.captures;
  const finalBossHp=Number(await page.getByTestId(`${prefix}-boss-health`).getAttribute('aria-valuenow'));assert(finalBossHp<initialBossHp,'Actual basic cat attacks must reduce boss HP');
  assert(observed.bossStarts.length>=2);assert(frames.length===5);return {drag:{source:initial,target:{x:target.x,y:target.y},ghostTracksPointer:true,domAndCanvasRangeMatches:true,sourcePositionUnchangedWhileHeld:true,invalidAndOutsideClear:true,cancelAndDropCorrect:true},casterDeployment:{from:casterStart,to:await position(caster)},combat:{...observed,initialBossHp,finalBossHp,frames,video:`${prefix}-online-attacks.webm`,scope:'Real short live combat and observed palette strokes; not full chapter clearance or proof that every cat style fired.'}};
}
