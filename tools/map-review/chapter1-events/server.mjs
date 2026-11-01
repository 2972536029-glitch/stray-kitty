import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const root=fileURLToPath(new URL('./',import.meta.url));
const server=await createServer({root,configFile:false,publicDir:false,cacheDir:path.join(root,'.vite'),server:{host:'127.0.0.1',port:5195,strictPort:true,fs:{allow:[repository]}}});
await server.listen();server.printUrls();
