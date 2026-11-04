import defaults from './presentation.json' with {type:'json'};
import type {CSSProperties} from 'react';

export type PreviewTheme='moss'|'moon';
export interface PreviewPlacement{x:number;y:number;scale:number}
export interface PostalElementTransform{x:number;y:number;scale:number;rotation:number}
export interface PostalPresentation{
  version:1;
  ui:{sidebarWidth:number;poolTitleSize:number;poolMetaSize:number;paperRoughness:number;drawButtonHeight?:number};
  labels:Record<PreviewTheme,{titleX:number;titleY:number;titleScale:number;infoX:number;infoY:number}>;
  layouts:Record<PreviewTheme,Record<string,PreviewPlacement>>;
  elements?:Record<string,PostalElementTransform>;
}
export const postalPresentation=defaults as PostalPresentation;
export const previewTheme=(currency:string):PreviewTheme=>currency==='tuna'?'moon':'moss';
export function parsePostalPresentation(value:unknown):PostalPresentation{
  const config=value as PostalPresentation;
  const finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  if(config?.version!==1||!config.ui||!config.labels||!config.layouts)throw Error('布局格式不正确');
  const ui=config.ui;
  if(!finite(ui.sidebarWidth,110,230)||!finite(ui.poolTitleSize,18,34)||!finite(ui.poolMetaSize,9,18)||!finite(ui.paperRoughness,0,24))throw Error('界面参数超出范围');
  if(ui.drawButtonHeight!==undefined&&!finite(ui.drawButtonHeight,46,90))throw Error('抽奖按钮高度超出范围');
  for(const theme of ['moss','moon'] as const){
    const label=config.labels[theme];
    if(!label||!finite(label.titleX,-50,500)||!finite(label.titleY,-20,300)||!finite(label.titleScale,.5,1.8)||!finite(label.infoX,-30,200)||!finite(label.infoY,-20,200))throw Error('标题位置超出范围');
    if(!config.layouts[theme]||Object.keys(config.layouts[theme]).length!==Object.keys(postalPresentation.layouts[theme]).length)throw Error('家具布局不完整');
    for(const id of Object.keys(postalPresentation.layouts[theme])){
      const item=config.layouts[theme][id];
      if(!item||!finite(item.x,-10000,10000)||!finite(item.y,-10000,10000)||!finite(item.scale,.1,5))throw Error('家具位置或大小超出范围');
    }
  }
  if(config.elements){
    if(typeof config.elements!=='object'||Array.isArray(config.elements)||Object.keys(config.elements).length>1000)throw Error('元素布局格式不正确');
    for(const [id,item]of Object.entries(config.elements))if(!/^[a-zA-Z0-9_:/.-]{1,2048}$/.test(id)||!item||!finite(item.x,-10000,10000)||!finite(item.y,-10000,10000)||!finite(item.scale,.1,5)||!finite(item.rotation,-360,360))throw Error('元素位置或大小超出范围');
  }
  return config;
}
/** Broad, uneven tears plus fine fibers keep the edge soft at both paper sizes. */
function paperMask(roughness:number,width=1000,height=720,seed=17){
  const note=width<500,inset=roughness?Math.min(width,height)*(note ? .03 : .018):1,amplitude=roughness*Math.min(width,height)/(note?1400:2300);
  const points:[number,number][]=[],wave=(n:number)=>Math.sin(n*1.73+seed)*.58+Math.sin(n*.67+seed*2)*.42;
  const side=(x:number,y:number,dx:number,dy:number,length:number)=>{
    const count=Math.max(5,Math.round(length/38));
    // Keep the corners torn and almost square rather than rounding a whole segment.
    for(const t of [0,2/length,...Array.from({length:count-1},(_,i)=>(i+1)/count),1-2/length]){const offset=wave(points.length)*amplitude;points.push([x+dx*length*t-dy*offset,y+dy*length*t+dx*offset]);}
  };
  side(inset,inset,1,0,width-inset*2);side(width-inset,inset,0,1,height-inset*2);
  side(width-inset,height-inset,-1,0,width-inset*2);side(inset,height-inset,0,-1,height-inset*2);
  const mid=(a:[number,number],b:[number,number])=>`${(a[0]+b[0])/2} ${(a[1]+b[1])/2}`;
  const path=`M${mid(points.at(-1)!,points[0])}`+points.map((p,i)=>`Q${p[0]} ${p[1]} ${mid(p,points[(i+1)%points.length])}`).join('')+'Z';
  const coarse=roughness*(note?1:Math.min(width,height)/960),fine=roughness*(note ? .15 : Math.min(width,height)/4500);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><filter id="tear" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035 .06" numOctaves="3" seed="${seed}" result="tear"/><feDisplacementMap in="SourceGraphic" in2="tear" scale="${coarse}" xChannelSelector="R" yChannelSelector="G" result="edge"/><feTurbulence type="fractalNoise" baseFrequency=".32" numOctaves="2" seed="${seed+11}" result="fiber"/><feDisplacementMap in="edge" in2="fiber" scale="${fine}" xChannelSelector="R" yChannelSelector="G"/></filter></defs><path d="${path}" fill="white" filter="url(#tear)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export function postalPresentationStyle(config:PostalPresentation,theme:PreviewTheme):CSSProperties{
  const {ui,labels}=config,label=labels[theme];
  return {'--postal-sidebar-width':`${ui.sidebarWidth}px`,'--postal-pool-title-size':`${ui.poolTitleSize}px`,'--postal-pool-meta-size':`${ui.poolMetaSize}px`,
    '--postal-paper-mask':paperMask(ui.paperRoughness),'--postal-image-mask':paperMask(ui.paperRoughness,1000,720,29),'--postal-card-mask':paperMask(ui.paperRoughness,320,200,41),'--postal-draw-button-height':`${ui.drawButtonHeight??48}px`,
    '--postal-title-x':`${label.titleX}px`,'--postal-title-y':`${label.titleY}px`,'--postal-title-scale':label.titleScale,
    '--postal-info-x':`${label.infoX}px`,'--postal-info-y':`${label.infoY}px`} as CSSProperties;
}
