import {expect, test, type APIRequestContext, type Locator, type Page} from '@playwright/test';
import type {GameCommand, GameState, Session} from '../../web/src/contracts';
import {playL00ThroughHost} from './l00-battle';

async function openTutorial(page:Page,request:APIRequestContext,start=true){
  page.setDefaultTimeout(10000);
  const session=await (await request.post('/api/v1/sessions')).json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  let state=await (await request.get('/api/v1/state',{headers})).json() as GameState;
  for(let i=0;state.phase==='dialogue'&&i<20;i++){
    const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':`live-guide-${state.revision}`},data:{expectedRevision:state.revision,command:{type:'ADVANCE_STORY',nodeId:state.storyNodeId} satisfies GameCommand}});
    expect(response.ok()).toBe(true);state=(await response.json()).state;
  }
  expect(state.activeBattle?.stageId).toBe('l00_tutorial');
  await page.addInitScript(value=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(value)),session);
  await page.goto('/');await page.getByRole('button',{name:/^继续冒险/}).click();
  const battle=page.locator('section[aria-label="序章塔防战斗"]');
  if(!start)return battle;
  await page.getByTestId('battle-speed-toggle').click();await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase','teach_position',{timeout:20000});
  return battle;
}

async function center(locator:Locator){
  await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();expect(box).toBeTruthy();
  return {x:box!.x+box!.width/2,y:box!.y+box!.height/2};
}

async function drag(page:Page,from:Locator,to:Locator){
  const source=await center(from),target=await center(to);
  await page.mouse.move(source.x,source.y);await page.mouse.down();
  await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();
}

async function assertFrozenRealWave(page:Page,battle:Locator){
  await expect(battle).toHaveAttribute('data-phase','teach_move',{timeout:10000});
  await expect(page.getByTestId('battle-wave-progress')).toHaveText('第 1 / 6 波');
  await expect(page.locator('.btl-live-enemy')).toHaveCount(1);
  await expect(page.locator('.btl-live-enemy').first()).toHaveAttribute('aria-label',/巡逻黑影/);
  await expect(battle).toHaveAttribute('data-effective-speed','0');
  const time=await battle.getAttribute('data-battle-time');
  const enemyPosition=await page.locator('.btl-live-enemy').first().getAttribute('style');
  await page.waitForTimeout(300);
  await expect(battle).toHaveAttribute('data-battle-time',time!);
  await expect(page.locator('.btl-live-enemy').first()).toHaveAttribute('style',enemyPosition!);
  await expect(page.getByTestId('battle-tutorial-card')).toContainText(/阻挡|黑影/);
}

