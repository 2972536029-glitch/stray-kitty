import {expect,test} from '@playwright/test';
import {statSync} from 'node:fs';
import type {GameState,Session} from '../../web/src/contracts';

const shared=['floor-material-atlas','scene-refined-materials-v1','scene-small-accents-v1','scene-perimeter-foreground-v1'];
const cases=[
  {checkpoint:'greenhouse.battle',scene:'greenhouse',sheets:[...shared,'scene-detailed-obstacles-v1','scene-chapter-backwalls-v1','scene-detailed-residences-garden-v1']},
  {checkpoint:'rescue.battle',scene:'tunnel',sheets:[...shared,'scene-tunnel-fixtures-v3','scene-chapter-backwalls-v1','scene-tunnel-tool-cache-v2']},
  {checkpoint:'finale.battle',scene:'finale',sheets:[...shared,'finale-room-scene-v1','scene-warehouse-fixtures-v4','scene-warehouse-roll-pallet-v1','scene-warehouse-storage-rack-v1','scene-warehouse-pallet-jack-v1','scene-warehouse-pipe-cradle-v1']},
];

for(const entry of cases)for(const fallback of [false,true]){
  test(`${entry.scene} paints ${fallback?'original PNG fallback':'smaller lossless artwork'} without preloading exploration maps`,async({page,request},info)=>{
    const session=await(await request.post('/api/v1/sessions')).json() as Session;
    const headers={Authorization:`Bearer ${session.token}`};
    const state=await(await request.get('/api/v1/state',{headers})).json() as GameState;
    const response=await request.post('/api/v1/commands',{headers:{...headers,'Idempotency-Key':'battle-artwork-loading'},data:{expectedRevision:state.revision,command:{type:'QA_CHECKPOINT',checkpointId:entry.checkpoint}}});
    expect(response.ok()).toBe(true);
    await page.addInitScript(session=>localStorage.setItem('stray-kitty.session.v1',JSON.stringify(session)),session);
    const images:string[]=[],errors:string[]=[];
    page.on('response',response=>{if(response.ok()&&response.request().resourceType()==='image')images.push(response.url());});
    page.on('pageerror',error=>errors.push(error.message));
    if(fallback)await page.route(/\.lossless[^/]*\.webp$/,route=>route.abort('failed'));
    await page.goto('/');await page.getByRole('button',{name:/^(暂不登录|继续冒险)/}).click();
    await expect(page.getByTestId(entry.scene+'-battle')).toHaveAttribute('data-phase','ready');
    await expect.poll(()=>entry.sheets.filter(sheet=>images.some(url=>url.includes('/'+sheet+(fallback?'-':'.lossless')))).length).toBe(entry.sheets.length);
    await page.waitForLoadState('networkidle');
    expect(images.filter(url=>/rainy-alley-background|night_market_|chapter4_L0_approved|greenhouse-base/.test(url))).toEqual([]);
    if(!fallback){
      for(const sheet of entry.sheets){
        expect(images.some(url=>url.includes('/'+sheet+'-')&&url.endsWith('.png'))).toBe(false);
        const original=statSync(`web/src/modules/battle/assets/${sheet}.png`).size;
        expect(statSync(`web/src/modules/battle/assets/${sheet}.lossless.webp`).size).toBeLessThan(original);
      }
    }
    expect(errors).toEqual([]);
    await page.screenshot({path:info.outputPath(`${entry.scene}-${fallback?'png':'webp'}.png`)});
  });
}
