import {furnitureWidth, furnitureCategory, type FurnitureCategory} from './furnishings';
import {homeObjectDepth} from './spatial';
import decor from '../../../content/home/decor.json' with { type: 'json' };
import type {GameState,HomeDecor} from '../../contracts';
import type {CatBreed} from '../../adapters/canvas/pixelCat';
import {HOME_SLOTS, homeSlotPoint, homeStage, type HomePoint} from './layout';
import {HOME_FRAMES, type HomeSprite} from './assets';
import {PARCEL_ART, PARCEL_IDS, isParcelFurniture, parcelWidth} from '../lottery/furnitureArt';
export type HomeAppearance=Pick<GameState,'flags'|'placements'> & Partial<Pick<GameState,'phase'|'storyNodeId'|'furniture'|'homeLayout'|'homeRepairs'|'homeDecorOwned'>>;
export type HomeObjectKind='decor'|'plant'|'storage'|'workbench'|'nest'|'castle'|'hammock'|'blanket'|'cushion'|'bowls'|'lamp'|'tower'|'sofa'|'seat';
export interface HomeObject extends HomePoint {id:string;layoutKey:string;wall?:boolean;sprite:HomeSprite;width:number;kind:HomeObjectKind;solid:boolean;front?:boolean;slot?:string;furnitureId?:string}
const furnitureSprites:Record<string,{sprite:HomeSprite;width:number;kind:HomeObjectKind}>={
  ...Object.fromEntries(PARCEL_IDS.map(id=>[id,{sprite:`parcel.${id}` as HomeSprite,width:parcelWidth(id),kind:PARCEL_ART[id].kind}])),
  cardboard_nest:{sprite:'s1.box',width:furnitureWidth('cardboard_nest'),kind:'nest'},box_castle:{sprite:'s3.castle',width:furnitureWidth('box_castle'),kind:'castle'},
  blue_bowl:{sprite:'s2.bowls',width:furnitureWidth('blue_bowl'),kind:'bowls'},soft_blanket:{sprite:'s2.blanket',width:furnitureWidth('soft_blanket'),kind:'blanket'},
  snack_cushion:{sprite:'s2.cushion',width:furnitureWidth('snack_cushion'),kind:'cushion'},red_cushion:{sprite:'s4.redcushion',width:furnitureWidth('red_cushion'),kind:'cushion'},
  cloud_nest:{sprite:'s3.cloudnest',width:furnitureWidth('cloud_nest'),kind:'blanket'},moon_hammock:{sprite:'s3.hammock',width:furnitureWidth('moon_hammock'),kind:'hammock'},
  tin_lamp:{sprite:'s2.tinlamp',width:furnitureWidth('tin_lamp'),kind:'lamp'},sun_lamp:{sprite:'s4.sunlamp',width:furnitureWidth('sun_lamp'),kind:'lamp'},star_glass:{sprite:'s4.starlamp',width:furnitureWidth('star_glass'),kind:'lamp'}
};
export interface HomeItem extends HomeObject {stored:boolean;name:string;category:FurnitureCategory;owned?:boolean;description?:string;acquisition?:HomeDecor['acquisition']}
export function homeInventory(state:HomeAppearance,includeAvailable=false):HomeItem[]{
  const stage=homeStage(state),items:HomeItem[]=[];
  for(const d of (decor as HomeDecor[]).filter(d=>d.stage===stage)){
    // A player's arrangement follows the same furnishing through later repairs.
    // An explicit current-stage edit takes precedence over an inherited one.
    const earlier=stage>=3?decor.filter(previous=>previous.stage<stage&&(previous.objectId===d.objectId||previous.objectId===d.renovatedFrom)).sort((a,b)=>b.stage-a.stage).find(previous=>state.homeLayout?.[previous.id]):undefined;
    const owned=!d.acquisition||!!state.homeDecorOwned?.includes(d.objectId)||decor.some(previous=>previous.objectId===d.objectId&&previous.stage<=stage&&!!state.homeLayout?.[previous.id]);
    if(!owned&&!includeAvailable)continue;
    const override=state.homeLayout?.[d.id]??(earlier?state.homeLayout?.[earlier.id]:undefined),kind=d.kind as HomeObjectKind;
    const storedByDefault='storedByDefault' in d&&d.storedByDefault===true;
    items.push({id:d.objectId,layoutKey:d.id,sprite:d.sprite as HomeSprite,x:d.x,y:d.y,width:d.width,kind,front:d.front,wall:d.wall,solid:['plant','storage','workbench','nest','castle','hammock','tower'].includes(kind),name:d.name,category:furnitureCategory(d.id,true),owned,description:d.description??d.acquisition?.description,acquisition:d.acquisition,stored:storedByDefault||!!(d.replacementSlot&&state.placements[d.replacementSlot]),...override});
  }
  const owned=state.furniture??Object.values(state.placements);
  for(const id of owned){
    const appearance=furnitureSprites[id];if(!appearance)continue;
    const slot=Object.keys(state.placements).find(slot=>state.placements[slot]===id),point=homeSlotPoint(slot??'',stage)??{x:820,y:540};
    const locked=!!slot&&['beam','sun_spot'].includes(slot)&&stage<3;
    const sprite=id==='cardboard_nest'&&stage>=2?'s2.nest':appearance.sprite;
    const layoutKey='furniture:'+id,override=state.homeLayout?.[layoutKey];
    items.push({id:slot?'placed:'+slot:layoutKey,layoutKey,...appearance,sprite,...point,y:id==='star_glass'?Math.min(350,point.y-150):id==='comet_mobile'?point.y-58:point.y,solid:['nest','castle','hammock','storage','workbench','plant','sofa','seat'].includes(appearance.kind),slot:slot??layoutKey,furnitureId:id,name:id,category:furnitureCategory(id),wall:['star_glass','postmark_clock','lunar_clock','comet_mobile'].includes(id),stored:!slot||locked,...override});
  }
  return items;
}
export function homeObjects(state:HomeAppearance):HomeObject[]{return homeInventory(state).filter(item=>!item.stored).sort((a,b)=>homeObjectDepth(a)-homeObjectDepth(b));}
export function homeObjectInteraction(object:HomeObject):{cat:CatBreed;pose:string;point:HomePoint}{
  const id=object.furnitureId;
  if(id&&isParcelFurniture(id)){const m=PARCEL_ART[id];return{cat:m.cat,pose:m.pose,point:homePosePoint(object.slot??'',id,object)};}
  const h=object.width*HOME_FRAMES[object.sprite].height/HOME_FRAMES[object.sprite].width;
  const base={x:object.x,y:Math.max(375,Math.min(723,object.y))};
  if(object.kind==='castle'||object.kind==='nest')return{cat:'diandian',pose:'castle_peek',point:{x:object.x,y:object.y-h*.18+16}};
  if(object.kind==='tower')return{cat:'diandian',pose:'perch',point:{x:object.x,y:object.y-h*.8}};
  if(object.kind==='hammock')return{cat:'momo',pose:'hammock_sleep',point:{x:object.x,y:object.y-h*.31}};
  if(object.kind==='bowls')return{cat:'tuanzi',pose:'bowl_eat',point:{x:object.x+37,y:object.y-2}};
  if(object.kind==='cushion')return{cat:'tuanzi',pose:'knead',point:{x:object.x,y:object.y-h*.3}};
  if(object.kind==='blanket')return{cat:'miaomiao',pose:'belly',point:{x:object.x,y:object.y-h*.3}};
  if(object.kind==='plant'||object.kind==='storage'||object.kind==='workbench')return{cat:'miaomiao',pose:'sniff',point:{x:Math.min(1510,object.x+object.width*.4),y:base.y}};
  return{cat:'momo',pose:'watch',point:{x:base.x,y:Math.max(385,base.y+20)}};
}
export function homePosePoint(slot:string,id:string,position?:HomePoint):HomePoint {
  const point=position??HOME_SLOTS[slot]??HOME_SLOTS.corner,appearance=furnitureSprites[id];
  if(!appearance)return point;
  const frame=HOME_FRAMES[appearance.sprite],height=appearance.width*frame.height/frame.width;
  if(isParcelFurniture(id)){
    const pose=PARCEL_ART[id].pose;
    if(pose==='castle_peek')return{x:point.x,y:point.y-height*.18+16};
    if(pose==='perch')return{x:point.x,y:point.y-height*.67};
    if(pose==='watch')return{x:point.x,y:Math.max(375,point.y+55)};
    if(pose==='sniff')return{x:point.x+appearance.width*.33,y:point.y+12};
    if(pose==='bat_ball'||pose==='bat_chime')return{x:point.x+35,y:point.y};
    if(id==='willow_sofa'||id==='crescent_sofa')return{x:point.x,y:point.y-height*.36};
  }
  if(id==='box_castle'||id==='cardboard_nest')return{x:point.x,y:point.y-height*.18+16};
  if(id==='moss_cottage')return{x:point.x-appearance.width*.06,y:point.y-height*.3};
  if(id==='tide_observatory')return{x:point.x-appearance.width*.13,y:point.y-height*.21};
  if(id==='acorn_library')return{x:point.x,y:point.y-height*.24};
  if(appearance.kind==='castle')return{x:point.x,y:point.y-height*.3};
  if(appearance.kind==='hammock')return{x:point.x,y:point.y-height*(isParcelFurniture(id)?.24:.31)};
  if(isParcelFurniture(id)&&appearance.kind==='lamp')return{x:point.x+45,y:point.y};
  if(isParcelFurniture(id)&&appearance.kind==='blanket')return{x:point.x,y:point.y-height*.25};
  if(isParcelFurniture(id)&&appearance.kind==='cushion')return{x:point.x,y:point.y-height*.31};
  if(id==='blue_bowl')return{x:point.x+37,y:point.y-2};
  if(id==='soft_blanket'||id==='snack_cushion'||id==='red_cushion')return{x:point.x,y:point.y-height*.4};
  if(id==='sun_lamp')return{x:point.x+50,y:point.y+2};
  return point;
}
