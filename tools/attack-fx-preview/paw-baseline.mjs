import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv[2])throw new Error('Usage: node paw-baseline.mjs <baseline-output-directory>');
const output=path.resolve(process.argv[2]);await mkdir(output,{recursive:true});
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{const page=await browser.newPage();await page.goto(process.env.KITTY_PAW_BASELINE_URL??'http://127.0.0.1:8184/tools/attack-fx-preview/',{waitUntil:'domcontentloaded'});
const results=await page.evaluate(async()=>{
 const sets={chapter:['caster','guard','tuanzi','diandian'],market:['caster','guard','tuanzi','diandian','bruiser','controller'],greenhouse:['caster','guard','tuanzi','momo','bruiser','controller'],tunnel:['caster','guard','tuanzi','diandian','momo','bruiser'],finale:['caster','guard','tuanzi','diandian','momo','bruiser']};
 const functions={chapter:'drawChapterCat',market:'drawMarketCat',greenhouse:'drawGreenhouseCat',tunnel:'drawTunnelCat',finale:'drawFinaleCat'};const results=[];
 for(const [chapter,roles]of Object.entries(sets)){
  const module=await import('/web/src/modules/battle/'+chapter+'/painter.ts');
  for(const actor of roles){const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d');module[functions[chapter]](ctx,actor,16,16,128,false,false);let hash=2166136261;for(const b of ctx.getImageData(0,0,160,160).data)hash=Math.imul(hash^b,16777619);results.push({chapter,actor,hash:hash>>>0,png:canvas.toDataURL('image/png').split(',')[1]});}
 }
 return results;
});
for(const r of results){await writeFile(path.join(output,r.chapter+'-'+r.actor+'.png'),Buffer.from(r.png,'base64'));delete r.png;}
await writeFile(path.join(output,'baseline.json'),JSON.stringify(results,null,2));console.log('Captured '+results.length+' original idle sprites.');
}finally{await browser.close();}
