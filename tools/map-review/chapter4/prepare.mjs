import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.PYTHON || 'python';
for(const [command,args] of [
  [python,['-X','utf8','tools/map-review/chapter4/prepare-source.py']],
  [process.execPath,['--import','tsx','tools/map-review/chapter4/build-current.ts']],
  [python,['-X','utf8','tools/map-review/chapter4/build-trace.py']],
]){
  const result=spawnSync(command,args,{cwd,stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status ?? 1);
}
