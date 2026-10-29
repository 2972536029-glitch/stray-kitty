import atlas from './atlas.json';
import stageAtlas from './stage-atlas.json';

export const HOME_ART_ID = 'arched-greenhouse-staged-v2';
const legacySprites = ['window.broken','window.patched','window.restored','window.festive','roof.broken','roof.patched','roof.restored','roof.festive','nest','blanket','bowls','chest','tower','planter','workbench','hammock','lantern','string','cushion','floor'] as const;
export const HOME_STAGE_SPRITES = {
  shelter:['s1.box','s1.rag','s1.bucket','s1.basin','s1.deadpots','s1.brokenrack','s1.boards','s1.tools','s1.vine','s1.bench','s1.sack','s1.can'],
  improvised:['s2.workbench','s2.straw','s2.bowls','s2.blanket','s2.tinlamp','s2.shelf','s2.seedlings','s2.storage','s2.nest','s2.scratcher','s2.cushion','s2.plantstool'],
  timber:['s3.bench','s3.chest','s3.tower','s3.hammock','s3.herbs','s3.citrus','s3.flowerpots','s3.seedlingrack','s3.vine','s3.cloudnest','s3.castle','s3.supplies'],
  celebration:['s4.banquet','s4.flags','s4.entryleft','s4.entryright','s4.rug','s4.gifts','s4.flowers','s4.pennant','s4.redcushion','s4.sunlamp','s4.starlamp','s4.wreath'],
  botany:['botany.dryvine','botany.ivy','botany.flowering','botany.hanging','botany.tropical','botany.geranium','botany.spill','botany.herbtub']
} as const;
export const HOME_SPRITES=[...legacySprites,...HOME_STAGE_SPRITES.shelter,...HOME_STAGE_SPRITES.improvised,...HOME_STAGE_SPRITES.timber,...HOME_STAGE_SPRITES.celebration,...HOME_STAGE_SPRITES.botany] as const;
export type HomeSprite = typeof HOME_SPRITES[number];
export const HOME_ATLASES={atlas:'/assets/home/components.png',shelter:'/assets/home/furniture-shelter-v2.png',improvised:'/assets/home/furniture-improvised-v2.png',timber:'/assets/home/furniture-timber-v2.png',celebration:'/assets/home/furniture-celebration-v2.png',botany:'/assets/home/furniture-botany-v2.png'} as const;
export type HomeSheet=keyof typeof HOME_ATLASES;
export interface HomeFrame {x:number;y:number;width:number;height:number;sheet:HomeSheet}
const staged=stageAtlas as unknown as Record<Exclude<HomeSheet,'atlas'>,{width:number;height:number;frames:Record<string,Omit<HomeFrame,'sheet'>>}>;
export const HOME_FRAMES=Object.fromEntries([
  ...legacySprites.map((id,i)=>[id,{...atlas.frames[i],sheet:'atlas'}]),
  ...Object.entries(staged).flatMap(([sheet,data])=>Object.entries(data.frames).map(([id,frame])=>[id,{...frame,sheet}]))
]) as Record<HomeSprite,HomeFrame>;
export type HomeArtwork={base:HTMLImageElement}&Record<HomeSheet,HTMLImageElement>;
let loading: Promise<HomeArtwork> | undefined;
export function loadHomeArtwork(): Promise<HomeArtwork> {
  if (!loading) {
    const load = (url:string) => new Promise<HTMLImageElement>((resolve,reject) => {
      const image = new Image();image.onload = () => resolve(image);image.onerror = () => reject(new Error('花房素材加载失败，请刷新重试'));
      image.src = url;
    });
    loading = Promise.all([load('/assets/home/greenhouse-base.png'),...Object.values(HOME_ATLASES).map(load)])
      .then(([base,...sheets]) => ({base,...Object.fromEntries(Object.keys(HOME_ATLASES).map((sheet,i)=>[sheet,sheets[i]]))} as HomeArtwork)).catch(error => {loading=undefined;throw error;});
  }
  return loading;
}
