import {expect, test, type APIRequestContext, type Locator, type Page} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {GameCommand, GameState, Session} from '../../web/src/contracts';

// Official QA checkpoints provide chapter access only. Energy, casts, movement
// and combat all use the real player controls and the unmodified simulation.
const port=8244, origin=`http://127.0.0.1:${port}`;
const chapters=['chapter','market','greenhouse','tunnel','finale'] as const;
const checkpoints={chapter:'alley.battle',market:'market.battle',greenhouse:'greenhouse.battle',tunnel:'rescue.battle',finale:'finale.battle'} as const;
const stageIds={chapter:'alley_rescue',market:'market_boss',greenhouse:'greenhouse_boss',tunnel:'tunnel_boss',finale:'finale_boss'} as const;
let child:ChildProcess|undefined, closed:Promise<void>|undefined;
test.beforeAll(async({request})=>{
  await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kitty-skill-feedback-'));
  const save=path.join(directory,'save.json');
  child=spawn(process.env.KITTY_FIXTURE_BINARY??path.join(process.cwd(),'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview'),[],{cwd:path.join(process.cwd(),'server'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GAME_QA_ENABLED:'true',GAME_ADDR:`127.0.0.1:${port}`,GAME_DATA_FILE:save,GAME_WEB_DIR:path.join(process.cwd(),'web/dist')}});
  closed=new Promise(resolve=>child!.once('close',()=>resolve()));
  let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);
  await expect.poll(async()=>{if(child!.exitCode!==null)throw new Error(output);try{return(await request.get(origin+'/healthz',{timeout:500})).ok();}catch{return false;}},{timeout:10000}).toBe(true);
});
test.afterAll(async()=>{if(child&&closed){const force=setTimeout(()=>child?.kill('SIGKILL'),3000);child.kill('SIGTERM');await closed;clearTimeout(force);}});

async function openChapter(page:Page,chapter:typeof chapters[number]){
  page.setDefaultTimeout(10000);
  const created=await page.request.post(origin+'/api/v1/sessions');expect(created.ok()).toBe(true);
  const session=await created.json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  const current=await page.request.get(origin+'/api/v1/state',{headers});expect(current.ok()).toBe(true);
  const state=await current.json() as GameState;
  const loaded=await page.request.post(origin+'/api/v1/commands',{headers:{...headers,'Idempotency-Key':`skill-feedback-${chapter}-${state.revision}`},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:checkpoints[chapter]} satisfies GameCommand}});
  expect(loaded.ok()).toBe(true);
  const checkpoint=(await loaded.json()).state as GameState;
  expect(checkpoint.qaCheckpointId).toBe(checkpoints[chapter]);
  expect(checkpoint.activeBattle?.stageId).toBe(stageIds[chapter]);
  await page.addInitScript(({origin,session})=>{if(location.origin===origin)localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session));},{origin,session});
  await page.goto(origin);await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
  await expect(page.getByTestId(`${chapter}-battle`)).toHaveAttribute('data-phase','ready');
}
async function openTutorial(page:Page,request:APIRequestContext){
  const session=await(await request.post('/api/v1/sessions')).json() as Session;
  const headers={Authorization:`Bearer ${session.token}`};
  let state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  for(let i=0;state.phase==='dialogue'&&i<20;i++){
    const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':`skill-guide-${state.revision}`},data:{expectedRevision:state.revision,command:{type:'ADVANCE_STORY',nodeId:state.storyNodeId} satisfies GameCommand}});
    expect(response.ok()).toBe(true);state=(await response.json()).state;
  }
  expect(state.activeBattle?.stageId).toBe('l00_tutorial');
  await page.addInitScript(value=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(value)),session);
  await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
}
async function move(page:Page,cat:Locator,cell:Locator){
  await cat.scrollIntoViewIfNeeded();const from=await cat.boundingBox(),to=await cell.boundingBox();expect(from).toBeTruthy();expect(to).toBeTruthy();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await page.mouse.down();
  await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:8});await page.mouse.up();
}

