// Slice the two approved transparent sheets into registered individual sprites.
// Preserve generated alpha; no color-key background removal or repaint.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});
try{
  const page=await browser.newPage();
  const ids={moss:['moss_cottage','fern_lantern','acorn_library','leaf_swing','clover_rug','willow_sofa','herb_desk','letter_cabinet','sprout_planter','postmark_clock','wicker_basket','seedling_stool'],moon:['luna_boat','orrery_lamp','tide_observatory','orbit_hammock','starmap_carpet','crescent_sofa','astral_desk','pearl_cabinet','nebula_planter','lunar_clock','comet_mobile','star_stool']};
  const atlas={};
  fs.mkdirSync(path.join(root,'web/public/assets/home/parcels'),{recursive:true});
  for(const theme of ['moss','moon']){
    // A clean checkout can repack the checked-in individual components. Local
    // source sheets are used only for the initial, approved extraction pass.
    const sourcePath=path.join(root,`output/parcel-design/parcel-${theme}-source.png`);
    if(!process.argv.includes('--from-source')){
      const files=ids[theme].map(id=>({id,data:fs.readFileSync(path.join(root,`web/public/assets/home/parcels/${id}.png`)).toString('base64')}));
      const packed=await page.evaluate(async files=>{
        const c=document.createElement('canvas');c.width=2048;c.height=1536;const ctx=c.getContext('2d'),frames={};
        for(let i=0;i<files.length;i++){
          const image=new Image();image.src=`data:image/png;base64,${files[i].data}`;await image.decode();
          const x=i%4*512+Math.floor((512-image.width)/2),y=Math.floor(i/4)*512+Math.floor((512-image.height)/2);ctx.drawImage(image,x,y);
          frames['parcel.'+files[i].id]={x,y,width:image.width,height:image.height};
        }return{atlas:{width:c.width,height:c.height,frames},png:c.toDataURL('image/png').split(',')[1]};
      },files);
      atlas[theme]=packed.atlas;fs.writeFileSync(path.join(root,`web/public/assets/home/furniture-parcels-${theme}-v2.png`),Buffer.from(packed.png,'base64'));console.log(`Packed ${theme}: 12 components.`);continue;
    }
    const data=fs.readFileSync(sourcePath);
    const components=await page.evaluate(async ({src,ids})=>{
      const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,c.width,c.height),visited=new Uint8Array(c.width*c.height),out=[],stack=[];
      for(let i=0;i<visited.length;i++){
        if(visited[i]||data[i*4+3]<80)continue;visited[i]=1;stack.push(i);let x0=c.width,y0=c.height,x1=0,y1=0,count=0;
        while(stack.length){const p=stack.pop(),x=p%c.width,y=Math.floor(p/c.width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
          for(const n of [p-1,p+1,p-c.width,p+c.width]){if(n<0||n>=visited.length||visited[n]||data[n*4+3]<80)continue;if(Math.abs(n%c.width-x)>1)continue;visited[n]=1;stack.push(n);}}
        if(count>1000)out.push({x:x0,y:y0,width:x1-x0+1,height:y1-y0+1,count});
      }
      const sprites=out.sort((a,b)=>b.count-a.count).slice(0,12).sort((a,b)=>{
        const rowA=Math.min(2,Math.floor((a.y+a.height/2)/362)),rowB=Math.min(2,Math.floor((b.y+b.height/2)/362));return rowA-rowB||a.x-b.x;
      });
      const sheet=document.createElement('canvas');sheet.width=2048;sheet.height=1536;const dest=sheet.getContext('2d');
      const frames={},files=[];
      sprites.forEach((frame,i)=>{
        const x=Math.max(0,frame.x-2),y=Math.max(0,frame.y-2),w=Math.min(c.width-x,frame.width+4),h=Math.min(c.height-y,frame.height+4);
        const crop=document.createElement('canvas');crop.width=w;crop.height=h;crop.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
        const xx=i%4*512+Math.floor((512-w)/2),yy=Math.floor(i/4)*512+Math.floor((512-h)/2);
        dest.drawImage(crop,xx,yy);frames['parcel.'+ids[i]]={x:xx,y:yy,width:w,height:h};files.push({id:ids[i],data:crop.toDataURL('image/png').split(',')[1]});
      });
      return {files,atlas:{width:sheet.width,height:sheet.height,frames},png:sheet.toDataURL('image/png').split(',')[1]};
    },{src:`data:image/png;base64,${data.toString('base64')}`,ids:ids[theme]});
    atlas[theme]=components.atlas;
    fs.writeFileSync(path.join(root,`web/public/assets/home/furniture-parcels-${theme}-v2.png`),Buffer.from(components.png,'base64'));
    for(const file of components.files)fs.writeFileSync(path.join(root,`web/public/assets/home/parcels/${file.id}.png`),Buffer.from(file.data,'base64'));
    console.log(`Prepared ${theme}: 12 individually usable transparent furniture sprites.`);
  }
  fs.writeFileSync(path.join(root,'web/src/modules/lottery/atlas.json'),JSON.stringify(atlas,null,2)+'\n');
}finally{await browser.close();}