async function assertRunningMoveLesson(page:Page,battle:Locator){
  await expect(battle).toHaveAttribute('data-phase','teach_live_move');
  await expect(battle).toHaveAttribute('data-effective-speed','0.5');
  const enemy=page.locator('.btl-live-enemy').first();
  const enemyPosition=await enemy.getAttribute('style');
  const time=Number(await battle.getAttribute('data-battle-time'));
  await page.waitForTimeout(450);
  expect(Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThan(time);
  await expect(enemy).not.toHaveAttribute('style',enemyPosition!);
}

async function assertCardLeavesTargetsVisible(page:Page,ids:string[]){
  const card=await page.getByTestId('battle-tutorial-card').boundingBox();expect(card).toBeTruthy();
  for(const id of ids){
    const target=await page.getByTestId(id).boundingBox();expect(target).toBeTruthy();
    const width=Math.max(0,Math.min(card!.x+card!.width,target!.x+target!.width)-Math.max(card!.x,target!.x));
    const height=Math.max(0,Math.min(card!.y+card!.height,target!.y+target!.height)-Math.max(card!.y,target!.y));
    expect(width*height/(target!.width*target!.height),`guide card covers ${id}`).toBeLessThan(0.1);
  }
}

test('序章用真实进攻教学自由部署与拖动，并对真实黑影施法',async({page,request},testInfo)=>{
  test.setTimeout(90000);
  const battle=await openTutorial(page,request,false);
  await expect(battle).toHaveAttribute('data-phase','ready');
  await page.screenshot({path:testInfo.outputPath('ready-desktop.png'),fullPage:true});
  await page.getByTestId('battle-speed-toggle').click();await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase','teach_position',{timeout:20000});
  await expect(page.getByTestId('battle-cell-B1')).toBeDisabled();
  await expect(page.getByTestId('battle-cell-B7')).toBeDisabled();
  await expect(page.getByTestId('battle-cell-A7')).toBeEnabled();
  await expect(page.getByTestId('battle-cell-C7')).toBeEnabled();
  // Use a non-recommended legal tile to prove the arrows are suggestions.
  await drag(page,page.getByTestId('battle-cat-caster'),page.getByTestId('battle-cell-C4'));
  await expect(battle).toHaveAttribute('data-phase','teach_energy');
  await expect(page.getByTestId('battle-cat-caster')).toHaveAttribute('aria-label',/，C4，/);
  await page.getByTestId('battle-begin-skill-practice').click();await assertFrozenRealWave(page,battle);
  await page.screenshot({path:testInfo.outputPath('real-wave-move-guide-desktop.png'),fullPage:true});
  await drag(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B4'));
  await assertRunningMoveLesson(page,battle);
  await page.screenshot({path:testInfo.outputPath('running-move-guide-desktop.png'),fullPage:true});
  await drag(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B5'));
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/，B5，/);
  await expect(battle).toHaveAttribute('data-phase','teach_guard_skill',{timeout:40000});
  const waveBefore=await page.getByTestId('battle-wave-progress').textContent();
  const clockBefore=await battle.getAttribute('data-battle-time');
  await page.getByTestId('battle-cat-guard').click();await page.getByTestId('battle-skill-guard').click();
  await expect(battle).toHaveAttribute('data-phase','teach_caster_skill');
  const enemy=page.locator('.btl-live-enemy[data-cell]').first();
  const target=await enemy.getAttribute('data-cell');expect(target).toBeTruthy();
  await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-skill-caster').click();
  await page.screenshot({path:testInfo.outputPath('real-target-skill-guide.png'),fullPage:true});
  await page.getByTestId(`battle-cell-${target}`).press('Enter');
  await expect(battle).toHaveAttribute('data-phase','battle');
  await expect(page.getByTestId('battle-wave-progress')).toHaveText(waveBefore!);
  expect(Number(await battle.getAttribute('data-battle-time'))).toBeGreaterThanOrEqual(Number(clockBefore));
  await expect(page.getByTestId('battle-tutorial-card')).toHaveCount(0);
  await expect(page.getByTestId('battle-open-bag')).toHaveCount(0);
  await expect(page.getByText(/练习木偶|练习木桩/)).toHaveCount(0);
});

test('新实战教学连续完成六波并通过宿主正常结算',async({page,request},testInfo)=>{
  test.setTimeout(240000);
  await openTutorial(page,request,false);
  const run=await playL00ThroughHost(page);
  await testInfo.attach('live-tutorial-six-wave-run',{body:JSON.stringify(run),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath('live-tutorial-six-wave-settlement.png'),fullPage:true});
});

test('真实战斗持续推进时可再移动另一只伙伴到非推荐格',async({page,request})=>{
  const battle=await openTutorial(page,request);
  await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-cell-A4').press('Enter');
  await page.getByTestId('battle-begin-skill-practice').click();await assertFrozenRealWave(page,battle);
  await drag(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B5'));
  await assertRunningMoveLesson(page,battle);
  const source=await center(page.getByTestId('battle-cat-caster'));
  const target=await center(page.getByTestId('battle-cell-C5'));
  await page.mouse.move(source.x,source.y);await page.mouse.down();
  // Holding the cat during this lesson must not silently pause the battlefield.
  await assertRunningMoveLesson(page,battle);
  await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(page.getByTestId('battle-cat-caster')).toHaveAttribute('aria-label',/，C5，/);
  await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/，B5，/);
});

test('提前站上推荐格时，实战换位指引会改推另一合法格',async({page,request})=>{
  const battle=await openTutorial(page,request);
  await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-cell-A4').press('Enter');
  await page.getByTestId('battle-begin-skill-practice').click();await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(battle).toHaveAttribute('data-effective-speed','0');
  await drag(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B5'));
  await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/，B5，/);
  await page.getByTestId('battle-play-toggle').click();await assertFrozenRealWave(page,battle);
  await expect(page.getByTestId('battle-cell-B4')).toHaveClass(/btl-focus/);
  await expect(page.getByTestId('battle-cell-B5')).not.toHaveClass(/btl-focus/);
  await drag(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B4'));
  await expect(battle).toHaveAttribute('data-phase','teach_live_move');
  await drag(page,page.getByTestId('battle-cat-caster'),page.getByTestId('battle-cell-C4'));
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/，B4，/);
});

test.describe('窄屏触摸引导',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true});
  test('提示卡不溢出，触摸可选择非推荐部署格并完成实战换位',async({page,request},testInfo)=>{
    const battle=await openTutorial(page,request);
    const tap=async(locator:Locator)=>{const point=await center(locator);await page.touchscreen.tap(point.x,point.y);};
    const fit=page.getByRole('button',{name:'查看全图',exact:true});if(await fit.isVisible())await fit.click();
    await expect(page.getByTestId('battle-tutorial-card')).toBeVisible();
    const card=await page.getByTestId('battle-tutorial-card').boundingBox();expect(card).toBeTruthy();
    expect(card!.x).toBeGreaterThanOrEqual(0);expect(card!.x+card!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await tap(page.getByTestId('battle-cat-caster'));await tap(page.getByTestId('battle-cell-C4'));
    await expect(battle).toHaveAttribute('data-phase','teach_energy');
    await page.getByTestId('battle-begin-skill-practice').click();await assertFrozenRealWave(page,battle);
    await assertCardLeavesTargetsVisible(page,['battle-cat-guard','battle-cell-B5']);
    await page.screenshot({path:testInfo.outputPath('real-wave-move-guide-mobile.png'),fullPage:true});
    await tap(page.getByTestId('battle-cat-guard'));await tap(page.getByTestId('battle-cell-B4'));
    await assertRunningMoveLesson(page,battle);
    await assertCardLeavesTargetsVisible(page,['battle-cat-guard','battle-cat-caster']);
    await page.screenshot({path:testInfo.outputPath('running-move-guide-mobile.png'),fullPage:true});
    await tap(page.getByTestId('battle-cat-caster'));await tap(page.getByTestId('battle-cell-A4'));
    await expect(battle).toHaveAttribute('data-phase','skill_charge');
    await expect(page.getByTestId('battle-cat-guard')).toHaveAttribute('aria-label',/，B4，/);
  });
});
