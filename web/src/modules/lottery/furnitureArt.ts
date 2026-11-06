import {furnitureWidthCm, FURNITURE_PIXELS_PER_CM} from '../home/furnishings';
export {FURNITURE_PIXELS_PER_CM} from '../home/furnishings';
import atlas from './atlas.json' with {type:'json'};
import {loadCachedImage} from '../../core/image-loading';
// Each item has an individual transparent PNG and a registered in-scene crop.
export const PARCEL_ART = {
  moss_cottage: {widthCm:furnitureWidthCm('moss_cottage'),kind:'castle',cat:'diandian',pose:'castle_peek',slot:'corner'},
  fern_lantern: {widthCm:furnitureWidthCm('fern_lantern'),kind:'lamp',cat:'miaomiao',pose:'belly',slot:'window'},
  acorn_library: {widthCm:furnitureWidthCm('acorn_library'),kind:'storage',cat:'diandian',pose:'investigate',slot:'courtyard'},
  leaf_swing: {widthCm:furnitureWidthCm('leaf_swing'),kind:'hammock',cat:'momo',pose:'hammock_sleep',slot:'beam'},
  clover_rug: {widthCm:furnitureWidthCm('clover_rug'),kind:'cushion',cat:'tuanzi',pose:'knead',slot:'sun_spot'},
  willow_sofa: {widthCm:furnitureWidthCm('willow_sofa'),kind:'sofa',cat:'tuanzi',pose:'belly',slot:'lounge'},
  herb_desk: {widthCm:furnitureWidthCm('herb_desk'),kind:'workbench',cat:'miaomiao',pose:'sniff',slot:'desk'},
  letter_cabinet: {widthCm:furnitureWidthCm('letter_cabinet'),kind:'storage',cat:'diandian',pose:'sniff',slot:'cabinet'},
  sprout_planter: {widthCm:furnitureWidthCm('sprout_planter'),kind:'plant',cat:'miaomiao',pose:'sniff',slot:'planter'},
  postmark_clock: {widthCm:furnitureWidthCm('postmark_clock'),kind:'decor',cat:'momo',pose:'watch',slot:'wall_clock'},
  wicker_basket: {widthCm:furnitureWidthCm('wicker_basket'),kind:'decor',cat:'tuanzi',pose:'bat_ball',slot:'toy_corner'},
  seedling_stool: {widthCm:furnitureWidthCm('seedling_stool'),kind:'seat',cat:'diandian',pose:'perch',slot:'reading_stool'},
  luna_boat: {widthCm:furnitureWidthCm('luna_boat'),kind:'blanket',cat:'miaomiao',pose:'belly',slot:'corner'},
  orrery_lamp: {widthCm:furnitureWidthCm('orrery_lamp'),kind:'lamp',cat:'miaomiao',pose:'belly',slot:'window'},
  tide_observatory: {widthCm:furnitureWidthCm('tide_observatory'),kind:'castle',cat:'diandian',pose:'castle_peek',slot:'courtyard'},
  orbit_hammock: {widthCm:furnitureWidthCm('orbit_hammock'),kind:'hammock',cat:'momo',pose:'hammock_sleep',slot:'beam'},
  starmap_carpet: {widthCm:furnitureWidthCm('starmap_carpet'),kind:'cushion',cat:'tuanzi',pose:'knead',slot:'sun_spot'},
  crescent_sofa: {widthCm:furnitureWidthCm('crescent_sofa'),kind:'sofa',cat:'tuanzi',pose:'belly',slot:'lounge'},
  astral_desk: {widthCm:furnitureWidthCm('astral_desk'),kind:'workbench',cat:'miaomiao',pose:'sniff',slot:'desk'},
  pearl_cabinet: {widthCm:furnitureWidthCm('pearl_cabinet'),kind:'storage',cat:'diandian',pose:'sniff',slot:'cabinet'},
  nebula_planter: {widthCm:furnitureWidthCm('nebula_planter'),kind:'plant',cat:'miaomiao',pose:'sniff',slot:'planter'},
  lunar_clock: {widthCm:furnitureWidthCm('lunar_clock'),kind:'decor',cat:'momo',pose:'watch',slot:'wall_clock'},
  comet_mobile: {widthCm:furnitureWidthCm('comet_mobile'),kind:'decor',cat:'tuanzi',pose:'bat_chime',slot:'toy_corner'},
  star_stool: {widthCm:furnitureWidthCm('star_stool'),kind:'seat',cat:'diandian',pose:'perch',slot:'reading_stool'},
} as const;
// A 40 cm cat is about 68 world pixels. All furniture shares this scale.

export function parcelWidth(id:string):number{return isParcelFurniture(id)?Math.round(PARCEL_ART[id].widthCm*FURNITURE_PIXELS_PER_CM):0;}
export type ParcelFurnitureID = keyof typeof PARCEL_ART;
export const PARCEL_IDS = Object.keys(PARCEL_ART) as ParcelFurnitureID[];
export function isParcelFurniture(id:string):id is ParcelFurnitureID {return Object.hasOwn(PARCEL_ART,id);}
export type ParcelArtwork=Partial<Record<'moss'|'moon',HTMLImageElement>>;
export async function loadParcelArtwork(theme?:'moss'|'moon'):Promise<ParcelArtwork>{
  const themes=theme?[theme]:['moss','moon'] as const;
  const entries=await Promise.all(themes.map(async theme=>{const original=`/assets/home/furniture-parcels-${theme}-v2.png`;return [theme,await loadCachedImage(original.replace(/\.png$/,'.lossless.webp'),original)] as const;}));
  return Object.fromEntries(entries);
}
export function parcelFrame(id:string){
  const key=`parcel.${id}`;
  for(const theme of ['moss','moon'] as const){const frame=(atlas[theme].frames as Record<string,{x:number;y:number;width:number;height:number}>)[key];if(frame)return{...frame,theme};}
  return undefined;
}
export function paintParcelFurniture(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,width:number,art?:ParcelArtwork){
  const frame=parcelFrame(id),image=frame&&art?.[frame.theme];if(!frame||!image)return;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,Math.round(x-width/2),Math.round(y-width*frame.height/frame.width),Math.round(width),Math.round(width*frame.height/frame.width));ctx.restore();
}
