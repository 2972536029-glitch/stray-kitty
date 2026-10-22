import {spawn,spawnSync} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
async function free(port){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):resolve()));});}
await free(5017);await free(8017);
const child=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,GAME_DATA_FILE:path.join(root,'.runtime/dev-smoke-save.json')},stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-8000);});
try{
 let ready=false;
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error(output);
  try{const page=await fetch('http://127.0.0.1:5017/');const catalog=await fetch('http://127.0.0.1:5017/api/v1/content');if(page.ok&&(await page.text()).includes('id="root"')&&catalog.ok&&(await catalog.json()).version==='2026.10.22.1'){ready=true;break;}}catch{}
  await delay(500);
 }
 if(!ready)throw Error('Development startup timed out.\n'+output);
 console.log('Development startup verified: Vite page and same-origin Go API proxy.');
}finally{
 if(child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGTERM');}
}
