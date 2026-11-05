import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {repo} from './server.mjs';

export async function startDragPreview(port=8187){
  const server=await createServer({root:repo,publicDir:path.join(repo,'web/public'),configFile:false,
    optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime']},
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/web/dist/**','**/test-results/**']}},
    plugins:[{name:'local-drag-fixture',configureServer(vite){
      vite.middlewares.use('/__drag-fixture',async(_req,res,next)=>{try{
        const html=await vite.transformIndexHtml('/__drag-fixture','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>本地拖动验证 · 不修改存档</title><style>html,body,#root{margin:0;width:100%;height:100vh;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/tools/attack-fx-preview/drag.fixture.tsx"></script></body></html>');
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
      }catch(error){next(error);}});
    }},react()],
  });await server.listen();return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await startDragPreview();console.log('Local real-component drag fixture: http://127.0.0.1:8187/__drag-fixture');}
