import {useLayoutEffect,type RefObject} from 'react';
import type {PostalElementTransform} from './presentationModel';

export interface PostalElement{id:string;label:string;element:HTMLElement|SVGElement;parentId:string|null}
const names:Record<string,string>={
  'postal-layout':'整个邮局','postal-header':'顶部栏','postal-brand':'邮局标牌','postal-wallet':'余额栏','postal-body':'中间整区','postal-aside':'左侧整栏',
  'postal-pools':'卡池按钮组','postal-preview-note':'藏品卡整张','postal-tape':'胶带','postal-featured-frame':'藏品图片框','postal-feature-next':'藏品轮换按钮',
  'postal-stage':'展示区域','postal-paper-stack':'展示图及纸张整组','postal-paper-back':'背衬纸','postal-paper':'主展示纸','postal-suite':'套装展示整组',
  'postal-preview-mount':'展示图底板','parcel-theme-preview':'套装展示图','postal-suite-heading':'套装标题纸条','postal-suite-register':'底部收藏信息组',
  'postal-corner-stamps':'右上角邮票组','postal-footer':'底部整栏','postal-pity':'保底说明','postal-actions':'抽奖按钮组','postal-footer-parcel':'角落小包裹',
  'postal-disclaimer':'底部提示','postal-journal-backdrop':'最大书页背景','postal-postcard':'明信片整张','postal-address':'收信地址','postal-postage':'明信片邮票',
  'postal-postmark':'圆形邮戳','postal-card-letterhead':'明信片抬头','postal-card-note':'明信片左栏','postal-letter-sketch':'信封插画','postal-writing':'绘画纸',
  'postal-drawing-pen':'羽毛笔','postal-card-clip':'回形针','postal-card-border':'明信片边框','postal-card-colophon':'邮局落款','postal-card-caption':'明信片寄语',
  'postal-delivery-stage':'包裹整页','postal-delivery':'包裹展示组','postal-parcel-grid':'包裹网格','postal-parcel':'单个包裹','postal-parcel-number':'包裹编号',
  'postal-parcel-name':'家具名称','postal-parcel-hint':'拆包提示','postal-parcel-sprite':'包裹图','postal-sent-stamp':'寄出印章',
  'postal-owned-link':'已收藏 / 家具图鉴入口','postal-info-links':'规则入口','postal-rules-button':'规则按钮','postal-postcard-art':'明信片纸张底图',
  'postal-postcode':'邮政编码','postal-postcode-boxes':'六格邮编','postal-card-divider':'明信片分隔线','postal-card-home':'家园纪念照片',
  'postal-card-cats':'家园猫咪整组','postal-card-cat':'游戏猫咪','postal-card-sender':'寄件人信息',
  'postal-balances':'邮票与罐头余额整组','postal-balance-card':'余额牌','postal-balance-value':'余额名称与数字','postal-balance-plus':'补给入口','postal-currency-icon':'货币图标',
  'postal-stage-actions':'各阶段主按钮中心','postal-stage-ticket':'当前阶段主按钮','postal-stage-secondary':'辅助操作'
};
/** Stable DOM paths keep all groups and their individual leaves editable across reloads. */
export function collectPostalElements(root:HTMLElement):PostalElement[]{
  const result:PostalElement[]=[],keys=new Map<Element,string>();
  for(const element of [root,...root.querySelectorAll<HTMLElement|SVGElement>('*')]){
    if(!(element instanceof HTMLElement||element instanceof SVGElement)||['SCRIPT','STYLE'].includes(element.tagName)||element.parentElement?.closest('svg'))continue;
    const base=[...element.classList].find(name=>name.startsWith('postal-')||name.startsWith('parcel-'))??element.tagName.toLowerCase();
    let index=0;for(let sibling=element.previousElementSibling;sibling;sibling=sibling.previousElementSibling){const siblingBase=[...sibling.classList].find(name=>name.startsWith('postal-')||name.startsWith('parcel-'))??sibling.tagName.toLowerCase();if(siblingBase===base)index++;}
    const parentId=keys.get(element.parentElement!)??null,id=parentId?`${parentId}/${base}.${index}`:base;
    keys.set(element,id);element.dataset.postalElement=id;
    const text=(element.getAttribute('aria-label')??element.textContent??'').trim().replace(/\s+/g,' ').slice(0,24);
    const label=names[base]??(element instanceof HTMLCanvasElement?'绘画 / 展示画布':element instanceof SVGElement?'图案':element instanceof HTMLImageElement?'图片':text||base);
    result.push({id,label:label===text?label:`${label}${text&&text!==label?' · '+text:''}`,element,parentId});
  }
  return result;
}
export function usePostalElements(root:RefObject<HTMLDivElement|null>,transforms?:Record<string,PostalElementTransform>){
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return;
    const apply=()=>{for(const {id,element}of collectPostalElements(node)){
      const value=transforms?.[id],style=element.style;
      if(value){if(element instanceof HTMLElement&&getComputedStyle(element).display==='inline'){element.dataset.postalOriginalDisplay=style.display;style.display='inline-block';}style.translate=`${value.x}px ${value.y}px`;style.scale=String(value.scale);style.rotate=`${value.rotation}deg`;element.dataset.postalTransformed='true';}
      else if(element.dataset.postalTransformed){style.removeProperty('translate');style.removeProperty('scale');style.removeProperty('rotate');if('postalOriginalDisplay' in element.dataset){style.display=element.dataset.postalOriginalDisplay??'';delete element.dataset.postalOriginalDisplay;}delete element.dataset.postalTransformed;}
    }node.dispatchEvent(new Event('postal-elements-change',{bubbles:true}));};
    apply();const observer=new MutationObserver(apply);observer.observe(node,{childList:true,subtree:true});return()=>observer.disconnect();
  },[root,transforms]);
}
