import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

export const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function startPreview(port=8184){
  const server=await createServer({root:repo,configFile:false,publicDir:path.join(repo,'web/public'),server:{host:'127.0.0.1',port,strictPort:true}});
  await server.listen();
  return {server,url:`http://127.0.0.1:${port}/tools/attack-fx-preview/`};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {server,url}=await startPreview(Number(process.argv[2]??8184));
  console.log(`Attack FX preview: ${url}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
}
