// Pixel-level checks for the two special presentation paths: hidden tunnel
// targets and the prologue's own projectile lifecycle. No game API is called.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {startPreview,repo} from './server.mjs';

const output=path.resolve(process.argv[2]??path.join(repo,'test-results/attack-fx-boundaries'));
await mkdir(output,{recursive:true});
const {server,url}=await startPreview(8186);
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>!!window.attackFxPreview);
  await page.evaluate(()=>window.attackFxPreview.selectChapter('tunnel'));
  await page.waitForLoadState('networkidle');
  const result=await page.evaluate(async()=>{
    const engine=await import('/web/src/modules/battle/tunnel/engine.ts');
    const painter=await import('/web/src/modules/battle/tunnel/painter.ts');
    const {CELLS}=await import('/web/src/modules/battle/tunnel/config.ts');
    const prologue=await import('/web/src/modules/battle/l00/engine.ts');
    const {paintBattle}=await import('/web/src/modules/battle/l00/painter.ts');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    canvas.width=painter.BOARD_WIDTH;canvas.height=painter.BOARD_HEIGHT;
    const hash=()=>{const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);let value=2166136261;for(const byte of data)value=Math.imul(value^byte,16777619);return value>>>0;};
    const state=engine.createTunnelBattle();state.darknessRemaining=10;
    const hidden=CELLS.find(point=>!engine.isEnemyVisible(state,point));
    if(!hidden)throw new Error('Fixture must include a concealed cell');
    const hit={id:1,kind:'attack',from:{...state.cats.find(cat=>cat.id==='caster')},to:{...hidden,id:'hidden-enemy'},remaining:.25};
    const draw=(night,hits)=>{painter.paintTunnel(ctx,{...state,nightVisionRemaining:night,effects:hits},null,null);return hash();};
    const darkBase=draw(0,[]),darkHit=draw(0,[hit]),litBase=draw(10,[]),litHit=draw(10,[hit]);
    canvas.width=700;canvas.height=300;
    let intro=prologue.act(prologue.createGame({mode:'standard'}),{type:'START'});
    for(let step=0;step<2000&&intro.cats.length<3;step++)intro=prologue.advanceGame(intro,.1);
    if(!['caster','guard'].every(id=>intro.cats.some(cat=>cat.id===id)))throw new Error('Both prologue partners must arrive through the actual engine');
    const saved=JSON.stringify(intro);
    const sample=(kind,ttl)=>{
      const source=intro.cats.find(cat=>cat.id===(kind==='starlight'?'caster':'guard'));
      paintBattle(ctx,{...intro,projectiles:ttl>0?[{id:'preview',x:source.x,y:source.y,tx:source.x+1,ty:source.y,kind,ttl,maxTtl:.4}]:[]},null,new Map());
      return hash();
    };
    // Warm the prologue's demand-loaded art before taking stable pixel samples.
    sample('starlight',.3);
    await new Promise(resolve=>setTimeout(resolve,500));
    const stars=[sample('starlight',.32),sample('starlight',.15)];
    const shields=[sample('shield',.32),sample('shield',.15)];
    return {hidden,darkBase,darkHit,litBase,litHit,stars,shields,expired:[sample('starlight',0),sample('shield',0)],stateUnchanged:JSON.stringify(intro)===saved};
  });
  assert.equal(result.darkBase,result.darkHit,'hidden-target feedback must remain invisible');
  assert.notEqual(result.litBase,result.litHit,'night vision must restore the same hit feedback');
  assert.notEqual(result.stars[0],result.stars[1]);assert.notEqual(result.shields[0],result.shields[1]);
  assert.notEqual(result.stars[0],result.shields[0]);
  assert.equal(result.expired[0],result.expired[1]);assert(result.stateUnchanged);assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'boundaries.json'),JSON.stringify({passed:true,...result,errors},null,2));
  console.log(JSON.stringify({passed:true,checks:['tunnel concealment','night vision','prologue star/shield animation','expired projectile cleanup','state unchanged'],output}));
}finally{await browser?.close();await server.close();}
