import atlas from './atlas.json' with {type:'json'};
// Each item has an individual transparent PNG and a registered in-scene crop.
export const PARCEL_ART = {
  moss_cottage: {widthCm:85,kind:'castle',cat:'diandian',pose:'castle_peek',slot:'corner'},
  fern_lantern: {widthCm:34,kind:'lamp',cat:'miaomiao',pose:'belly',slot:'window'},
  acorn_library: {widthCm:110,kind:'castle',cat:'diandian',pose:'castle_peek',slot:'courtyard'},
  leaf_swing: {widthCm:100,kind:'hammock',cat:'momo',pose:'hammock_sleep',slot:'beam'},
  clover_rug: {widthCm:185,kind:'cushion',cat:'tuanzi',pose:'knead',slot:'sun_spot'},
  willow_sofa: {widthCm:175,kind:'sofa',cat:'tuanzi',pose:'belly',slot:'lounge'},
  herb_desk: {widthCm:150,kind:'workbench',cat:'miaomiao',pose:'sniff',slot:'desk'},
  letter_cabinet: {widthCm:125,kind:'storage',cat:'diandian',pose:'sniff',slot:'cabinet'},
  sprout_planter: {widthCm:120,kind:'plant',cat:'miaomiao',pose:'sniff',slot:'planter'},
  postmark_clock: {widthCm:28,kind:'decor',cat:'momo',pose:'watch',slot:'wall_clock'},
  wicker_basket: {widthCm:40,kind:'decor',cat:'tuanzi',pose:'bat_ball',slot:'toy_corner'},
  seedling_stool: {widthCm:38,kind:'seat',cat:'diandian',pose:'perch',slot:'reading_stool'},
  luna_boat: {widthCm:90,kind:'blanket',cat:'miaomiao',pose:'belly',slot:'corner'},
  orrery_lamp: {widthCm:38,kind:'lamp',cat:'miaomiao',pose:'belly',slot:'window'},
  tide_observatory: {widthCm:122,kind:'castle',cat:'diandian',pose:'castle_peek',slot:'courtyard'},
  orbit_hammock: {widthCm:118,kind:'hammock',cat:'momo',pose:'hammock_sleep',slot:'beam'},
  starmap_carpet: {widthCm:190,kind:'cushion',cat:'tuanzi',pose:'knead',slot:'sun_spot'},
  crescent_sofa: {widthCm:185,kind:'sofa',cat:'tuanzi',pose:'belly',slot:'lounge'},
  astral_desk: {widthCm:155,kind:'workbench',cat:'miaomiao',pose:'sniff',slot:'desk'},
  pearl_cabinet: {widthCm:128,kind:'storage',cat:'diandian',pose:'sniff',slot:'cabinet'},
  nebula_planter: {widthCm:120,kind:'plant',cat:'miaomiao',pose:'sniff',slot:'planter'},
  lunar_clock: {widthCm:30,kind:'decor',cat:'momo',pose:'watch',slot:'wall_clock'},
  comet_mobile: {widthCm:33,kind:'decor',cat:'tuanzi',pose:'bat_chime',slot:'toy_corner'},
  star_stool: {widthCm:40,kind:'seat',cat:'diandian',pose:'perch',slot:'reading_stool'},
} as const;
// A 40 cm cat is about 68 world pixels. All furniture shares this scale.
export const FURNITURE_PIXELS_PER_CM=1.7;
export function parcelWidth(id:string):number{return isParcelFurniture(id)?Math.round(PARCEL_ART[id].widthCm*FURNITURE_PIXELS_PER_CM):0;}
export type ParcelFurnitureID = keyof typeof PARCEL_ART;
export const PARCEL_IDS = Object.keys(PARCEL_ART) as ParcelFurnitureID[];
export function isParcelFurniture(id:string):id is ParcelFurnitureID {return Object.hasOwn(PARCEL_ART,id);}
export type ParcelArtwork={moss:HTMLImageElement;moon:HTMLImageElement};
let loading:Promise<ParcelArtwork>|undefined;
export function loadParcelArtwork():Promise<ParcelArtwork>{
  if(!loading){const load=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('主题家具素材暂时没有送到，请重试。'));image.src=url;});loading=Promise.all([load('/assets/home/furniture-parcels-moss-v2.png'),load('/assets/home/furniture-parcels-moon-v2.png')]).then(([moss,moon])=>({moss,moon})).catch(e=>{loading=undefined;throw e;});}return loading;
}
export function parcelFrame(id:string){
  const key=`parcel.${id}`;
  for(const theme of ['moss','moon'] as const){const frame=(atlas[theme].frames as Record<string,{x:number;y:number;width:number;height:number}>)[key];if(frame)return{...frame,theme};}
  return undefined;
}
export function paintParcelFurniture(ctx:CanvasRenderingContext2D,id:string,x:number,y:number,width:number,art?:ParcelArtwork){
  const frame=parcelFrame(id);if(!frame||!art)return;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(art[frame.theme],frame.x,frame.y,frame.width,frame.height,Math.round(x-width/2),Math.round(y-width*frame.height/frame.width),Math.round(width),Math.round(width*frame.height/frame.width));ctx.restore();
}
