import {expect, type Page} from '@playwright/test';

const hp:Record<string,number>={caster:80,guard:240,tuanzi:220,diandian:140};
const bossFootprint=[{x:7,y:3},{x:8,y:3},{x:7,y:4},{x:8,y:4}];
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
async function snapshot(page:Page){
  return page.getByTestId('chapter-battle').evaluateAll(roots=>{
    const root=roots[0];
    if(!root)throw new Error('chapter battle board is no longer mounted');
    return {
      phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),
      boss:root.querySelector('[data-testid="chapter-boss"]')?.getAttribute('data-boss-phase'),
      cats:Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="chapter-cat-"][data-status]')).map(cat=>({id:cat.dataset.testid!.replace('chapter-cat-',''),x:Number(cat.dataset.x),y:Number(cat.dataset.y),hp:Number(cat.dataset.hp),energy:Number(cat.dataset.energy),status:cat.dataset.status})),
      cells:Array.from(root.querySelectorAll<HTMLElement>('.chapter-cell')).map(cell=>({name:cell.dataset.testid!.replace('chapter-cell-',''),x:Number(cell.dataset.cell!.split(',')[0]),y:Number(cell.dataset.cell!.split(',')[1]),danger:cell.dataset.danger==='true',enemies:Number(cell.dataset.enemies??0),deployable:cell.dataset.deployable==='true'})),
    };
  });
}
function winningSettlement(page:Page){
  return page.locator('.app-shell[data-phase="settlement"]').getByRole('button',{name:'带伙伴回家 →',exact:true});
}
async function inspectOnBoard(page:Page,id:string){
  await page.getByTestId(`chapter-cat-${id}`).click({timeout:1500});
  await expect(page.getByTestId('chapter-cat-menu')).toBeVisible();
}
async function move(page:Page,id:string,x:number,y:number){
  await inspectOnBoard(page,id);await page.getByTestId('chapter-move').click();
  await page.getByTestId(`chapter-cell-${String.fromCharCode(65+y)}${x+1}`).press('Enter');
}
export async function playVisibleControls(page:Page){
  const used=new Set<string>();let dodges=0;
  const ready=await snapshot(page);
  const initial:Record<string,{x:number;y:number}>=Object.fromEntries(ready.cats.map(cat=>[cat.id,{x:cat.x,y:cat.y}]));
  await page.getByTestId('chapter-start').click();
  await expect(page.getByTestId('chapter-cell-A4')).toHaveAttribute('data-enemies',/[1-9]/);
  await page.getByTestId('chapter-speed-toggle').click();
  const until=Date.now()+180000;
  while(Date.now()<until){
    try {
      let s=await snapshot(page);
      if(s.phase!=='battle'){
        if(s.phase!=='won')throw new Error(`Battle ended in unexpected phase: ${s.phase}`);
        await expect(winningSettlement(page)).toBeVisible();
        break;
      }
      const needsMove=s.boss==='windup'?s.cats.some(cat=>cat.status==='active'&&s.cells.some(cell=>cell.danger&&cell.x===cat.x&&cell.y===cat.y)):s.cats.some(cat=>cat.status==='active'&&(cat.x!==initial[cat.id].x||cat.y!==initial[cat.id].y));
      if(needsMove){
        await page.getByTestId('chapter-start').click(); // A real player pause to arrange safe moves.
        for(const id of Object.keys(initial)){
          s=await snapshot(page);const cat=s.cats.find(c=>c.id===id);
          if(!cat||cat.status!=='active')continue;
          if(s.boss==='windup'){
            if(!s.cells.some(c=>c.danger&&c.x===cat.x&&c.y===cat.y))continue;
            const safe=s.cells.filter(c=>c.deployable&&!c.danger&&!c.enemies&&!s.cats.some(other=>other.status==='active'&&other.x===c.x&&other.y===c.y)).sort((a,b)=>Math.abs(a.x-cat.x)+Math.abs(a.y-cat.y)-Math.abs(b.x-cat.x)-Math.abs(b.y-cat.y)||b.x-a.x)[0];
            if(safe){await move(page,id,safe.x,safe.y);dodges++;}
          }else{
            const desired=initial[id];const cell=s.cells.find(c=>c.x===desired.x&&c.y===desired.y);
            if(cell&&!cell.enemies&&(cat.x!==desired.x||cat.y!==desired.y))await move(page,id,desired.x,desired.y);
          }
        }
        await page.getByTestId('chapter-start').click();
      }
      s=await snapshot(page);
      for(const id of ['diandian','guard','caster','tuanzi']){
        const cat=s.cats.find(c=>c.id===id);
        if(!cat||cat.status!=='active'||cat.energy<100)continue;
        if(id==='diandian'&&s.cats.reduce((sum,c)=>sum+hp[c.id]-c.hp,0)<40)continue;
        await inspectOnBoard(page,id);
        const button=page.getByTestId(`chapter-skill-${id}`);if(await button.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
        await button.click();used.add(id);
        if(id==='caster'){
          const score=(cell:Snapshot['cells'][number])=>s.cells.reduce((sum,enemyCell)=>sum+(Math.abs(enemyCell.x-cell.x)+Math.abs(enemyCell.y-cell.y)<=1?enemyCell.enemies:0),0)+(s.boss!=='defeated'&&bossFootprint.some(part=>Math.abs(cell.x-part.x)+Math.abs(cell.y-part.y)<=1)?1:0);
          const target=s.cells.filter(cell=>!["A5","B5","C5"].includes(cell.name)).sort((a,b)=>score(b)-score(a)||b.x-a.x)[0];
          await page.getByTestId(`chapter-cell-${target.name}`).click();
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
  return {skills:[...used],dodges};
}

