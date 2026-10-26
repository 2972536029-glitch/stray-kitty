import {expect, test, type Page} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState, Session} from '../../web/src/contracts';

const port = 8157, origin = `http://127.0.0.1:${port}`;
const cases = [{id:'low',pressure:-1},{id:'medium',pressure:0},{id:'high',pressure:1},{id:'supplies',pressure:0}] as const;
const sessions = new Map<string,Session>();
let child:ChildProcess|undefined, closed:Promise<void>|undefined, directory='';
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await (await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-l01-browser-'));
  const players:Record<string,unknown>={};
  for(const entry of cases){
    const session={playerId:`l01-${entry.id}`,token:`l01-browser-fixture-${entry.id}`};sessions.set(entry.id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'alley',storyNodeId:'',mapId:'greenhouse',flags:['alley_rescued','rescue_story_done'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,'warm-can':entry.id==='supplies'?4:0,'bouncy-treat':entry.id==='supplies'?2:0},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{shadowPressure:entry.pressure}},lastResult:{message:'独立持久化浏览器夹具：序章已完成。'}};
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY ?? path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw new Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function openFixture(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:'继续冒险'}).click();
}
const hp:Record<string,number>={caster:80,guard:240,tabby:170,hammer:190,frost:110,singer:115};
const bossFootprint=[{x:9,y:3},{x:10,y:3},{x:9,y:4},{x:10,y:4}];
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
async function snapshot(page:Page){
  return page.getByTestId('chapter-battle').evaluate(root=>({
    phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),
    boss:root.querySelector('[data-testid="chapter-boss"]')?.getAttribute('data-boss-phase'),
    cats:Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="chapter-cat-"][data-status]')).map(cat=>({id:cat.dataset.testid!.replace('chapter-cat-',''),x:Number(cat.dataset.x),y:Number(cat.dataset.y),hp:Number(cat.dataset.hp),energy:Number(cat.dataset.energy),status:cat.dataset.status})),
    cells:Array.from(root.querySelectorAll<HTMLElement>('.chapter-cell')).map(cell=>({name:cell.dataset.testid!.replace('chapter-cell-',''),x:Number(cell.dataset.cell!.split(',')[0]),y:Number(cell.dataset.cell!.split(',')[1]),danger:cell.dataset.danger==='true',enemies:Number(cell.dataset.enemies??0),deployable:cell.dataset.deployable==='true'})),
  }));
}
async function inspectOnBoard(page:Page,id:string){
  const cat=page.getByTestId(`chapter-cat-${id}`);
  await cat.click();
  await expect(page.getByTestId('chapter-cat-menu')).toBeVisible();
}
async function move(page:Page,id:string,x:number,y:number){
  if(await page.getByTestId(`chapter-cat-${id}`).getAttribute('data-status')==='resting'){
    await page.getByTestId(`chapter-redeploy-${id}`).click();
  }else{
    await inspectOnBoard(page,id);
    await page.getByTestId('chapter-move').click();
  }
  await page.getByTestId(`chapter-cell-${String.fromCharCode(65+y)}${x+1}`).press('Enter');
}
async function playVisibleControls(page:Page){
  const used=new Set<string>();let dodges=0;
  const ready=await snapshot(page);
  const initial:Record<string,{x:number;y:number}>=Object.fromEntries(ready.cats.map(cat=>[cat.id,{x:cat.x,y:cat.y}]));
  await page.getByTestId('chapter-start').click();
  await expect(page.getByTestId('chapter-cell-A5')).toHaveAttribute('data-enemies',/[1-9]/);
  await page.getByTestId('chapter-speed-toggle').click();
  const until=Date.now()+180000;
  while(await page.getByTestId('chapter-battle').count()&&Date.now()<until){
    let s=await snapshot(page);if(s.phase!=='battle')break;
    const needsMove=s.boss==='windup'?s.cats.some(cat=>cat.status==='active'&&s.cells.some(cell=>cell.danger&&cell.x===cat.x&&cell.y===cat.y)):s.cats.some(cat=>(cat.x!==initial[cat.id].x||cat.y!==initial[cat.id].y||cat.status==='resting')&&(cat.status==='active'||cat.hp>=hp[cat.id]*.5));
    if(needsMove){
      await page.getByTestId('chapter-start').click(); // A real player pause to arrange safe moves.
      for(const id of Object.keys(initial)){
        s=await snapshot(page);const cat=s.cats.find(c=>c.id===id)!;
        if(cat.status==='resting'&&cat.hp<hp[id]*.5)continue;
        if(s.boss==='windup'){
          if(!s.cells.some(c=>c.danger&&c.x===cat.x&&c.y===cat.y))continue;
          const safe=s.cells.filter(c=>c.deployable&&!c.danger&&!c.enemies&&!s.cats.some(other=>other.status==='active'&&other.x===c.x&&other.y===c.y)).sort((a,b)=>Math.abs(a.x-cat.x)+Math.abs(a.y-cat.y)-Math.abs(b.x-cat.x)-Math.abs(b.y-cat.y)||b.x-a.x)[0];
          if(safe){await move(page,id,safe.x,safe.y);dodges++;}
        }else{
          const desired=initial[id];const cell=s.cells.find(c=>c.x===desired.x&&c.y===desired.y);
          if(cell&&!cell.enemies&&(cat.x!==desired.x||cat.y!==desired.y||cat.status==='resting'))await move(page,id,desired.x,desired.y);
        }
      }
      await page.getByTestId('chapter-start').click();
    }
    if(!await page.getByTestId('chapter-battle').count())break;
    s=await snapshot(page);
    for(const id of ['singer','guard','tabby','caster','hammer','frost']){
      const cat=s.cats.find(c=>c.id===id)!;
      if(cat.status!=='active'||cat.energy<100)continue;
      if(id==='singer'&&s.cats.reduce((sum,c)=>sum+hp[c.id]-c.hp,0)<40)continue;
      await inspectOnBoard(page,id);
      const button=page.getByTestId(`chapter-skill-${id}`);if(await button.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
      await button.click();used.add(id);
      if(id==='caster'||id==='frost'){
        const score=(cell:Snapshot['cells'][number])=>s.cells.reduce((sum,enemyCell)=>sum+(Math.abs(enemyCell.x-cell.x)+Math.abs(enemyCell.y-cell.y)<=1?enemyCell.enemies:0),0)+(s.boss!=='defeated'&&bossFootprint.some(part=>Math.abs(cell.x-part.x)+Math.abs(cell.y-part.y)<=1)?1:0);
        const target=s.cells.filter(cell=>!["A6","B6","C6"].includes(cell.name)).sort((a,b)=>score(b)-score(a)||b.x-a.x)[0];
        await page.getByTestId(`chapter-cell-${target.name}`).click();
      }
      break;
    }
    await page.waitForTimeout(400);
  }
  expect(Date.now()).toBeLessThan(until);
  return {skills:[...used],dodges};
}

for(const entry of cases.filter(value=>value.id!=='supplies')){
  test(`L01 ${entry.id}: real six-cat controls complete eight waves and a fixed boss, zero-supply rewards persist`,async({page,request},info)=>{
    // 全量套件串行跑到这里时浏览器累积负载会拖慢战斗快照查询,6s 会饿死 evaluate;放宽一倍防抖。
    test.setTimeout(240000);page.setDefaultTimeout(12000);
    await openFixture(page,entry.id);
    const commands:string[]=[];page.on('request',req=>{if(req.url()===origin+'/api/v1/commands'&&req.method()==='POST')commands.push(req.postDataJSON().command.type);});
    await page.getByTestId('chapter-enter').click();
    await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('[data-testid^="chapter-cat-"][data-status]')).toHaveCount(6);
    await expect(page.locator('.chapter-roster [data-testid^="chapter-skill-"]')).toHaveCount(0);
    await expect(page.locator('.chapter-cell')).toHaveCount(30);
    await expect(page.getByTestId('chapter-boss-health')).toHaveAttribute('aria-valuemax',String(Math.round(2600*(entry.pressure===-1?.8:entry.pressure===1?1.2:1))));
    await expect(page.getByTestId('chapter-cell-A6')).toHaveAttribute('data-deployable','false');
    for(const spawn of ['A5','D12','E12']){
      await expect(page.getByTestId(`chapter-cell-${spawn}`)).toHaveAttribute('data-spawn','true');
      await expect(page.getByTestId(`chapter-cell-${spawn}`)).toHaveAttribute('data-deployable','false');
    }
    for(const cell of ['D10','D11','E10','E11']){
      await expect(page.getByTestId(`chapter-cell-${cell}`)).toHaveAttribute('data-boss-footprint','true');
      await expect(page.getByTestId(`chapter-cell-${cell}`)).toHaveAttribute('data-deployable','false');
    }
    const attempt=await page.getByTestId('chapter-battle').getAttribute('data-attempt-id');
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-attempt-id',attempt!);
    const actions=await playVisibleControls(page);
    await expect(page.getByTestId('battle-supply-rewards')).toBeVisible();
    await expect(page.getByTestId('battle-supply-rewards')).toContainText('零漏怪 1 份');
    const headers={Authorization:`Bearer ${sessions.get(entry.id)!.token}`};
    const state=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
    expect(state.lastResult.outcome).toBe('won');expect(state.lastResult.battleRewards?.perfectBonus).toBe(1);
    expect(state.lastResult.battleRewards?.baseCount).toBe(entry.pressure+3);
    expect(state.inventory['warm-can']+state.inventory['bouncy-treat']).toBe(entry.pressure+6);
    expect(commands.filter(type=>type==='START_BATTLE')).toHaveLength(1);
    expect(commands.filter(type=>type==='COMPLETE_BATTLE')).toHaveLength(1);
    expect(actions.skills.length).toBeGreaterThanOrEqual(4);expect(actions.dodges).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath(`l01-${entry.id}-won.png`),fullPage:true});
    await page.getByRole('button',{name:'带伙伴回家 →'}).click();
    await expect(page.getByTestId('chapter-enter')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
    expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).inventory).toEqual(state.inventory);
    await info.attach('real-controls-result',{contentType:'application/json',body:JSON.stringify({difficulty:entry.id,...actions,commands,rewards:state.lastResult.battleRewards})});
  });
}

