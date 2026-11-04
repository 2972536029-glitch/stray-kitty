import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import type {GameState} from '../../web/src/contracts';
import {FURNITURE_CATEGORIES} from '../../web/src/modules/home/furnishings';
import {homeInventory} from '../../web/src/modules/home/objects';
import {HOME_FRAMES,HOME_ATLASES} from '../../web/src/modules/home/assets';

const canvas=(page:Page)=>page.locator('.game-viewport canvas');
async function openHome(page:Page,request:APIRequestContext){
  await page.addInitScript(()=>{localStorage.setItem('stray-kitty.tutorial.home','done');localStorage.setItem('stray-kitty.hud.topbar','expanded');});
  await page.goto('/');await expect(page.getByRole('button',{name:/^(开始冒险|继续冒险)/})).toBeVisible();
  const token=await page.evaluate(()=>JSON.parse(localStorage.getItem('stray-kitty.session.v1')!).token),headers={Authorization:`Bearer ${token}`};
  const state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
  const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':crypto.randomUUID()},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:'greenhouse.home_3'}}});
  expect(response.ok(),await response.text()).toBe(true);
  await page.reload();await page.getByRole('button',{name:'继续冒险'}).click();
  await expect(canvas(page)).toHaveAttribute('data-home-artwork','ready');
  return headers;
}
async function screenPoint(page:Page,x:number,y:number){
  return canvas(page).evaluate((element:HTMLCanvasElement,{x,y})=>{
    const v=JSON.parse(element.dataset.homeCamera!),r=element.getBoundingClientRect(),w=Number(element.dataset.logicalWidth),h=Number(element.dataset.logicalHeight);
    const scale=(getComputedStyle(element).objectFit==='cover'?Math.max:Math.min)(r.width/w,r.height/h);
    return{x:r.x+(r.width-w*scale)/2+(v.x+x*v.scale)*scale,y:r.y+(r.height-h*scale)/2+(v.y+y*v.scale)*scale};
  },{x,y});
}
test('advisor is a draggable resident; clicking it opens home chat without changing the companion save',async({page,request},info)=>{
  const headers=await openHome(page,request),before=await(await request.get('/api/v1/state',{headers})).json();
  const residents=async()=>JSON.parse((await canvas(page).getAttribute('data-home-cats'))!) as {breed:string;hitX:number;hitY:number;x:number;y:number}[];
  await expect.poll(async()=>(await residents()).some(c=>c.breed==='advisor')).toBe(true);
  const advisor=(await residents()).find(c=>c.breed==='advisor')!,from=await screenPoint(page,advisor.hitX,advisor.hitY),to=await screenPoint(page,720,540);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();
  await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-home-interaction'))!).breed).toBe('advisor');
  const moved=(await residents()).find(c=>c.breed==='advisor')!,hit=await screenPoint(page,moved.hitX,moved.hitY);await page.mouse.click(hit.x,hit.y);
  await expect(page.getByRole('dialog',{name:'阿策 · 花房问答',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'阿策 · 花房问答',exact:true})).toHaveCount(0);
  expect((await(await request.get('/api/v1/state',{headers})).json()).cats).toEqual(before.cats);
  await page.screenshot({path:info.outputPath('home-residents.png')});
});

test('every furnishing is categorized and filters compose with location and search',async({page,request},info)=>{
  await openHome(page,request);await page.getByRole('button',{name:'布置家具',exact:true}).click();
  const bag=page.getByRole('region',{name:'家具背包 · 布置模式'}),group=bag.getByRole('group',{name:'家具分类'});
  await bag.getByRole('tab',{name:/全部/}).click();
  const total=await bag.locator('.backpack-item').count();let categorized=0;
  for(const label of Object.values(FURNITURE_CATEGORIES)){
    await group.getByRole('button',{name:new RegExp(`^${label} `)}).click();categorized+=await bag.locator('.backpack-item').count();
    const names=await bag.locator('.backpack-item small').allTextContents();expect(names.every(name=>name.startsWith(label))).toBe(true);
  }
  expect(categorized).toBe(total);
  await group.getByRole('button',{name:/^小窝 /}).click();await bag.getByLabel('搜索家具').fill('猫窝');
  await expect(bag.locator('.backpack-item')).toHaveCount(1);await expect(bag.locator('.backpack-item')).toContainText('纸箱猫窝');
  await bag.getByLabel('搜索家具').clear();await group.getByRole('button',{name:/^全部分类/}).click();
  await page.screenshot({path:info.outputPath('furniture-categories.png')});
});

test('measured sprite reference sheet uses one scale for every collected and stage furnishing',async({page,request},info)=>{
  await openHome(page,request);
  const content=await(await request.get('/api/v1/content')).json(),owned=content.furniture.map((f:{id:string})=>f.id);
  const rows=[...[[],['greenhouse_sealed'],['greenhouse_fortified_full'],['kingdom_founded']].flatMap(flags=>homeInventory({flags,placements:{}})),
    ...homeInventory({flags:['greenhouse_fortified_full'],placements:{},furniture:owned}).filter(item=>item.furnitureId)];
  const unique=[...new Map(rows.map(row=>[row.sprite,row])).values()];
  for(let part=0;part<Math.ceil(unique.length/24);part++){
    const entries=unique.slice(part*24,(part+1)*24).map(item=>({name:content.furniture.find((f:{id:string})=>f.id===item.furnitureId)?.name??item.name,
      width:item.width,frame:HOME_FRAMES[item.sprite],url:HOME_ATLASES[HOME_FRAMES[item.sprite].sheet],category:FURNITURE_CATEGORIES[item.category]}));
    await page.evaluate(async entries=>{
      document.body.innerHTML='<canvas id="sheet" width="1440" height="1200"></canvas>';
      const c=document.querySelector<HTMLCanvasElement>('#sheet')!,ctx=c.getContext('2d')!;document.body.style.cssText='margin:0;background:#f6efd9;overflow:auto';
      ctx.fillStyle='#f6efd9';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
      for(const [index,item]of entries.entries()){
        const image=new Image();image.src=item.url;await image.decode();const x=(index%6)*240,y=Math.floor(index/6)*300,f=item.frame;
        ctx.strokeStyle='#d9caae';ctx.strokeRect(x+6,y+6,228,285);const scale=.65,w=item.width*scale,h=w*f.height/f.width;
        const fit=Math.min(1,210/Math.max(h,1));ctx.drawImage(image,f.x,f.y,f.width,f.height,x+120-w*fit/2,y+236-h*fit,w*fit,h*fit);
        ctx.fillStyle='#5d6851';ctx.fillRect(x+18,y+202,26,34);ctx.fillRect(x+14,y+196,34,20);ctx.fillRect(x+17,y+191,7,8);ctx.fillRect(x+38,y+191,7,8);
        ctx.font='13px sans-serif';ctx.fillStyle='#4d493e';ctx.fillText(item.name,x+12,y+260);ctx.font='11px sans-serif';ctx.fillText(`${item.category} · ${Math.round(item.width/1.7)} cm${fit<1?' · 长挂饰缩览':''}`,x+12,y+279);
      }
    },entries);
    await page.locator('#sheet').screenshot({path:info.outputPath(`furniture-scale-${part+1}.png`)});
  }
});
