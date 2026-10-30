import {SCENE_VIGNETTE_ASPECT,type SceneVignetteKind} from './scene-vignettes';
import type {BattleSceneId,ScenePropKind} from './scene-art';

export interface SceneryRect {x:number;y:number;width:number;height:number}
interface GroupPlan {kind:SceneVignetteKind;side:0|1;across:number;depth:number;width:number}
interface GroupPlacement extends SceneryRect {kind:SceneVignetteKind;index:number}
interface AccentPlan {kind:ScenePropKind;across:number;edge:'top'|'bottom';inset:number;size:number}
interface AccentPlacement extends SceneryRect {kind:ScenePropKind;index:number}
const overlaps=(a:SceneryRect,b:SceneryRect,gap=12)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;

// Each workstation appears once. The greenhouse has two different activities,
// deliberately offset in height, scale and distance from the board.
const groups:Record<BattleSceneId,readonly GroupPlan[]>={
  prologue:[{kind:'alley-supplies',side:0,across:.64,depth:.65,width:215}],
  alley:[{kind:'alley-supplies',side:1,across:.28,depth:.65,width:245}],
  market:[{kind:'market-goods',side:0,across:.25,depth:.32,width:270}],
  greenhouse:[{kind:'garden-bench',side:0,across:.16,depth:.24,width:280},{kind:'potting-corner',side:1,across:.7,depth:.74,width:220}],
  tunnel:[{kind:'pump-station',side:1,across:.35,depth:.67,width:255}],
  finale:[{kind:'warehouse-workbench',side:0,across:.5,depth:.42,width:270}],
};

// Sparse, chapter-specific accents replace the two rows of identical props.
// Skipped anchors stay empty rather than being filled with another duplicate.
const accents:Record<BattleSceneId,readonly AccentPlan[]>={
  prologue:[{kind:'bin',across:.08,edge:'top',inset:118,size:92},{kind:'drain',across:.84,edge:'bottom',inset:126,size:76},{kind:'sacks',across:.69,edge:'top',inset:91,size:68}],
  alley:[{kind:'bin',across:.1,edge:'top',inset:115,size:106},{kind:'sacks',across:.25,edge:'bottom',inset:137,size:74},{kind:'drain',across:.73,edge:'top',inset:99,size:63}],
  market:[{kind:'notice-stall',across:.85,edge:'top',inset:103,size:116},{kind:'crate',across:.72,edge:'bottom',inset:135,size:86},{kind:'sacks',across:.13,edge:'bottom',inset:179,size:66}],
  greenhouse:[{kind:'planter',across:.84,edge:'top',inset:118,size:96},{kind:'broken-pot',across:.18,edge:'bottom',inset:244,size:70}],
  tunnel:[{kind:'pipe',across:.12,edge:'top',inset:105,size:97},{kind:'barrier',across:.25,edge:'bottom',inset:151,size:86},{kind:'drain',across:.81,edge:'bottom',inset:117,size:60}],
  finale:[{kind:'storage-rack',across:.86,edge:'top',inset:116,size:111},{kind:'cable',across:.7,edge:'bottom',inset:144,size:79},{kind:'warehouse-crates',across:.23,edge:'bottom',inset:158,size:65}],
};

/** Fit authored, asymmetric groups in the margins without changing the board. */
export function planSceneryGroups(scene:BattleSceneId,width:number,height:number,board:SceneryRect,occupied:readonly SceneryRect[]):GroupPlacement[]{
  if(width<840)return [];
  const top=154,bottom=height-182;
  if(bottom-top<100)return [];
  const sides=[{left:24,right:Math.max(24,board.x-24)},{left:Math.min(width-24,board.x+board.width+24),right:width-24}];
  const result:GroupPlacement[]=[];
  groups[scene].forEach((plan,index)=>{
    const {left,right}=sides[plan.side];
    if(right-left<166)return;
    const sizeFactor=Math.max(.72,Math.min(1,(height-150)/680));
    const maxWidth=Math.min(plan.width*sizeFactor,right-left-24,(bottom-top-16)*SCENE_VIGNETTE_ASPECT);
    const centerY=top+(bottom-top)*plan.depth;
    let placed=false;
    for(const scale of [1,.88,.76]){
      if(placed)break;
      const w=Math.floor(maxWidth*scale),h=Math.ceil(w/SCENE_VIGNETTE_ASPECT);
      if(w<140)continue;
      const blocked=[...occupied,...result];
      const idealY=Math.max(top,Math.min(bottom-h,centerY-h/2));
      const positions=[idealY,top,bottom-h,...blocked.flatMap(rect=>[rect.y+rect.height+12,rect.y-h-12])]
        .map(Math.round).sort((a,b)=>Math.abs(a-idealY)-Math.abs(b-idealY));
      for(const y of positions){
        if(placed)break;
        for(const fraction of [plan.across,.5,.15,.85]){
          const candidate={x:Math.round(left+(right-left-w)*fraction),y,width:w,height:h,kind:plan.kind,index};
          if(candidate.y<top||candidate.y+h>bottom)continue;
          if(blocked.some(rect=>overlaps(candidate,rect)))continue;
          result.push(candidate);placed=true;break;
        }
      }
    }
  });
  return result;
}

export function planSceneryAccents(scene:BattleSceneId,width:number,height:number,occupied:readonly SceneryRect[]):AccentPlacement[]{
  if(width<840)return [];
  const result:AccentPlacement[]=[];
  accents[scene].forEach((plan,index)=>{
    const size=plan.size;
    const candidate={x:Math.round(24+(width-size-48)*plan.across),y:Math.round(plan.edge==='top'?plan.inset:height-plan.inset),width:size,height:size,kind:plan.kind,index:index+2};
    if(candidate.y<24||candidate.y+size>height-24)return;
    if([...occupied,...result].some(rect=>overlaps(candidate,rect)))return;
    result.push(candidate);
  });
  return result;
}
