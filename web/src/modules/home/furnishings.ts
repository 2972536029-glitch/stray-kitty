import furniture from '../../../content/home/furniture.json' with {type:'json'};
import decor from '../../../content/home/decor.json' with {type:'json'};

export const FURNITURE_CATEGORIES = {
  wall:'墙饰', decor:'装饰', table:'桌子', bed:'小窝', seat:'座椅', storage:'收纳',
  plant:'绿植', rug:'地毯', lighting:'灯具', toy:'玩具',
} as const;
export type FurnitureCategory = keyof typeof FURNITURE_CATEGORIES;
export const FURNITURE_PIXELS_PER_CM = 1.7;
const catalogue = new Map(furniture.map(item => [item.id,item]));
const stages = new Map(decor.map(item => [item.id,item]));
export function furnitureWidthCm(id:string) {return catalogue.get(id)?.widthCm ?? 0;}
export function furnitureWidth(id:string) {return Math.round(furnitureWidthCm(id)*FURNITURE_PIXELS_PER_CM);}
export function furnitureCategory(id:string,stage=false):FurnitureCategory {
  return ((stage?stages.get(id):catalogue.get(id))?.category ?? 'decor') as FurnitureCategory;
}
