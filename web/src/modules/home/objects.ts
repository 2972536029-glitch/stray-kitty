import type {GameState} from '../../contracts';
import {HOME_SLOTS, homeStage, type HomePoint} from './layout';
import {HOME_FRAMES, type HomeSprite} from './assets';
export type HomeAppearance=Pick<GameState,'flags'|'placements'> & Partial<Pick<GameState,'phase'|'storyNodeId'>>;
export type HomeObjectKind='decor'|'plant'|'storage'|'workbench'|'nest'|'castle'|'hammock'|'blanket'|'cushion'|'bowls'|'lamp'|'tower';
export interface HomeObject extends HomePoint {id:string;sprite:HomeSprite;width:number;kind:HomeObjectKind;solid:boolean;front?:boolean;slot?:string;furnitureId?:string}
const furnitureSprites:Record<string,{sprite:HomeSprite;width:number;kind:HomeObjectKind}>={
  cardboard_nest:{sprite:'s1.box',width:186,kind:'nest'},box_castle:{sprite:'s3.castle',width:192,kind:'castle'},
  blue_bowl:{sprite:'s2.bowls',width:114,kind:'bowls'},soft_blanket:{sprite:'s2.blanket',width:150,kind:'blanket'},
  snack_cushion:{sprite:'s2.cushion',width:112,kind:'cushion'},red_cushion:{sprite:'s4.redcushion',width:112,kind:'cushion'},
  cloud_nest:{sprite:'s3.cloudnest',width:154,kind:'blanket'},moon_hammock:{sprite:'s3.hammock',width:194,kind:'hammock'},
  tin_lamp:{sprite:'s2.tinlamp',width:52,kind:'lamp'},sun_lamp:{sprite:'s4.sunlamp',width:64,kind:'lamp'},star_glass:{sprite:'s4.starlamp',width:66,kind:'lamp'}
};
type DecorSpec=readonly [id:string,sprite:HomeSprite,x:number,y:number,width:number,kind?:HomeObjectKind];
const derelict:readonly DecorSpec[]=[
  ['old-rag','s1.rag',292,427,120,'blanket'],['rain-bucket','s1.bucket',575,490,48],['rain-basin','s1.basin',965,604,74],
  ['dead-pots','s1.deadpots',1435,414,163,'plant'],['broken-rack','s1.brokenrack',144,453,112,'storage'],
  ['loose-boards','s1.boards',570,360,124],['rusty-tools','s1.tools',1095,358,112,'storage'],
  ['dry-vine','botany.dryvine',770,315,52],['damaged-bench','s1.bench',1300,373,184,'workbench'],
  ['wet-sacks','s1.sack',1180,372,85],['rusty-can','s1.can',1486,544,55]
];
const improvised:readonly DecorSpec[]=[
  ['workbench','s2.workbench',820,370,210,'workbench'],['straw','s2.straw',327,425,158,'blanket'],
  ['work-lantern','s2.tinlamp',998,365,44],['crate-shelf','s2.shelf',1080,370,126,'storage'],
  ['young-plants','s2.seedlings',1415,410,165,'plant'],['supply-crate','s2.storage',560,370,143,'storage'],
  ['scratching-ramp','s2.scratcher',1270,405,126],['stool-seedling','s2.plantstool',154,480,87,'plant']
];
const garden:readonly DecorSpec[]=[
  ['workbench','s3.bench',820,375,236,'workbench'],['food-storage','s3.chest',555,369,168,'storage'],
  ['cat-tower','s3.tower',1470,455,160,'tower'],['north-herbs','s3.herbs',1120,375,208,'plant'],
  ['citrus-tree','s3.citrus',1320,379,142,'plant'],['south-flowers','s3.flowerpots',470,716,203,'plant'],
  ['west-plant-stand','s3.seedlingrack',147,478,119,'plant'],['north-vines','botany.ivy',775,315,63],
  ['west-vines','botany.flowering',440,315,64],['east-vines','botany.ivy',1256,316,48],
  ['hanging-fern','botany.hanging',1100,256,71],['garden-handcart','s3.supplies',1200,710,154,'storage'],
  ['crate-shelf','s2.shelf',405,379,106,'storage'],['stool-seedling','s2.plantstool',1523,553,87,'plant'],
  ['work-lantern','s2.tinlamp',994,365,42],['round-bed','s3.cloudnest',1300,505,149,'blanket'],
  ['west-leaf-tub','botany.tropical',166,701,153,'plant'],['red-geraniums','botany.geranium',1330,725,112,'plant'],
  ['herb-tub','botany.herbtub',1440,552,94,'plant'],['wall-ivy','botany.spill',438,866,192],['south-east-ivy','botany.spill',1193,860,154]
];
const celebration:readonly DecorSpec[]=[
  ['workbench','s4.banquet',815,385,250,'workbench'],['welcome-left','s4.entryleft',643,726,132],
  ['welcome-right','s4.entryright',1005,725,147,'plant'],['entry-rug','s4.rug',824,723,191],
  ['gifts','s4.gifts',530,420,142,'storage'],['celebration-flowers','s4.flowers',1230,411,163,'plant'],
  ['celebration-banner','s4.pennant',180,564,78],['entry-wreath','s4.wreath',821,805,72]
];
export function homeObjects(state:HomeAppearance):HomeObject[]{
  const stage=homeStage(state),objects:HomeObject[]=[];
  const add=([id,sprite,x,y,width,kind='decor']:DecorSpec)=>objects.push({id,sprite,x,y,width,kind,front:['wall-ivy','south-east-ivy','entry-wreath'].includes(id),solid:['plant','storage','workbench','nest','castle','hammock','tower'].includes(kind)});
  // Repair stages own different furnishing schemes; the celebration retains
  // the living garden and turns the work area into a communal feast.
  const scheme=stage===1?derelict:stage===2?improvised:stage===3?garden:[...garden.filter(item=>item[0]!=='workbench'),...celebration];
  for(const item of scheme)add(item);
  if(!state.placements.corner)add(['shelter',stage===1?'s1.box':stage===2?'s2.nest':'s3.castle',HOME_SLOTS.corner.x,HOME_SLOTS.corner.y,186,stage>=3?'castle':'nest']);
  // Default living corners disappear when the player places their own item.
  // They do not grant furniture ownership or overwrite any saved placement.
  if(stage>=2&&!state.placements.window)add(['feeding-corner','s2.bowls',HOME_SLOTS.window.x,HOME_SLOTS.window.y,114,'bowls']);
  if(stage>=3&&!state.placements.beam)add(['reading-hammock','s3.hammock',HOME_SLOTS.beam.x,HOME_SLOTS.beam.y,194,'hammock']);
  if(stage>=3&&!state.placements.sun_spot)add(['sun-bedding','s2.blanket',HOME_SLOTS.sun_spot.x,HOME_SLOTS.sun_spot.y,150,'blanket']);
  for(const [slot,id] of Object.entries(state.placements)){
    const point=HOME_SLOTS[slot],appearance=furnitureSprites[id];
    if(!point||!appearance||((slot==='beam'||slot==='sun_spot')&&stage<3))continue;
    const sprite=id==='cardboard_nest'&&stage>=2?'s2.nest':appearance.sprite;
    const y=id==='star_glass'?Math.min(350,point.y-150):point.y;
    objects.push({id:'placed:'+slot,...point,y,...appearance,sprite,solid:['nest','castle','hammock'].includes(appearance.kind),slot,furnitureId:id});
  }
  return objects.sort((a,b)=>a.y-b.y);
}
export function homePosePoint(slot:string,id:string):HomePoint {
  const point=HOME_SLOTS[slot]??HOME_SLOTS.corner,appearance=furnitureSprites[id];
  if(!appearance)return point;
  const frame=HOME_FRAMES[appearance.sprite],height=appearance.width*frame.height/frame.width;
  if(id==='box_castle')return{x:point.x-appearance.width*.14,y:point.y-height*.28};
  if(id==='moon_hammock')return{x:point.x,y:point.y-height*.31};
  if(id==='blue_bowl')return{x:point.x+37,y:point.y-2};
  if(id==='soft_blanket'||id==='snack_cushion'||id==='red_cushion')return{x:point.x,y:point.y-height*.4};
  if(id==='sun_lamp')return{x:point.x+50,y:point.y+2};
  return point;
}
