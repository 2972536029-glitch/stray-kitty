import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const viteCli = ['node_modules/vite/bin/vite.js','web/node_modules/vite/bin/vite.js'].map(candidate=>path.join(root,candidate)).find(candidate=>fs.existsSync(candidate));
if(!viteCli)throw new Error('Vite CLI is not installed in the root or web workspace.');
for(const args of [[path.join(root,'scripts/content.mjs'),'--check'],[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','-p',path.join(root,'web')],[viteCli,'build']]) {
 const result=spawnSync(process.execPath,args,{cwd:args[0].includes('vite')?path.join(root,'web'):root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});
const executable=path.join(root,'.runtime',process.platform==='win32'?'kitty-preview.exe':'kitty-preview');
const build=spawnSync('go',['build','-o',executable,'./cmd/api'],{cwd:path.join(root,'server'),stdio:'inherit'});if(build.status!==0)process.exit(build.status??1);
const child=spawn(executable,[],{cwd:path.join(root,'server'),stdio:'inherit',env:{...process.env,GAME_ADDR:`127.0.0.1:${process.env.KITTY_TEST_PORT??8117}`,GAME_DATA_FILE:path.join(root,'.runtime/e2e-save.json'),GAME_WEB_DIR:path.join(root,'web/dist')}});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>process.exit(code??0));
