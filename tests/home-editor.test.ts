import test from 'node:test';
import assert from 'node:assert/strict';
import {homeInventory,homeObjects,homeObjectInteraction,type HomeAppearance} from '../web/src/modules/home/objects';
import {homeHit,homeLayoutChanges,validHomePosition} from '../web/src/modules/home/editor';
import {homeAppearanceKey} from '../web/src/modules/home/painter';
import {HOME_FRAMES} from '../web/src/modules/home/assets';
import {homeWalkable} from '../web/src/modules/home/navigation';

test('every default stage furnishing is editable, including hanging and front wall pieces',()=>{
  for(const flags of [[],['greenhouse_sealed'],['greenhouse_fortified_full'],['kingdom_founded']]){
    const state={flags,placements:{}},items=homeInventory(state);
    assert.ok(items.length>=10);assert.equal(new Set(items.map(i=>i.layoutKey)).size,items.length);
    for(const item of items){assert.ok(validHomePosition(item,item.x,item.y),item.layoutKey);const edited={...state,homeLayout:{[item.layoutKey]:{x:item.x,y:item.y,stored:!item.stored}}};assert.equal(homeObjects(edited).some(i=>i.layoutKey===item.layoutKey),item.stored);assert.equal(homeLayoutChanges(state,edited).length,1);}
  }
});

test('later repairs unlock optional furnishings in the bag and preserve saved arrangements across stages',()=>{
  const timber:HomeAppearance={flags:['greenhouse_fortified_full'],placements:{},furniture:['moon_hammock']};
  const celebration:HomeAppearance={...timber,flags:['kingdom_founded']};
  assert.equal(homeObjects(timber).length,10);
  assert.equal(homeObjects(celebration).length,13);
  assert.equal(homeInventory(timber).filter(item=>item.stored&&!item.furnitureId).length,15);
  assert.equal(homeInventory(celebration).filter(item=>item.stored&&!item.furnitureId).length,20);
  const edited:HomeAppearance={...timber,homeLayout:{
    'stage:3:reading-hammock':{x:460,y:625,stored:false},
    'stage:3:cat-tower':{x:1400,y:450,stored:true},
    'furniture:moon_hammock':{x:690,y:650,stored:false},
  }};
  const upgraded={...edited,flags:['kingdom_founded']};
  const hammock=homeObjects(upgraded).find(item=>item.layoutKey==='stage:4:reading-hammock')!;
  assert.deepEqual({x:hammock.x,y:hammock.y},{x:460,y:625});
  assert.equal(homeObjects(upgraded).some(item=>item.id==='cat-tower'),false);
  assert.equal(homeObjects(upgraded).find(item=>item.furnitureId==='moon_hammock')?.x,690);
  assert.equal(homeObjects({...upgraded,homeLayout:{...upgraded.homeLayout,'stage:4:reading-hammock':{x:520,y:600,stored:false}}}).find(item=>item.id==='reading-hammock')?.x,520);
  assert.deepEqual(timber.furniture,['moon_hammock']);
});
test('draft cancellation is isolated; default moves affect navigation and cat interaction at the actual new anchor',()=>{
  const state:HomeAppearance={flags:['greenhouse_fortified_full'],placements:{},furniture:['moon_hammock']},before=structuredClone(state);
  const original=homeObjects(state).find(i=>i.id==='cat-tower')!;
  const edited={...state,homeLayout:{[original.layoutKey]:{x:870,y:560,stored:false},'furniture:moon_hammock':{x:590,y:650,stored:false}}};
  const tower=homeObjects(edited).find(i=>i.id==='cat-tower')!;
  assert.equal(homeWalkable({x:870,y:554},homeObjects(edited)),false);
  assert.equal(homeObjectInteraction(tower).point.x,870);
  assert.equal(homeObjectInteraction(homeObjects(edited).find(i=>i.furnitureId==='moon_hammock')!).point.x,590);
  assert.notEqual(homeAppearanceKey(state),homeAppearanceKey(edited));assert.deepEqual(state,before);
  assert.equal(homeLayoutChanges(state,edited).length,2);
  assert.equal(homeObjects(state).find(i=>i.id==='cat-tower')!.x,original.x);
});
test('stored legacy furniture stays stored and stage-specific overrides do not hide the next stage defaults',()=>{
  const state={flags:[],placements:{corner:'cardboard_nest'},furniture:['cardboard_nest'],homeLayout:{'furniture:cardboard_nest':{x:254,y:382,stored:true},'stage:1:old-rag':{x:292,y:427,stored:true}}};
  assert.ok(!homeObjects(state).some(i=>i.furnitureId==='cardboard_nest'));
  assert.ok(!homeObjects(state).some(i=>i.id==='old-rag'));
  assert.ok(homeObjects({...state,flags:['greenhouse_sealed']}).some(i=>i.id==='straw'));
});
test('newly collected furniture placed once stays visible, hittable and editable after save and re-enter (#1 QA)',()=>{
  const before:HomeAppearance={flags:['greenhouse_fortified_full'],placements:{},furniture:['clover_rug','star_glass']};
  assert.equal(homeInventory(before).find(i=>i.layoutKey==='furniture:clover_rug')!.stored,true);
  const after:HomeAppearance={...before,homeLayout:{'furniture:clover_rug':{x:900,y:640,stored:false}}};
  const items=homeInventory(after),rug=items.find(i=>i.layoutKey==='furniture:clover_rug')!;
  assert.equal(rug.stored,false);assert.equal(rug.x,900);assert.equal(rug.y,640);
  assert.ok(validHomePosition(rug,rug.x,rug.y));
  const frame=HOME_FRAMES[rug.sprite],h=rug.width*frame.height/frame.width;
  assert.equal(homeHit(items,900,644)?.layoutKey,'furniture:clover_rug');
  assert.equal(homeHit(items,900,640-Math.min(h-1,40))?.layoutKey,'furniture:clover_rug');
  assert.equal(homeHit(items,900+rug.width/2+30,640),undefined);
  const moved={...after,homeLayout:{'furniture:clover_rug':{x:960,y:600,stored:false}}};
  assert.deepEqual(homeLayoutChanges(after,moved),[{key:'furniture:clover_rug',x:960,y:600,stored:false}]);
  assert.equal(homeLayoutChanges(after,after).length,0);
});