test('L01 reserved supplies, pause/title, visible item use and confirmed retreat return to the correct preparation',async({page,request},info)=>{
  test.setTimeout(90000);await openFixture(page,'supplies');
  await page.getByRole('button',{name:'增加暖心罐罐'}).click();await page.getByRole('button',{name:'增加暖心罐罐'}).click();
  await page.getByRole('button',{name:'增加蹦蹦冻干'}).click();await page.getByTestId('chapter-enter').click();
  const headers={Authorization:`Bearer ${sessions.get('supplies')!.token}`};
  const reserved=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(reserved.inventory['warm-can']).toBe(2);expect(reserved.inventory['bouncy-treat']).toBe(1);
  await page.getByTestId('chapter-start').click();
  await expect.poll(async()=>Number(await page.getByTestId('chapter-cat-guard').getAttribute('data-hp'))).toBeLessThan(240);
  await page.getByTestId('chapter-bag').click();
  await expect(page.getByTestId('chapter-effective-speed')).toContainText('暂停');
  const bagTime=await page.getByTestId('chapter-battle').getAttribute('data-elapsed');
  await page.waitForTimeout(500);
  expect(await page.getByTestId('chapter-battle').getAttribute('data-elapsed')).toBe(bagTime);
  await page.getByTestId('chapter-use-guard').click();
  await page.getByTestId('chapter-item-bouncy-treat').click();await page.getByTestId('chapter-use-caster').click();
  await page.getByRole('button',{name:'关闭背包'}).click();
  await page.getByRole('button',{name:'返回标题',exact:true}).click();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(page.getByTestId('chapter-battle')).toHaveAttribute('data-attempt-id',reserved.activeBattle!.id);
  await page.getByTestId('chapter-retreat').click();await page.getByTestId('chapter-confirm-retreat').click();
  await expect(page.getByRole('button',{name:'调整防线，再试一次'})).toBeVisible();
  const ended=await(await request.get(origin+'/api/v1/state',{headers})).json() as GameState;
  expect(ended.lastResult.outcome).toBe('lost');expect(ended.lastResult.battleRewards).toBeUndefined();
  expect(ended.inventory['warm-can']).toBe(3);expect(ended.inventory['bouncy-treat']).toBe(1);
  await page.getByRole('button',{name:'调整防线，再试一次'}).click();
  await expect(page.getByTestId('chapter-enter')).toBeVisible();
  expect((await(await request.get(origin+'/api/v1/state',{headers})).json()).phase).toBe('preparation');
  await page.getByTestId('chapter-enter').click();
  expect(await page.getByTestId('chapter-battle').getAttribute('data-attempt-id')).not.toBe(reserved.activeBattle!.id);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('l01-mobile-ready.png'),fullPage:true});
});