test('序章真实护盾释放保留清晰提示，暂停时视觉消退且持续盾跟随换位',async({page,request},info)=>{
  test.setTimeout(90000);await openTutorial(page,request);
  const battle=page.locator('section[aria-label="序章塔防战斗"]');
  await page.getByTestId('battle-speed-toggle').click();await page.getByTestId('battle-play-toggle').click();
  await expect(battle).toHaveAttribute('data-phase','teach_position',{timeout:20000});
  await move(page,page.getByTestId('battle-cat-caster'),page.getByTestId('battle-cell-C4'));
  await expect(battle).toHaveAttribute('data-phase','teach_energy');
  await page.getByTestId('battle-begin-skill-practice').click();
  await expect(battle).toHaveAttribute('data-phase','teach_move');
  await move(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B4'));
  await expect(battle).toHaveAttribute('data-phase','teach_live_move');
  await move(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B5'));
  await expect(battle).toHaveAttribute('data-phase','skill_charge');
  await expect(battle).toHaveAttribute('data-phase','teach_guard_skill',{timeout:40000});
  await page.getByTestId('battle-cat-guard').click();await page.getByTestId('battle-skill-guard').click();
  const castAt=Date.now();
  const release=page.getByTestId('skill-release-guard'),label=page.getByTestId('skill-label-guard');
  await expect(release).toHaveAttribute('data-skill-variant','shield');await expect(label).toContainText('护盾生效');
  await expect(page.getByTestId('skill-shield-guard')).toBeVisible();
  await expect(battle).toHaveAttribute('data-phase','teach_caster_skill');
  const time=await battle.getAttribute('data-battle-time');
  await page.waitForTimeout(250);
  await page.screenshot({path:info.outputPath('l00-shield-release.png'),fullPage:true});
  await page.waitForTimeout(Math.max(0,1000-(Date.now()-castAt)));await expect(release).toBeVisible();
  await expect(release).toHaveCount(0,{timeout:2000});
  await expect(battle).toHaveAttribute('data-battle-time',time!);
  await expect(page.getByTestId('skill-shield-guard')).toBeVisible();
  await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-skill-caster').click();
  await page.keyboard.press('Escape');await expect(page.getByTestId('skill-release-caster')).toHaveCount(0);
  await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-skill-caster').click();
  const target=await page.locator('.btl-live-enemy[data-cell]').first().getAttribute('data-cell');expect(target).toBeTruthy();
  await page.getByTestId(`battle-cell-${target}`).press('Enter');
  await expect(page.getByTestId('skill-release-caster')).toHaveAttribute('data-skill-variant','star');
  await expect(page.getByTestId('skill-release-caster').locator('[data-skill-cell]')).not.toHaveCount(0);
  await page.waitForTimeout(250);
  await page.screenshot({path:info.outputPath('l00-star-release.png'),fullPage:true});
  // The persistent shell must neither capture clicks nor stay at the old tile.
  const previous=await page.getByTestId('skill-shield-guard').getAttribute('transform');
  await move(page,page.getByTestId('battle-cat-guard'),page.getByTestId('battle-cell-B4'));
  await expect(page.getByTestId('skill-shield-guard')).not.toHaveAttribute('transform',previous!);
});

test.describe('窄屏技能反馈',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true});
  test('护盾名称保持在画面内，亮起时仍能点选猫咪',async({page},info)=>{
    test.setTimeout(60000);await openChapter(page,'market');
    // The QA checkpoint badge overlaps this setup control at mobile width.
    // Set overview by keyboard; the skill and cat interactions below use real taps/clicks.
    const fit=page.getByRole('button',{name:'查看全图',exact:true});if(await fit.isVisible())await fit.press('Enter');
    const guardName=page.getByTestId('market-cat-guard').locator('.market-unit-name');
    await expect(guardName).toBeVisible();await expect(guardName).toHaveText('斑斑');
    const nameBounds=await guardName.evaluate(node=>{
      const label=node.closest('.btl-unit-name')!.getBoundingClientRect(),cell=node.closest('[data-cell]')!.getBoundingClientRect();
      return {left:label.left-cell.left,right:cell.right-label.right};
    });
    expect(nameBounds.left).toBeGreaterThanOrEqual(-1);expect(nameBounds.right).toBeGreaterThanOrEqual(-1);
    await page.getByTestId('market-speed-toggle').click();await page.getByTestId('market-play-toggle').click();
    await expect.poll(async()=>Number(await page.getByTestId('market-cat-guard').getAttribute('data-energy')),{timeout:30000}).toBe(100);
    await page.getByTestId('market-cat-guard').click();await page.getByTestId('market-skill-guard').click();
    await expect(page.getByTestId('skill-shield-guard')).toBeVisible();
    await expect(page.getByTestId('skill-label-guard')).toBeVisible();
    const box=await page.getByTestId('skill-label-guard').boundingBox();expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
    await page.waitForTimeout(250);await page.screenshot({path:info.outputPath('market-mobile-shield.png'),fullPage:true});
    await page.getByTestId('market-cat-guard').click();await expect(page.getByTestId('market-cat-menu')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
});

const coverage={chapter:['guard','diandian','tuanzi','caster'],market:['controller','bruiser','caster'],greenhouse:['momo'],tunnel:['momo','diandian'],finale:['momo','diandian','tuanzi','guard']} as const;

test('finale: 首领预警出现时棋盘保持原位，预警中仍可点击技能',async({page})=>{
  test.setTimeout(45000);await openChapter(page,'finale');
  const board=page.locator('.finale-board');
  const before=await board.boundingBox();expect(before).toBeTruthy();
  const assertStable=async()=>{
    const current=await board.boundingBox();expect(current).toBeTruthy();
    for(const dimension of ['x','y','width','height'] as const)
      expect(Math.abs(current![dimension]-before![dimension])).toBeLessThanOrEqual(1);
  };
  await page.getByTestId('finale-speed-toggle').click();
  await page.getByTestId('finale-play-toggle').click();
  const boss=page.locator('.finale-leader-boss');
  await expect(boss).toHaveClass(/is-warning/,{timeout:30000});
  await assertStable();
  await page.getByTestId('finale-cat-guard').click();
  const skill=page.getByTestId('finale-skill-guard');
  await expect(skill).toHaveAttribute('aria-disabled','false');
  await skill.click();
  await expect(page.getByTestId('skill-release-guard')).toHaveAttribute('data-skill-variant','shield');
});

for(const chapter of chapters)test(`${chapter}: 成功技能有对应效果，取消和能量不足不产生假释放`,async({page},info)=>{
  test.setTimeout(90000);await openChapter(page,chapter);
  const battle=page.getByTestId(`${chapter}-battle`);
  const guard=page.getByTestId(`${chapter}-cat-guard`);
  // Board meters must exist on the real units, not only in unused roster styles.
  await expect(guard.locator('.btl-health')).toBeVisible();
  await expect(guard.locator('.btl-energy')).toBeVisible();
  await expect(guard.locator('.btl-energy')).toHaveAttribute('aria-valuenow','0');
  for(const label of await battle.locator('.btl-unit-name').all()){
    expect(await label.innerText()).not.toMatch(/\d/);
    const bounds=await label.evaluate(node=>{
      const labelBox=node.getBoundingClientRect(),cellBox=node.closest('[data-cell]')!.getBoundingClientRect();
      return {left:labelBox.left-cellBox.left,right:cellBox.right-labelBox.right,fontSize:parseFloat(getComputedStyle(node).fontSize)};
    });
    expect(bounds.left).toBeGreaterThanOrEqual(-1);expect(bounds.right).toBeGreaterThanOrEqual(-1);
    expect(bounds.fontSize).toBeGreaterThanOrEqual(10);
  }
  const playback=page.getByTestId(chapter==='chapter'?'chapter-start':`${chapter}-play-toggle`);
  await page.getByTestId(`${chapter}-cat-guard`).click();
  await expect(page.getByTestId(`${chapter}-skill-guard`)).toHaveAttribute('aria-disabled','true');
  // aria-disabled is intentional: the rendered control opens its explanation,
  // but the handler must not release a skill before energy is available.
  await page.getByTestId(`${chapter}-skill-guard`).click({force:true});
  await expect(page.getByTestId('skill-release-guard')).toHaveCount(0);await page.keyboard.press('Escape');
  await page.getByTestId(`${chapter}-speed-toggle`).click();await playback.click();
  await expect.poll(async()=>Number(await page.getByTestId(`${chapter}-cat-${coverage[chapter][0]}`).getAttribute('data-energy')),{timeout:35000}).toBe(100);
  const charged=page.getByTestId(`${chapter}-cat-${coverage[chapter][0]}`);
  await expect(charged).toHaveClass(/btl-energy-halo/);
  await expect(charged.locator('.btl-energy')).toHaveClass(/btl-energy-ready/);
  await expect(charged.locator('.btl-energy')).toHaveAttribute('aria-valuenow','100');
  await page.screenshot({path:info.outputPath(`${chapter}-charged-meters.png`),fullPage:true});
  for(const id of coverage[chapter]){
    await page.getByTestId(`${chapter}-cat-${id}`).click();
    await expect(page.getByTestId(`${chapter}-skill-${id}`)).toHaveAttribute('aria-disabled','false');
    await page.getByTestId(`${chapter}-skill-${id}`).click();
    if(id==='caster'||id==='controller'){
      await expect(page.getByTestId(`skill-release-${id}`)).toHaveCount(0);
      await page.keyboard.press('Escape');await expect(page.getByTestId(`skill-release-${id}`)).toHaveCount(0);
      await page.getByTestId(`${chapter}-cat-${id}`).click();await page.getByTestId(`${chapter}-skill-${id}`).click();
      await page.locator(`.${chapter}-cell[data-deployable="true"]`).first().click();
    }
    const release=page.getByTestId(`skill-release-${id}`),label=page.getByTestId(`skill-label-${id}`);
    const expectedVariant=id==='momo'?(chapter==='greenhouse'?'cleanse':'night'):{guard:'shield',diandian:'heal',tuanzi:'claw',caster:'star',bruiser:'fury',controller:'slow'}[id];
    await expect(release).toHaveAttribute('data-skill-variant',expectedVariant!);
    await expect(page.getByTestId(`${chapter}-cat-${id}`)).not.toHaveClass(/btl-energy-halo/);
    await expect(label).toBeVisible();
    expect(await release.evaluate(node=>getComputedStyle(node).pointerEvents)).toBe('none');
    if(id==='momo'||id==='guard'||id==='bruiser')await expect(page.getByTestId(`skill-shield-${id}`)).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({path:info.outputPath(`${chapter}-${id}-release.png`),fullPage:true});
    // Pausing gameplay does not strand the transient cast receipt on screen.
    await playback.click();
    await expect(battle).toHaveAttribute('data-effective-speed','0');
    await expect(release).toHaveCount(0,{timeout:3000});
    await expect(label).toHaveCount(0);
    await playback.click();
  }
});
