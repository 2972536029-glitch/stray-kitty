import {confirmBattleResult} from './battle-result';
import {expect, type Page, type TestInfo} from '@playwright/test';

const bossFootprint=[{x:5,y:2},{x:6,y:2},{x:5,y:3},{x:6,y:3}];
async function snapshot(page:Page){
  return page.getByTestId('tunnel-battle').evaluateAll(roots=>{
    const root=roots[0];if(!root)throw new Error('tunnel board is no longer mounted');
    return {
      phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),
      dark:root.getAttribute('data-darkened')==='true',
      boss:root.querySelector('[data-testid="tunnel-boss"]')?.getAttribute('data-boss-phase'),
      cats:Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="tunnel-cat-"][data-status]')).map(cat=>({id:cat.dataset.testid!.replace('tunnel-cat-',''),x:Number(cat.dataset.x),y:Number(cat.dataset.y),hp:Number(cat.dataset.hp),energy:Number(cat.dataset.energy),status:cat.dataset.status})),
      cells:Array.from(root.querySelectorAll<HTMLElement>('.tunnel-cell')).map(cell=>({name:cell.dataset.testid!.replace('tunnel-cell-',''),x:Number(cell.dataset.cell!.split(',')[0]),y:Number(cell.dataset.cell!.split(',')[1]),enemies:Number(cell.dataset.enemies??0),deployable:cell.dataset.deployable==='true'})),
    };
  });
}
function winningSettlement(page:Page){return page.locator('[data-testid="battle-result"][data-outcome="won"]');}

/** Only rendered information and player controls: no access to engine state, energy or HP writes. */
export async function playVisibleControls(page:Page,info:TestInfo){
  const used=new Set<string>();let observedBlackout=false,restoredNightVision=false;
  await page.getByTestId('tunnel-play-toggle').click();
  await expect(page.getByTestId('tunnel-cell-B8')).toHaveAttribute('data-enemies',/[1-9]/);
  await page.getByTestId('tunnel-speed-toggle').click();
  const until=Date.now()+230000;
  while(Date.now()<until){
    try{
      let s=await snapshot(page);
      if(s.phase!=='battle'){
        if(s.phase!=='won')throw new Error(`Unexpected battle outcome: ${s.phase}`);
        await expect(winningSettlement(page)).toBeVisible();break;
      }
      if(s.dark&&!observedBlackout){
        await page.getByTestId('tunnel-play-toggle').click();
        await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-darkened','true');
        const frozen=await snapshot(page);
        for(const cat of frozen.cats)await expect(page.getByTestId('tunnel-cat-'+cat.id)).toBeVisible();
        await expect(page.getByTestId('tunnel-cell-C2')).toBeVisible();
        await page.waitForTimeout(250);expect((await snapshot(page)).elapsed).toBe(frozen.elapsed);
        await page.screenshot({path:info.outputPath('l04-blackout.png'),fullPage:true});
        observedBlackout=true;
        await page.getByTestId('tunnel-play-toggle').click();s=await snapshot(page);
      }
      for(const id of ['momo','diandian','guard','bruiser','caster','tuanzi']){
        const cat=s.cats.find(c=>c.id===id);if(!cat||cat.status!=='active'||cat.energy<100)continue;
        // Save the first night vision until a real blackout, then use it reactively.
        if(id==='momo'&&!s.dark)continue;
        if(id==='diandian'&&!s.cats.some(c=>c.status==='active'&&c.hp<({caster:80,guard:240,tuanzi:220,bruiser:240,diandian:140,momo:150} as Record<string,number>)[c.id]-55))continue;
        await page.getByTestId('tunnel-cat-'+id).click({timeout:1500});
        const skill=page.getByTestId('tunnel-skill-'+id);
        if(await skill.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
        await skill.click();used.add(id);
        if(id==='caster'){
          const score=(cell:typeof s.cells[number])=>s.cells.reduce((sum,enemy)=>sum+(Math.abs(enemy.x-cell.x)+Math.abs(enemy.y-cell.y)<=1?enemy.enemies:0),0)+(s.boss!=='defeated'&&bossFootprint.some(part=>Math.abs(cell.x-part.x)+Math.abs(cell.y-part.y)<=1)?1:0);
          const target=s.cells.filter(c=>!['A3','A7','A8','B2','C8','D1','D2','E7','E8'].includes(c.name)).sort((a,b)=>score(b)-score(a)||b.x-a.x)[0];
          await page.getByTestId('tunnel-cell-'+target.name).click();
        }
        if(id==='momo'&&!restoredNightVision){
          await expect(page.getByTestId('tunnel-battle')).toHaveAttribute('data-darkened','false');
          expect(Number(await page.getByTestId('tunnel-battle').getAttribute('data-night-vision-remaining'))).toBeGreaterThan(0);
          await page.screenshot({path:info.outputPath('l04-night-vision.png'),fullPage:true});
          restoredNightVision=true;
        }
        break;
      }
      await page.waitForTimeout(400);
    }catch(error){if(await winningSettlement(page).isVisible())break;throw error;}
  }
  expect(Date.now()).toBeLessThan(until);
  expect(observedBlackout).toBe(true);expect(restoredNightVision).toBe(true);
  await confirmBattleResult(page,'won');
  return {skills:[...used],observedBlackout,restoredNightVision};
}
