import {spawnSync} from 'node:child_process';
import path from 'node:path';
const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const commands=[[process.execPath,['scripts/content.mjs','--check']],[process.execPath,['scripts/check-api.mjs']],[process.execPath,['scripts/architecture.mjs','--check']],[process.execPath,[npmCli,'run','typecheck']],[process.execPath,[npmCli,'test']],['go',['-C','server','vet','./...']],['go',['-C','server','test','./...']],[process.execPath,[npmCli,'run','build','--workspace','web']]];
for(const [command,args] of commands){const result=spawnSync(command,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
