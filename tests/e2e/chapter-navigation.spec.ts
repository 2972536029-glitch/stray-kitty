import {expect,test,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameState,Session} from '../../web/src/contracts';

const port=8159,origin=`http://127.0.0.1:${port}`;
const ids=['routes','chapter3-story','chapter3-trial','finale-story','finale-trial'] as const;
const sessions=new Map<string,Session>();
let child:ChildProcess|undefined,closed:Promise<void>|undefined,directory='';

test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const catalog=await(await request.get('/api/v1/content')).json();
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-nav-browser-'));
  const players:Record<string,unknown>={};
  for(const id of ids){
    const session={playerId:`nav-${id}`,token:`nav-browser-${id}`};sessions.set(id,session);
    const state:GameState={schemaVersion:1,contentVersion:catalog.version,revision:1,phase:'home',chapterId:'market',storyNodeId:'',mapId:'market',flags:['l00_completed','alley_rescued','rescue_story_done','chapter_2_started','market_cleared','market_exit_crossed','tunnel_explored','cats_rescued_batch1','momo_joined','greenhouse_fortified','chapter_4_started'],cats:['miaomiao','tuanzi','diandian'],inventory:{material:3,food:0,clue:3,'warm-can':4,'bouncy-treat':2},currencies:{stamp:2},furniture:['cardboard_nest'],placements:{},completedStages:['l00_tutorial','alley_rescue'],pendingEventId:'',activeBattle:null,eventState:{pendingModifiers:{}},lastResult:{message:'Navigation fixture.'}};
    if(id==='chapter3-trial')state.flags.push('chapter_3_started');
    players[createHash('sha256').update(session.token).digest('hex')]={id:session.playerId,state,receipts:{},receiptOrder:[]};
  }
  const save=path.join(directory,'save.json');fs.writeFileSync(save,JSON.stringify({schemaVersion:1,players}));
  child=spawn(process.env.KITTY_FIXTURE_BINARY??path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw new Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});

test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function openFixture(page:Page,id:string){
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session:sessions.get(id)!});
  await page.goto(origin);await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
}

test('Chapter Route labels Chapter 3 and finale as unavailable exploration maps',async({page})=>{
  await openFixture(page,'routes');
  await page.getByRole('button',{name:'章节地图'}).click();
  const route=page.getByRole('dialog',{name:'猫爪地图'});
  await expect(route).toContainText('第三章剧情与独立战斗试玩；探索地图尚未开放');
  await expect(route.getByRole('button',{name:'前往废弃花房剧情'})).toBeVisible();
  await expect(route).toContainText('终章剧情与战斗试玩；探索地图尚未开放');
  await expect(route.getByRole('button',{name:'前往总仓库'})).toHaveCount(0);
});

test('Chapter 3 Home action starts story dialogue while its trial remains a separate battle',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('chapter3-story')!.token}`};
  await openFixture(page,'chapter3-story');
  await page.getByRole('button',{name:/启程：第三章剧情/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,phase:state.phase,storyNodeId:state.storyNodeId}))).toEqual({chapterId:'greenhouse',phase:'dialogue',storyNodeId:'greenhouse_intro_1'});
  const trialHeaders={Authorization:`Bearer ${sessions.get('chapter3-trial')!.token}`};
  await openFixture(page,'chapter3-trial');
  await page.getByTestId('greenhouse-enter').click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers:trialHeaders})).json() as Promise<GameState>).then(state=>({phase:state.phase,stageId:state.activeBattle?.stageId}))).toEqual({phase:'battle',stageId:'greenhouse_boss'});
  await expect(page.getByTestId('greenhouse-battle')).toHaveAttribute('data-scene','greenhouse');
});

test('Finale Home action stays story entry and the trial button starts only finale_boss',async({page,request})=>{
  const headers={Authorization:`Bearer ${sessions.get('finale-story')!.token}`};
  await openFixture(page,'finale-story');
  await page.getByRole('button',{name:/启程：终章剧情/}).click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers})).json() as Promise<GameState>).then(state=>({chapterId:state.chapterId,phase:state.phase,storyNodeId:state.storyNodeId}))).toEqual({chapterId:'finale',phase:'dialogue',storyNodeId:'finale_intro_1'});
  const trialHeaders={Authorization:`Bearer ${sessions.get('finale-trial')!.token}`};
  await openFixture(page,'finale-trial');
  await page.getByTestId('finale-enter').click();
  await expect.poll(async()=>((await request.get(origin+'/api/v1/state',{headers:trialHeaders})).json() as Promise<GameState>).then(state=>({phase:state.phase,stageId:state.activeBattle?.stageId}))).toEqual({phase:'battle',stageId:'finale_boss'});
  await expect(page.locator('[data-testid="finale-battle"]')).toBeVisible();
});
