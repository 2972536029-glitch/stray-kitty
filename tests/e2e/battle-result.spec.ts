import {expect, test, type Page, type APIRequestContext} from '@playwright/test';
import type {GameCommand, GameState, Session} from '../../web/src/contracts';
import {playL00ThroughHost} from './l00-battle';
import {confirmBattleResult} from './battle-result';

async function openAttempt(page:Page,request:APIRequestContext,checkpoint?:string){
  const session=await(await request.post('/api/v1/sessions')).json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  let state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  async function command(value:GameCommand){
    const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':`result-setup-${session.playerId}-${state.revision}`},data:{expectedRevision:state.revision,command:value}});
    expect(response.ok()).toBe(true);state=(await response.json()).state;
  }
  if(checkpoint)await command({type:'QA_CHECKPOINT',checkpointId:checkpoint});
  else for(let i=0;state.phase==='dialogue'&&i<20;i++)await command({type:'ADVANCE_STORY',nodeId:state.storyNodeId});
  expect(state.phase).toBe('battle');
  await page.addInitScript(value=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(value)),session);
  await page.goto('/');await page.getByRole('button',{name:/^继续冒险/}).click();
  return {headers,state};
}

test('序章胜利保留彩色结束画面，确认后只结算一次并进入下一页',async({page,request})=>{
  test.setTimeout(300000);
  const {headers}=await openAttempt(page,request);
  const completions:GameCommand[]=[];
  page.on('request',req=>{if(req.url().endsWith('/api/v1/commands')&&req.method()==='POST'){const command=req.postDataJSON().command;if(command.type==='COMPLETE_BATTLE')completions.push(command);}});
  await playL00ThroughHost(page);
  expect(completions).toHaveLength(1);expect(completions[0]).toMatchObject({type:'COMPLETE_BATTLE',outcome:'won'});
  const settled=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  expect(settled.phase).toBe('settlement');expect(settled.lastResult.outcome).toBe('won');
  await page.getByRole('button',{name:/进入雨夜小巷|带伙伴回家/}).click();
  await expect(page.getByTestId('battle-result')).toHaveCount(0);
});

test('灰度失败页等待确认，响应丢失后用同一请求重试且不重复结算',async({page,request},info)=>{
  await page.setViewportSize({width:390,height:844});
  const {headers,state}=await openAttempt(page,request,'alley.battle');
  await page.getByTestId('chapter-start').click();
  await page.getByTestId('chapter-retreat').click();await page.getByTestId('chapter-confirm-retreat').click();
  const screen=page.getByTestId('battle-result'),button=page.getByTestId('battle-result-continue');
  await expect(screen).toHaveAttribute('data-outcome','lost');await expect(screen).toBeVisible();
  await page.keyboard.press('Escape');await page.waitForTimeout(700);await expect(screen).toBeVisible();
  const waiting=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  expect(waiting.activeBattle?.status).toBe('active');expect(waiting.revision).toBe(state.revision);
  expect(await screen.evaluate(node=>getComputedStyle(node).filter)).toContain('grayscale(1)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('battle-result-lost-mobile.png'),fullPage:false});
  const keys:string[]=[];
  await page.route('**/api/v1/commands',async route=>{
    if(route.request().postDataJSON().command.type!=='COMPLETE_BATTLE'){await route.continue();return;}
    keys.push(route.request().headers()['idempotency-key']);
    if(keys.length===1){
      // The server commits, but the browser loses its response. This exercises
      // the real persisted pending-command recovery path, not a second result.
      const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');
    }else await route.continue();
  });
  await button.dblclick();await expect(screen.getByRole('alert')).toBeVisible();
  expect(keys).toHaveLength(1);await expect(screen).toBeVisible();
  const committed=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  expect(committed.lastResult.outcome).toBe('lost');
  await button.click();await expect(screen).toHaveCount(0);
  expect(keys).toHaveLength(2);expect(keys[1]).toBe(keys[0]);
  const recovered=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  expect(recovered.revision).toBe(committed.revision);expect(recovered.lastResult.outcome).toBe('lost');
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
});

for(const chapter of [
  {id:'market',checkpoint:'market.battle',start:'market-play-toggle'},
  {id:'greenhouse',checkpoint:'greenhouse.battle',start:'greenhouse-play-toggle'},
  {id:'tunnel',checkpoint:'rescue.battle',start:'tunnel-play-toggle'},
  {id:'finale',checkpoint:'finale.battle',start:'finale-play-toggle'},
]){
  test(`${chapter.id} 正式战斗失败停留在结算页，点击后进入主流程`,async({page,request})=>{
    const {headers,state}=await openAttempt(page,request,chapter.checkpoint);
    if(chapter.id==='tunnel'){
      await page.getByTestId('tunnel-newcat-intro').getByRole('button',{name:'下一位',exact:true}).click();
      await page.getByTestId('tunnel-newcat-intro').getByRole('button',{name:'知道了',exact:true}).click();
    }
    await page.getByTestId(chapter.start).click();
    await page.getByTestId(`${chapter.id}-retreat`).click();await page.getByTestId(`${chapter.id}-confirm-retreat`).click();
    await expect(page.getByTestId('battle-result')).toBeVisible();
    const waiting=await(await request.get('/api/v1/state',{headers})).json() as GameState;
    expect(waiting.revision).toBe(state.revision);expect(waiting.activeBattle?.status).toBe('active');
    await confirmBattleResult(page,'lost');
    const settled=await(await request.get('/api/v1/state',{headers})).json() as GameState;
    expect(settled.lastResult.outcome).toBe('lost');expect(settled.activeBattle?.id).toBe(state.activeBattle?.id);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-phase','settlement');
  });
}
