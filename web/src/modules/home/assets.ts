import atlas from './atlas.json' with { type: 'json' };
import stageAtlas from './stage-atlas.json' with { type: 'json' };
import parcelAtlas from '../lottery/atlas.json' with { type: 'json' };
import {PARCEL_IDS} from '../lottery/furnitureArt';
import {chapterBackgroundReady} from '../map/artwork';
import {loadCachedImage} from '../../core/image-loading';

export const HOME_ART_ID = 'arched-greenhouse-staged-v3';
const legacySprites = ['window.broken','window.patched','window.restored','window.festive','roof.broken','roof.patched','roof.restored','roof.festive','nest','blanket','bowls','chest','tower','planter','workbench','hammock','lantern','string','cushion','floor'] as const;
export const HOME_STAGE_SPRITES = {
  shelter:['s1.box','s1.rag','s1.bucket','s1.basin','s1.deadpots','s1.brokenrack','s1.boards','s1.tools','s1.vine','s1.bench','s1.sack','s1.can'],
  improvised:['s2.workbench','s2.straw','s2.bowls','s2.blanket','s2.tinlamp','s2.shelf','s2.seedlings','s2.storage','s2.nest','s2.scratcher','s2.cushion','s2.plantstool'],
  timber:['s3.bench','s3.chest','s3.tower','s3.hammock','s3.herbs','s3.citrus','s3.flowerpots','s3.seedlingrack','s3.vine','s3.cloudnest','s3.castle','s3.supplies'],
  celebration:['s4.banquet','s4.flags','s4.entryleft','s4.entryright','s4.rug','s4.gifts','s4.flowers','s4.pennant','s4.redcushion','s4.sunlamp','s4.starlamp','s4.wreath'],
  botany:['botany.dryvine','botany.ivy','botany.flowering','botany.hanging','botany.tropical','botany.geranium','botany.spill','botany.herbtub']
} as const;
const parcelSprites=PARCEL_IDS.map(id=>`parcel.${id}` as const);
export const HOME_SPRITES=[...legacySprites,...HOME_STAGE_SPRITES.shelter,...HOME_STAGE_SPRITES.improvised,...HOME_STAGE_SPRITES.timber,...HOME_STAGE_SPRITES.celebration,...HOME_STAGE_SPRITES.botany,...parcelSprites] as const;
export type HomeSprite = typeof HOME_SPRITES[number];
export const HOME_ATLASES={atlas:'/assets/home/components.png',shelter:'/assets/home/furniture-shelter-v3.png',improvised:'/assets/home/furniture-improvised-v3.png',timber:'/assets/home/furniture-timber-v3.png',celebration:'/assets/home/furniture-celebration-v3.png',botany:'/assets/home/furniture-botany-v2.png',botanyFront:'/assets/home/planter-tropical-front-v3.png',parcelMoss:'/assets/home/furniture-parcels-moss-v2.png',parcelMoon:'/assets/home/furniture-parcels-moon-v2.png'} as const;
export type HomeSheet=keyof typeof HOME_ATLASES;
export interface HomeFrame {x:number;y:number;width:number;height:number;sheet:HomeSheet}
const staged={...stageAtlas,parcelMoss:parcelAtlas.moss,parcelMoon:parcelAtlas.moon} as unknown as Record<Exclude<HomeSheet,'atlas'|'botanyFront'>,{width:number;height:number;frames:Record<string,Omit<HomeFrame,'sheet'>>}>;
export const HOME_FRAMES=Object.fromEntries([
  ...legacySprites.map((id,i)=>[id,{...atlas.frames[i],sheet:'atlas'}]),
  ...Object.entries(staged).flatMap(([sheet,data])=>Object.entries(data.frames).map(([id,frame])=>[id,{...frame,sheet}])),
  ['botany.tropical',{x:0,y:0,width:1374,height:1145,sheet:'botanyFront'}]
]) as Record<HomeSprite,HomeFrame>;
export type HomeArtwork={base:HTMLImageElement;atlas:HTMLImageElement}&Partial<Record<HomeSheet,HTMLImageElement>>;
export function loadHomeSheet(sheet:HomeSheet):Promise<HTMLImageElement>{
  const original=HOME_ATLASES[sheet];
  return loadCachedImage(original.replace(/\.png$/,'.lossless.webp'),original);
}
export async function loadHomeArtwork(sprites:readonly HomeSprite[]=HOME_SPRITES):Promise<HomeArtwork>{
  const sheets=[...new Set<HomeSheet>(['atlas',...sprites.map(sprite=>HOME_FRAMES[sprite].sheet)])];
  try{
    const [base,entries]=await Promise.all([chapterBackgroundReady('greenhouse'),Promise.all(sheets.map(async sheet=>[sheet,await loadHomeSheet(sheet)] as const))]);
    return {base,...Object.fromEntries(entries)} as HomeArtwork;
  }catch{throw new Error('花房素材加载失败，请刷新重试');}
}
