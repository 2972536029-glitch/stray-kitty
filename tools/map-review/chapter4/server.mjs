import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import path from 'node:path';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const root=fileURLToPath(new URL('./',import.meta.url));
for(const name of ['current.json','candidate.json']){
  if(!existsSync(path.join(root,name))){
    console.error('Generate preview data first: node tools/map-review/chapter4/prepare.mjs');
    process.exit(1);
  }
}
const server=await createServer({root,configFile:false,publicDir:path.join(repository,'web/public'),cacheDir:path.join(root,'.vite'),server:{host:'127.0.0.1',port:5191,strictPort:true,fs:{allow:[repository]}}});
await server.listen();server.printUrls();
