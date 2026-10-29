import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const vite=['web/node_modules/vite/bin/vite.js','node_modules/vite/bin/vite.js'].map(p=>path.join(root,p)).find(p=>fs.existsSync(p));
if(!vite)throw new Error('Install workspace dependencies before verifying player flow.');
for(const [cwd,args] of [
  [root,['scripts/content.mjs','--check']],
  [root,['node_modules/typescript/bin/tsc','--noEmit','-p','web']],
  [path.join(root,'web'),[vite,'build','--mode','e2e']],
  [root,['--import','tsx','node_modules/@playwright/test/cli.js','test','-c','playwright.player-flow.config.ts',...process.argv.slice(2)]],
]){
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true,env:process.env});
  if(result.status!==0)process.exit(result.status??1);
}
