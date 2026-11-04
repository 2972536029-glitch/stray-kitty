import type {HomeLayoutChange, HomePlacement} from '../../contracts';
import {homeInventory, type HomeAppearance, type HomeItem} from './objects';
import {HOME_FRAMES} from './assets';
import {homeObjectDepth} from './spatial';

export function validHomePosition(item:Pick<HomeItem,'width'|'wall'>,x:number,y:number):boolean {
  return Number.isInteger(x)&&Number.isInteger(y)&&x>=80+item.width/2&&x<=1592-item.width/2&&y>=(item.wall?150:355)&&y<=(item.wall?890:728);
}
export function homeLayoutChanges(before:HomeAppearance,after:HomeAppearance):HomeLayoutChange[]{
  const original=new Map(homeInventory(before).map(item=>[item.layoutKey,item]));
  return homeInventory(after).flatMap(item=>{const old=original.get(item.layoutKey);return old&&(old.x!==item.x||old.y!==item.y||old.stored!==item.stored)?[{key:item.layoutKey,x:item.x,y:item.y,stored:item.stored}]:[];});
}
export function homeHit(items:HomeItem[],x:number,y:number):HomeItem|undefined {
  return [...items].filter(i=>!i.stored).sort((a,b)=>homeObjectDepth(a)-homeObjectDepth(b)).reverse().find(item=>{const f=HOME_FRAMES[item.sprite],h=item.width*f.height/f.width;return Math.abs(x-item.x)<=item.width/2&&y>=item.y-h&&y<=item.y+6;});
}
export type HomeDraft=Record<string,HomePlacement>;
