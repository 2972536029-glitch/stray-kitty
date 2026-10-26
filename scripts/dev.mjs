import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
const executable=path.join(runtime,process.platform==='win32'?'kitty-api.exe':'kitty-api');
const sync=spawnSync(process.execPath,[path.join(root,'scripts/content.mjs'),'--check'],{stdio:'inherit',cwd:root});if(sync.status!==0)process.exit(sync.status??1);
const build=spawnSync('go',['build','-o',executable,'./cmd/api'],{cwd:path.join(root,'server'),stdio:'inherit'});if(build.status!==0)process.exit(build.status??1);
const vitePath=fs.existsSync(path.join(root,'web/node_modules/vite/bin/vite.js'))?path.join(root,'web/node_modules/vite/bin/vite.js'):path.join(root,'node_modules/vite/bin/vite.js');
const children=[spawn(executable,[],{cwd:path.join(root,'server'),stdio:'inherit',env:process.env}),spawn(process.execPath,[vitePath,'--host','127.0.0.1','--port','5017','--strictPort'],{cwd:path.join(root,'web'),stdio:'inherit',env:process.env})];
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();setTimeout(()=>process.exit(code),200);}
for(const child of children){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>{if(!stopping)stop(code??1);});}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log('小猫回家记：浏览器 http://127.0.0.1:5017 | API http://127.0.0.1:8017');
