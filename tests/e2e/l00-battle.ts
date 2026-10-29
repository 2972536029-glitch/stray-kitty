import {expect, type Locator, type Page} from '@playwright/test';
const selector = 'section[aria-label="序章塔防战斗"]';
export type L00Run = {waves:number[];guardSkills:number;casterSkills:number};
const phase = async(b:Locator,p:string)=>expect(b).toHaveAttribute('data-phase',p,{timeout:30000});
async function reading(cat:Locator){const s=await cat.evaluateAll(n=>n[0]?.getAttribute('aria-label'));return s?{energy:Number(s.match(/能量 (\d+)/)?.[1]??0),blocked:Number(s.match(/阻挡 (\d+)/)?.[1]??0)}:undefined;}
async function cast(page:Page,id:'guard'|'caster',target='B5'){
 await page.getByTestId(`battle-cat-${id}`).click();const skill=page.getByTestId(`battle-skill-${id}`);
 if(await skill.getAttribute('aria-disabled')==='true'){await page.getByTestId('battle-close-cat-menu').click();return false;}
 await skill.click();if(id==='caster'){await expect(page.getByTestId('battle-skill-aim')).toBeVisible();await page.getByTestId(`battle-cell-${target}`).press('Enter');await expect(page.getByTestId('battle-skill-aim')).toHaveCount(0);}return true;
}
/** Actual tutorial controls, without injecting combat state. */
export async function completeL00Tutorial(page:Page,battle:Locator){
 const waves:number[]=[];
 const recordWave=async()=>{const label=await page.getByTestId('battle-wave-progress').textContent();const wave=Number(label?.match(/第\s*(\d+)\s*\//)?.[1]);if(wave&&!waves.includes(wave))waves.push(wave);};
 await phase(battle,'ready');await expect(page.getByTestId('battle-open-bag')).toHaveCount(0);
 await page.getByTestId('battle-speed-toggle').click();await page.getByTestId('battle-play-toggle').click();
 await phase(battle,'teach_position');await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-cell-A4').press('Enter');
 await phase(battle,'teach_energy');await page.getByTestId('battle-begin-skill-practice').click();
 await phase(battle,'teach_move');await recordWave();await page.getByTestId('battle-cat-guard').click();await page.getByTestId('battle-cell-B5').press('Enter');
 await phase(battle,'teach_live_move');await expect(battle).toHaveAttribute('data-effective-speed','0.5');
 await page.getByTestId('battle-cat-caster').click();await page.getByTestId('battle-cell-C4').press('Enter');
 await phase(battle,'skill_charge');
 // Energy now accumulates against real wave enemies. The lessons may span waves;
 // never assume skill practice resets combat back to the beginning of wave one.
 await expect.poll(async()=>{await recordWave();return battle.getAttribute('data-phase');},{timeout:30000}).toBe('teach_guard_skill');
 expect(await cast(page,'guard')).toBe(true);
 await phase(battle,'teach_caster_skill');
 const target=await page.locator('.btl-live-enemy[data-cell]').first().getAttribute('data-cell');expect(target).toBeTruthy();
 expect(await cast(page,'caster',target!)).toBe(true);
 await phase(battle,'battle');await expect(page.getByTestId('battle-open-bag')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/重整|重新上阵/})).toHaveCount(0);
 await recordWave();return waves;
}
async function frozen(page:Page,battle:Locator){
 await expect(battle).toHaveAttribute('data-effective-speed','0');const t=await battle.getAttribute('data-battle-time'),e=await page.getByTestId('battle-energy-guard-compact').getAttribute('aria-valuenow');
 await page.waitForTimeout(350);await expect(battle).toHaveAttribute('data-battle-time',t!);await expect(page.getByTestId('battle-energy-guard-compact')).toHaveAttribute('aria-valuenow',e!);
}
async function checkPause(page:Page,battle:Locator){
 await page.getByRole('button',{name:'暂停',exact:true}).click();await frozen(page,battle);await page.locator('.pause-label').getByRole('button',{name:'继续旅程'}).click();
 await page.getByRole('button',{name:'章节地图'}).click();await frozen(page,battle);await page.keyboard.press('Escape');
 const old=await battle.elementHandle();await page.getByRole('button',{name:'返回标题'}).click();await expect(page.getByRole('button',{name:'继续冒险'})).toBeVisible();await frozen(page,battle);
 await page.getByRole('button',{name:'继续冒险'}).click();expect(await old!.evaluate((node,css)=>node===document.querySelector(css),selector)).toBe(true);await old!.dispose();
}
/** Defend six waves using earned energy; no supplies, revival or wave resets. */
export async function playL00ThroughHost(page:Page):Promise<L00Run>{
 const battle=page.locator(selector);const tutorialWaves=await completeL00Tutorial(page,battle);await checkPause(page,battle);
 const run:L00Run={waves:tutorialWaves,guardSkills:0,casterSkills:0},deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const s=await battle.evaluateAll(n=>n[0]?{phase:n[0].getAttribute('data-phase'),wave:n[0].querySelector('[data-testid="battle-wave-progress"]')?.textContent??''}:undefined);
  if(!s)break;expect(['battle','won']).toContain(s.phase);const w=Number(s.wave.match(/第\s*(\d+)\s*\//)?.[1]);if(w&&!run.waves.includes(w))run.waves.push(w);if(s.phase==='won')break;
  const g=await reading(page.getByTestId('battle-cat-guard')),c=await reading(page.getByTestId('battle-cat-caster'));
  if(g&&g.energy>=100&&g.blocked>0&&await cast(page,'guard'))run.guardSkills++;
  if(c&&c.energy>=100&&(g?.blocked??0)>0&&await cast(page,'caster'))run.casterSkills++;
  await page.waitForTimeout(300);
 }
 expect(Date.now()).toBeLessThan(deadline);await expect(battle).toHaveCount(0);await expect(page.getByRole('button',{name:/进入雨夜小巷|带伙伴回家/})).toBeVisible();
 expect(run.waves).toEqual([1,2,3,4,5,6]);expect(run.guardSkills).toBeGreaterThan(0);expect(run.casterSkills).toBeGreaterThan(0);return run;
}
