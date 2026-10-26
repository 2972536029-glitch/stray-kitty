import {expect, type Page} from '@playwright/test';

const hp:Record<string,number>={caster:80,guard:240,tuanzi:220,diandian:140,bruiser:240,controller:110};
const bossFootprint=[{x:6,y:2}];
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
async function snapshot(page:Page){
  return page.getByTestId('market-battle').evaluate(root=>({
    phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),
    boss:root.querySelector('[data-testid="market-boss"]')?.getAttribute('data-boss-phase'),
    cats:Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="market-cat-"][data-status]')).map(cat=>({id:cat.dataset.testid!.replace('market-cat-',''),x:Number(cat.dataset.x),y:Number(cat.dataset.y),hp:Number(cat.dataset.hp),energy:Number(cat.dataset.energy),status:cat.dataset.status})),
    cells:Array.from(root.querySelectorAll<HTMLElement>('.market-cell')).map(cell=>({name:cell.dataset.testid!.replace('market-cell-',''),x:Number(cell.dataset.cell!.split(',')[0]),y:Number(cell.dataset.cell!.split(',')[1]),danger:cell.dataset.danger==='true',enemies:Number(cell.dataset.enemies??0),deployable:cell.dataset.deployable==='true'})),
  }));
}
async function inspectOnBoard(page:Page,id:string){
  const cat=page.getByTestId(`market-cat-${id}`);
  try {
    await cat.click({timeout:1500});
    await expect(page.getByTestId('market-cat-menu')).toBeVisible();
    return true;
  } catch (error) {
    // The final enemy can fall between the observed snapshot and this click.
    // A completed host replaces the board; let the caller verify the real settlement.
    if (!await page.getByTestId('market-battle').count()) return false;
    throw error;
  }
}
async function move(page:Page,id:string,x:number,y:number){
  await inspectOnBoard(page,id);await page.getByTestId('market-move').click();
  await page.getByTestId(`market-cell-${String.fromCharCode(65+y)}${x+1}`).press('Enter');
}
export async function playVisibleControls(page:Page){
  const used=new Set<string>();let dodges=0;
  const ready=await snapshot(page);
  const initial:Record<string,{x:number;y:number}>=Object.fromEntries(ready.cats.map(cat=>[cat.id,{x:cat.x,y:cat.y}]));
  await page.getByTestId('market-play-toggle').click();
  await expect(page.getByTestId('market-cell-A4')).toHaveAttribute('data-enemies',/[1-9]/);
  await page.getByTestId('market-speed-toggle').click();
  const until=Date.now()+180000;
  while(await page.getByTestId('market-battle').count()&&Date.now()<until){
    let s=await snapshot(page);if(s.phase!=='battle')break;
    const needsMove=s.boss==='windup'?s.cats.some(cat=>cat.status==='active'&&s.cells.some(cell=>cell.danger&&cell.x===cat.x&&cell.y===cat.y)):s.cats.some(cat=>cat.status==='active'&&(cat.x!==initial[cat.id].x||cat.y!==initial[cat.id].y));
    if(needsMove){
      await page.getByTestId('market-play-toggle').click(); // A real player pause to arrange safe moves.
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
      await page.getByTestId('market-play-toggle').click();
    }
    if(!await page.getByTestId('market-battle').count())break;
    s=await snapshot(page);
    for(const id of ['diandian','guard','bruiser','controller','caster','tuanzi']){
      const cat=s.cats.find(c=>c.id===id);
      if(!cat||cat.status!=='active'||cat.energy<100)continue;
      if(id==='diandian'&&s.cats.reduce((sum,c)=>sum+hp[c.id]-c.hp,0)<40)continue;
      if(!await inspectOnBoard(page,id))break;
      const button=page.getByTestId(`market-skill-${id}`);if(await button.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
      await button.click();used.add(id);
      if(id==='caster'||id==='controller'){
        const score=(cell:Snapshot['cells'][number])=>s.cells.reduce((sum,enemyCell)=>sum+(Math.abs(enemyCell.x-cell.x)+Math.abs(enemyCell.y-cell.y)<=1?enemyCell.enemies:0),0)+(s.boss!=='defeated'&&bossFootprint.some(part=>Math.abs(cell.x-part.x)+Math.abs(cell.y-part.y)<=1)?1:0);
        const target=s.cells.filter(cell=>!["A1","A2","A3","A6","A7","A8","B1","D1","E1","E2","E3","E6","E7","E8"].includes(cell.name)).sort((a,b)=>score(b)-score(a)||b.x-a.x)[0];
        await page.getByTestId(`market-cell-${target.name}`).click();
      }
      break;
    }
    await page.waitForTimeout(400);
  }
  expect(Date.now()).toBeLessThan(until);
  return {skills:[...used],dodges};
}
