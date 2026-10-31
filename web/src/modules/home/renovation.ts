import type {HomeRepairPart} from '../../contracts';
import {HOME_SIZE,homeStage} from './layout';
import type {HomeAppearance} from './objects';
import type {HomeArtwork} from './assets';
import type {LifeCat} from './life';
import {paintResident} from './catPainter';
import {homeObjects,paintHomeStructure,paintHomeObject,paintHomeFurnitureFront,paintHomeFrontWall,paintHomeWeather} from './painter';

const names=['漏雨避雨处','简易庇护所','原木温室','王国庆典'];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const p=clamp(n);return p*p*(3-2*p);};
export interface RenovationChange {kind:'part'|'stage';fromStage:number;toStage:number;repairId:string}
export function renovationChange(before:HomeAppearance,after:HomeAppearance):RenovationChange|null{
  const fromStage=homeStage(before),toStage=homeStage(after),repairId=after.homeRepairs?.find(id=>!before.homeRepairs?.includes(id))??'';
  if(toStage>fromStage)return {kind:'stage',fromStage,toStage,repairId};
  return repairId?{kind:'part',fromStage,toStage,repairId}:null;
}

/** Keep a single old world image, with the original cats and depth order. No
 * frame copies or server delays are needed while the finished world fades in. */
function snapshot(state:HomeAppearance,art:HomeArtwork,cats:LifeCat[],time:number){
  const canvas=document.createElement('canvas');canvas.width=HOME_SIZE.width;canvas.height=HOME_SIZE.height;
  const ctx=canvas.getContext('2d')!,objects=homeObjects(state),stage=homeStage(state);
  paintHomeStructure(ctx,state,art);
  const layers=[...objects.filter(o=>!o.front).map(object=>({y:object.y,object,cat:undefined as LifeCat|undefined})),...cats.filter(c=>!c.slot).map(cat=>({y:cat.y,object:undefined,cat}))].sort((a,b)=>a.y-b.y);
  for(const layer of layers)if(layer.object)paintHomeObject(ctx,layer.object,art,time);else if(layer.cat)paintResident(ctx,layer.cat,time,stage);
  for(const cat of cats.filter(c=>c.slot).sort((a,b)=>a.y-b.y)){
    paintResident(ctx,cat,time,stage);const host=objects.find(o=>(o.slot??o.layoutKey)===cat.slot);
    if(host&&!cat.furnitureArrival)paintHomeFurnitureFront(ctx,host,art);
  }
  paintHomeFrontWall(ctx,state,art);for(const object of objects.filter(o=>o.front))paintHomeObject(ctx,object,art,time);
  paintHomeWeather(ctx,state,time);return canvas;
}

