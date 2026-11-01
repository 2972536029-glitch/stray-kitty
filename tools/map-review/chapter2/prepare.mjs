import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.PYTHON || 'python';
const commands=[
  [process.execPath,['--import','tsx','tools/map-review/chapter2/build-current.ts']],
  [python,['-X','utf8','tools/map-review/chapter2/build-trace.py']],
  [python,['-X','utf8','tools/map-review/chapter2/audit-trace.py']],
];
for(const [command,args] of commands){
  const result=spawnSync(command,args,{cwd,stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status ?? 1);
}
