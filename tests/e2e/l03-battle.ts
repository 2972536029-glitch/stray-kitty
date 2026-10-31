import {confirmBattleResult} from './battle-result';
import {expect, type Page} from '@playwright/test';


const bossFootprint=[{x:5,y:2},{x:6,y:2},{x:5,y:3},{x:6,y:3}];
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
async function snapshot(page:Page){
  return page.getByTestId('greenhouse-battle').evaluateAll(roots=>{
    const root=roots[0];
    if(!root)throw new Error('greenhouse battle board is no longer mounted');
    return {
      phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),
      boss:root.querySelector('[data-testid="greenhouse-boss"]')?.getAttribute('data-boss-phase'),
      cats:Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="greenhouse-cat-"][data-status]')).map(cat=>({id:cat.dataset.testid!.replace('greenhouse-cat-',''),x:Number(cat.dataset.x),y:Number(cat.dataset.y),hp:Number(cat.dataset.hp),energy:Number(cat.dataset.energy),status:cat.dataset.status})),
      cells:Array.from(root.querySelectorAll<HTMLElement>('.greenhouse-cell')).map(cell=>({name:cell.dataset.testid!.replace('greenhouse-cell-',''),x:Number(cell.dataset.cell!.split(',')[0]),y:Number(cell.dataset.cell!.split(',')[1]),danger:cell.dataset.danger==='true',hazard:cell.dataset.hazard==='true',enemies:Number(cell.dataset.enemies??0),deployable:cell.dataset.deployable==='true'})),
    };
  });
}
function winningSettlement(page:Page){
  return page.locator('[data-testid="battle-result"][data-outcome="won"]');
}
async function inspectOnBoard(page:Page,id:string){
  await page.getByTestId(`greenhouse-cat-${id}`).click({timeout:1500});
  await expect(page.getByTestId('greenhouse-cat-menu')).toBeVisible();
}
async function move(page:Page,id:string,x:number,y:number){
  await page.keyboard.press('Escape');
  const source=page.getByTestId(`greenhouse-cat-${id}`);
  const target=page.getByTestId(`greenhouse-cell-${String.fromCharCode(65+y)}${x+1}`);
  await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
  const from=await source.boundingBox(),to=await target.boundingBox();
  expect(from).toBeTruthy();expect(to).toBeTruthy();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await page.mouse.down();
  await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:12});await page.mouse.up();
  await expect(source).toHaveAttribute('data-x',String(x));await expect(source).toHaveAttribute('data-y',String(y));
}
export async function playVisibleControls(page:Page){
  const used=new Set<string>();let dodges=0;
  const ready=await snapshot(page);
  const initial:Record<string,{x:number;y:number}>=Object.fromEntries(ready.cats.map(cat=>[cat.id,{x:cat.x,y:cat.y}]));
  await page.getByTestId('greenhouse-play-toggle').click();
  await expect(page.getByTestId('greenhouse-cell-C8')).toHaveAttribute('data-enemies',/[1-9]/);
  await page.getByTestId('greenhouse-speed-toggle').click();
  const until=Date.now()+180000;
  while(Date.now()<until){
    try {
      let s=await snapshot(page);
      if(s.phase!=='battle'){
        if(s.phase!=='won')throw new Error(`Battle ended in unexpected phase: ${s.phase}`);
        await expect(winningSettlement(page)).toBeVisible();
        break;
      }
      const needsMove=s.cats.some(cat=>cat.status==='active'&&s.cells.some(cell=>cell.danger&&cell.x===cat.x&&cell.y===cat.y))||s.cats.some(cat=>cat.status==='active'&&(cat.x!==initial[cat.id].x||cat.y!==initial[cat.id].y)&&s.cells.some(cell=>cell.x===initial[cat.id].x&&cell.y===initial[cat.id].y&&!cell.danger&&!cell.enemies));
      if(needsMove){
        await page.getByTestId('greenhouse-play-toggle').click(); // A real player pause to arrange safe moves.
        for(const id of Object.keys(initial)){
          s=await snapshot(page);const cat=s.cats.find(c=>c.id===id);
          if(!cat||cat.status!=='active')continue;
          if(s.cells.some(c=>c.danger&&c.x===cat.x&&c.y===cat.y)){
            if(!s.cells.some(c=>c.danger&&c.x===cat.x&&c.y===cat.y))continue;
            const safe=s.cells.filter(c=>c.deployable&&!c.danger&&!c.enemies&&!s.cats.some(other=>other.status==='active'&&other.x===c.x&&other.y===c.y)).sort((a,b)=>Math.abs(a.x-cat.x)+Math.abs(a.y-cat.y)-Math.abs(b.x-cat.x)-Math.abs(b.y-cat.y)||b.x-a.x)[0];
            if(safe){await move(page,id,safe.x,safe.y);dodges++;}
          }else{
            const desired=initial[id];const cell=s.cells.find(c=>c.x===desired.x&&c.y===desired.y);
            if(cell&&!cell.danger&&!cell.enemies&&(cat.x!==desired.x||cat.y!==desired.y))await move(page,id,desired.x,desired.y);
          }
        }
        await page.getByTestId('greenhouse-play-toggle').click();
      }
      s=await snapshot(page);
      for(const id of ['momo','guard','bruiser','controller','caster','tuanzi']){
        const cat=s.cats.find(c=>c.id===id);
        if(!cat||cat.status!=='active'||cat.energy<100)continue;

        await inspectOnBoard(page,id);
        const button=page.getByTestId(`greenhouse-skill-${id}`);if(await button.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
        await button.click();used.add(id);
        if(id==='caster'||id==='controller'){
          const score=(cell:Snapshot['cells'][number])=>s.cells.reduce((sum,enemyCell)=>sum+(Math.abs(enemyCell.x-cell.x)+Math.abs(enemyCell.y-cell.y)<=1?enemyCell.enemies:0),0)+(s.boss!=='defeated'&&bossFootprint.some(part=>Math.abs(cell.x-part.x)+Math.abs(cell.y-part.y)<=1)?1:0);
          const target=s.cells.filter(cell=>!["C3","D3","D4"].includes(cell.name)).sort((a,b)=>score(b)-score(a)||b.x-a.x)[0];
          await page.getByTestId(`greenhouse-cell-${target.name}`).click();
        }
        break;
      }
      await page.waitForTimeout(400);
    } catch (error) {
      // A final kill can replace the board during any pending player interaction.
      // Only an actual winning settlement permits exit; missing boards, losses and other errors still fail.
      if(await winningSettlement(page).isVisible())break;
      throw error;
    }
  }
  expect(Date.now()).toBeLessThan(until);
  await confirmBattleResult(page,'won');
  return {skills:[...used],dodges};
}