export class HomeRenovation {
  private oldWorld?:HTMLCanvasElement;
  private change?:RenovationChange;
  private elapsed=0;
  private duration=0;
  private reduced=false;
  private part?:Pick<HomeRepairPart,'id'|'name'|'x'|'y'>;
  get active(){return !!this.oldWorld;}
  get diagnostics(){if(!this.change||!this.active)return null;const progress=clamp(this.elapsed/this.duration);return {...this.change,progress,phase:progress<.28?'building':progress<.88?'revealing':'settling'};}
  prepare(part:HomeRepairPart){this.part=part;}
  clear(){this.oldWorld=undefined;this.change=undefined;this.part=undefined;}
  begin(before:HomeAppearance,after:HomeAppearance,art:HomeArtwork,cats:LifeCat[],time:number){
    const change=renovationChange(before,after);if(!change)return;
    this.oldWorld=snapshot(before,art,cats,time);this.change=change;this.elapsed=0;
    this.reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.duration=this.reduced?450:change.kind==='stage'?3400:1900;
    if(this.part?.id!==change.repairId)this.part=undefined;
  }
  advance(delta:number){
    if(!this.active)return false;
    this.elapsed+=delta;if(this.elapsed<this.duration)return false;
    this.clear();return true;
  }
  paint(ctx:CanvasRenderingContext2D){
    if(!this.oldWorld||!this.change)return;
    const p=clamp(this.elapsed/this.duration),stage=this.change.kind==='stage',celebration=this.change.toStage===4;
    const reveal=this.reduced?smooth(p):smooth((p-.28)/.6),fade=1-smooth((p-.84)/.16);
    const point=this.part??{x:840,y:350},label=stage?`家的成长 · ${names[this.change.toStage-1]}`:this.part?.name??'修补花房';
    ctx.save();ctx.globalAlpha=1-reveal;ctx.drawImage(this.oldWorld,0,0);ctx.globalAlpha=1;
    if(!this.reduced){
      // Warm dust and a travelling band of daylight carry the whole room into
      // its next appearance, while local work stays around the damaged part.
      if(stage){
        const x=-240+smooth((p-.18)/.72)*(HOME_SIZE.width+480),light=ctx.createLinearGradient(x-180,0,x+180,0);
        light.addColorStop(0,'#ffe6ae00');light.addColorStop(.5,`rgba(255,224,159,${Math.sin(p*Math.PI)*.2})`);light.addColorStop(1,'#ffe6ae00');ctx.fillStyle=light;ctx.fillRect(0,0,HOME_SIZE.width,HOME_SIZE.height);
      }
      const centers=stage?[point,{x:440,y:460},{x:1260,y:430}]:[point];
      for(const [i,c]of centers.entries()){
        const work=clamp(1-p/.78)*fade;
        ctx.save();ctx.globalAlpha=work;ctx.translate(c.x,c.y);
        const halo=ctx.createRadialGradient(0,0,10,0,0,95);halo.addColorStop(0,'#ffe6a866');halo.addColorStop(1,'#ffe6a800');ctx.fillStyle=halo;ctx.fillRect(-95,-95,190,190);
        ctx.save();ctx.translate(0,-24);ctx.rotate(Math.sin(p*Math.PI*14+i)*.4-.35);
        if(celebration){ctx.fillStyle='#ffe299';ctx.fillRect(-6,-17,12,30);ctx.fillRect(-15,-6,30,9);}
        else {ctx.fillStyle='#58412f';ctx.fillRect(-4,-5,10,40);ctx.fillStyle='#a9b6af';ctx.fillRect(-20,-19,40,17);ctx.fillStyle='#e0ddd0';ctx.fillRect(-20,-19,40,4);}
        ctx.restore();
        for(let j=0;j<12;j++){
          const age=(p*3+j/12)%1,angle=j*2.4+i,x=Math.cos(angle)*age*90,y=Math.sin(angle)*age*40-age*30;
          ctx.globalAlpha=work*(1-age);ctx.fillStyle=j%3?'#e4c48a':'#fff0c9';ctx.fillRect(Math.round(x),Math.round(y),j%2?5:3,j%2?5:3);
        }
        ctx.restore();
      }
      if(stage)for(let i=0;i<28;i++){
        const x=160+(i*137)%1350,y=250+(i*71)%410-Math.sin(p*Math.PI)*18,glow=Math.max(0,Math.sin(p*Math.PI*2-i*.4))*fade;
        ctx.globalAlpha=glow*.65;ctx.fillStyle='#ffe7a5';ctx.fillRect(x,y,3,9);ctx.fillRect(x-3,y+3,9,3);
      }
    }
    ctx.globalAlpha=this.reduced?1:fade;
    const w=stage?480:420,x=(HOME_SIZE.width-w)/2,y=765;
    ctx.fillStyle='#493a2df0';ctx.fillRect(x,y,w,72);ctx.strokeStyle='#c9aa6d';ctx.lineWidth=2;ctx.strokeRect(x,y,w,72);
    ctx.textAlign='center';ctx.fillStyle='#fff0ce';ctx.font='bold 22px "Microsoft YaHei",sans-serif';ctx.fillText(label,HOME_SIZE.width/2,y+29);
    ctx.font='14px "Microsoft YaHei",sans-serif';ctx.fillStyle='#d9c9aa';ctx.fillText(p<.28?(celebration?'挂好灯串，准备迎接伙伴们':'叮叮当当，慢慢把这里修好'):p<.88?'新的模样，正在一点点显现':'修好了，家又暖和了一点',HOME_SIZE.width/2,y+51);
    ctx.fillStyle='#ead09a';ctx.fillRect(x+15,y+64,(w-30)*p,3);ctx.restore();
  }
}
