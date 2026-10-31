import test from 'node:test';
import assert from 'node:assert/strict';
import {marketEAction,marketInteractionTarget,type MarketFloor} from '../web/src/modules/nightMarket/map';

test('Market keyboard E selects the same nearby unfinished event as its prompt and button',()=>{
  const cases:Array<{floor:MarketFloor;x:number;y:number;flags:string[];drawn:string[];id:string}>=[
    {floor:'L0',x:930,y:195,flags:[],drawn:[],id:'market_momo_trace'},
    {floor:'L0',x:919.91,y:195.06,flags:[],drawn:[],id:'market_momo_trace'},
    {floor:'L0',x:910,y:245,flags:[],drawn:[],id:'market_crow_stall'},
    {floor:'L1',x:1310,y:426,flags:[],drawn:[],id:'market_pigeon_perch'},
    {floor:'L0',x:930,y:195,flags:[],drawn:['node:momo_trail_event'],id:'market_crow_stall'},
    {floor:'L0',x:930,y:195,flags:['market_crow_clue_completed'],drawn:[],id:'market_momo_trace'},
  ];
  for(const c of cases){
    const target=marketInteractionTarget(c.floor,c.x,c.y,c.flags,c.drawn);
    assert.equal(target?.id,c.id);
    assert.deepEqual(marketEAction(c.floor,c.x,c.y,c.flags,c.drawn),{type:'interact',id:c.id,layer:c.floor});
    assert.ok(target?.label.endsWith(' · E'));
  }
  assert.equal(marketInteractionTarget('Lm1',930,195,[],[]),null);
  assert.equal(marketInteractionTarget('L0',930,195,['market_crow_clue_completed'],['node:momo_trail_event']),null);
});
