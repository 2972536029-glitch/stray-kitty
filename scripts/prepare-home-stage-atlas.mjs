// Pack the approved front-facing transparent furniture without repainting pixels.
// Initial extraction: --from-source, with output/home-editor/{stage}-source.png.
// Normal use repacks the checked-in individual components.
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const ids={shelter:['box','rag','bucket','basin','deadpots','brokenrack','boards','tools','vine','bench','sack','can'],improvised:['workbench','straw','bowls','blanket','tinlamp','shelf','seedlings','storage','nest','scratcher','cushion','plantstool'],timber:['bench','chest','tower','hammock','herbs','citrus','flowerpots','seedlingrack','vine','cloudnest','castle','supplies'],celebration:['banquet','flags','entryleft','entryright','rug','gifts','flowers','pennant','redcushion','sunlamp','starlamp','wreath']};
const atlas=JSON.parse(fs.readFileSync('web/src/modules/home/stage-atlas.json','utf8'));
fs.mkdirSync('web/public/assets/home/stages',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage();
  for(const [stage,names] of Object.entries(ids)){
    const prefix='s'+(Object.keys(ids).indexOf(stage)+1)+'.';
    const source=process.argv.includes('--from-source')?fs.readFileSync(`output/home-editor/${stage}-source.png`).toString('base64'):null;
    const files=source?[]:names.map(name=>fs.readFileSync(`web/public/assets/home/stages/${prefix+name}.png`).toString('base64'));
    const result=await page.evaluate(async({source,files,names,prefix})=>{
      const load=async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();return im;};
      const sprites=[];
      if(source){
        const im=await load(source),c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
        const data=ctx.getImageData(0,0,c.width,c.height).data,seen=new Uint8Array(c.width*c.height),components=[];
        for(let i=0;i<seen.length;i++){
          if(seen[i]||data[i*4+3]<80)continue;
          let x0=c.width,y0=c.height,x1=0,y1=0,count=0;const stack=[i];seen[i]=1;
          while(stack.length){const p=stack.pop(),x=p%c.width,y=Math.floor(p/c.width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
            for(const n of [p-1,p+1,p-c.width,p+c.width])if(n>=0&&n<seen.length&&!seen[n]&&Math.abs(n%c.width-x)<=1&&data[n*4+3]>=80){seen[n]=1;stack.push(n);}}
          if(count>1500)components.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count});
        }
        if(components.length!==12)throw Error('Expected 12 isolated sprites, found '+components.length);
        components.sort((a,b)=>Math.min(2,Math.floor((a.y+a.h/2)/c.height*3))-Math.min(2,Math.floor((b.y+b.h/2)/c.height*3))||a.x-b.x);
        for(const b of components){const crop=document.createElement('canvas');crop.width=b.w+4;crop.height=b.h+4;crop.getContext('2d').drawImage(im,b.x-2,b.y-2,b.w+4,b.h+4,0,0,b.w+4,b.h+4);sprites.push(crop);}
      }else for(const file of files)sprites.push(await load(file));
      const sheet=document.createElement('canvas');sheet.width=2048;sheet.height=1536;const ctx=sheet.getContext('2d'),frames={},out=[];
      sprites.forEach((im,i)=>{const w=im.width,h=im.height;if(w>508||h>508)throw Error('Sprite exceeds atlas cell');const x=i%4*512+Math.floor((512-w)/2),y=Math.floor(i/4)*512+Math.floor((512-h)/2);ctx.drawImage(im,x,y);frames[prefix+names[i]]={x,y,width:w,height:h};const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0);out.push(c.toDataURL().split(',')[1]);});
      return{atlas:{width:2048,height:1536,frames},png:sheet.toDataURL().split(',')[1],files:out};
    },{source,files,names,prefix});
    atlas[stage]=result.atlas;
    fs.writeFileSync(`web/public/assets/home/furniture-${stage}-v3.png`,Buffer.from(result.png,'base64'));
    names.forEach((name,i)=>fs.writeFileSync(`web/public/assets/home/stages/${prefix+name}.png`,Buffer.from(result.files[i],'base64')));
    console.log(stage+': 12 front-facing components');
  }
  fs.writeFileSync('web/src/modules/home/stage-atlas.json',JSON.stringify(atlas,null,2)+'\n');
}finally{await browser.close();}
