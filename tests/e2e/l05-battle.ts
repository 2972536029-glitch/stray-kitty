import {expect, type Page, type TestInfo} from '@playwright/test';

const initial:Record<string,{x:number;y:number}>={caster:{x:6,y:1},guard:{x:4,y:2},tuanzi:{x:7,y:3},bruiser:{x:4,y:4},diandian:{x:3,y:3},momo:{x:6,y:5}};
const maxHp:Record<string,number>={caster:80,guard:240,tuanzi:220,bruiser:240,diandian:140,momo:150,controller:140,taotao:140,yinyin:120};
const bossCells=Array.from({length:9},(_,i)=>({x:8+i%3,y:2+Math.floor(i/3)}));
const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const cellName=(p:{x:number;y:number})=>String.fromCharCode(65+p.y)+(p.x+1);
async function snapshot(page:Page){
  return page.getByTestId('finale-battle').evaluateAll(roots=>{
    const root=roots[0];if(!root)throw new Error('Finale board unmounted');
    const units=(prefix:string)=>Array.from(root.querySelectorAll<HTMLElement>(`[data-testid^="finale-${prefix}-"][data-status]`)).map(c=>({id:c.dataset.testid!.replace(`finale-${prefix}-`,''),x:Number(c.dataset.x),y:Number(c.dataset.y),hp:Number(c.dataset.hp),energy:Number(c.dataset.energy??0),status:c.dataset.status,arrivals:Number(c.dataset.arrivals??0)}));
    return {phase:root.getAttribute('data-phase'),elapsed:Number(root.getAttribute('data-elapsed')),light:Number(root.getAttribute('data-light-stage')),boss:root.querySelector('[data-testid="finale-boss"]')?.getAttribute('data-boss-phase'),cats:units('cat'),allies:units('ally'),elites:units('elite'),cells:Array.from(root.querySelectorAll<HTMLElement>('.finale-cell')).map(c=>({name:c.dataset.testid!.replace('finale-cell-',''),x:Number(c.dataset.cell!.split(',')[0]),y:Number(c.dataset.cell!.split(',')[1]),enemies:Number(c.dataset.enemies??0),deployable:c.dataset.deployable==='true',danger:c.dataset.danger==='true'}))};
  });
}
function won(page:Page){return page.locator('.app-shell[data-phase="settlement"]').getByRole('button',{name:'返回家园 →',exact:true});}
async function dragCat(page:Page,move:{id:string;x:number;y:number}){
  await page.keyboard.press('Escape');
  const source=page.getByTestId('finale-cat-'+move.id);
  const target=page.getByTestId('finale-cell-'+cellName(move));
  await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
  const from=await source.boundingBox(),to=await target.boundingBox();
  expect(from).toBeTruthy();expect(to).toBeTruthy();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await page.mouse.down();
  await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:12});await page.mouse.up();
  await expect(source).toHaveAttribute('data-x',String(move.x));await expect(source).toHaveAttribute('data-y',String(move.y));
}
function planMoves(s:Awaited<ReturnType<typeof snapshot>>){
  const danger=s.boss==='windup'?s.cells.filter(c=>c.danger):[];
  const moves:Array<{id:string;x:number;y:number}>=[];
  for(const cat of s.cats){
    if(cat.status!=='active')continue;
    let target:typeof s.cells[number]|undefined;
    const free=(c:typeof s.cells[number])=>c.deployable&&c.enemies===0&&!s.cats.some(f=>f.status==='active'&&f.id!==cat.id&&same(f,c))&&!moves.some(m=>same(m,c));
    if(danger.some(d=>same(d,cat)))target=s.cells.filter(c=>free(c)&&!c.danger).sort((a,b)=>distance(a,cat)-distance(b,cat)||distance(a,initial[cat.id])-distance(b,initial[cat.id]))[0];
    else if(s.boss!=='windup'&&!same(cat,initial[cat.id]))target=s.cells.find(c=>same(c,initial[cat.id])&&free(c));
    if(target)moves.push({id:cat.id,x:target.x,y:target.y});
  }
  return {moves,danger};
}

/** Read rendered board only; play through the same buttons and movements as a human. */
export async function playFinaleVisibleControls(page:Page,info:TestInfo){
  const skills=new Set<string>(),arrivals=new Set<string>();let dodges=0,nightVision=false,maxLight=0;
  await page.getByTestId('finale-play-toggle').click();await page.getByTestId('finale-speed-toggle').click();
  const deadline=Date.now()+320000;
  while(Date.now()<deadline){
    try{
      let s=await snapshot(page);
      if(s.phase!=='battle'){if(s.phase!=='won')throw Error(`Unexpected finale outcome ${s.phase} at ${s.elapsed}`);await expect(won(page)).toBeVisible();break;}
      maxLight=Math.max(maxLight,s.light);
      if(planMoves(s).moves.length){
        await page.getByTestId('finale-play-toggle').click();
        s=await snapshot(page);const {moves,danger}=planMoves(s);
        for(const move of moves){await dragCat(page,move);if(danger.length)dodges++;}
        await page.keyboard.press('Escape');await page.getByTestId('finale-play-toggle').click();s=await snapshot(page);
      }
      for(const ally of s.allies){if(ally.status==='waiting')continue;expect(ally.arrivals).toBe(1);if(!arrivals.has(ally.id)){arrivals.add(ally.id);await page.getByTestId('finale-play-toggle').click();await page.screenshot({path:info.outputPath(`l05-arrival-${ally.id}.png`),fullPage:true});await page.getByTestId('finale-play-toggle').click();s=await snapshot(page);}}
      for(const id of ['momo','guard','bruiser','diandian','caster','tuanzi']){
        const cat=s.cats.find(c=>c.id===id);if(!cat||cat.status!=='active'||cat.energy<100)continue;
        if(id==='diandian'&&![...s.cats,...s.allies].some(c=>c.status==='active'&&c.hp<maxHp[c.id]-40))continue;
        let target:typeof s.cells[number]|undefined;
        if(id==='caster'){
          const score=(c:typeof s.cells[number])=>s.cells.reduce((sum,e)=>sum+(distance(e,c)<=1?3*e.enemies:0),0)+s.elites.reduce((sum,e)=>sum+(e.hp>0&&distance(e,c)<=1?2:0),0)+(s.boss!=='defeated'&&bossCells.some(b=>distance(b,c)<=1)?1:0);
          target=s.cells.filter(c=>!['A4','A5','B2','B3','B11','B12','C1','C7','D1','E1','E7','F2','F3','F11','F12','G4','G5'].includes(c.name)).sort((a,b)=>score(b)-score(a))[0];if(!target||score(target)===0)continue;
        }
        await page.getByTestId('finale-cat-'+id).click();const skill=page.getByTestId('finale-skill-'+id);
        if(await skill.getAttribute('aria-disabled')==='true'){await page.keyboard.press('Escape');continue;}
        await skill.click();if(target)await page.getByTestId('finale-cell-'+target.name).click();
        skills.add(id);if(id==='momo'){nightVision=true;expect(Number(await page.getByTestId('finale-battle').getAttribute('data-night-vision-remaining'))).toBeGreaterThan(0);}
        await page.keyboard.press('Escape');break;
      }
      await page.waitForTimeout(200);
    }catch(error){if(await won(page).isVisible())break;throw error;}
  }
  expect(Date.now()).toBeLessThan(deadline);expect(arrivals.size).toBe(3);expect(dodges).toBeGreaterThan(0);expect(maxLight).toBe(3);expect(nightVision).toBe(true);
  return {skills:[...skills],arrivals:[...arrivals],dodges,nightVision,maxLight};
}
