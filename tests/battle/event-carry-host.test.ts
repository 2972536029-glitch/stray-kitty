import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {BattleCarryId, Catalog, GameState} from '../../web/src/contracts/index.ts';
import type {BattleCarryState} from '../../web/src/modules/battle/carry.ts';
import {createChapterContext} from '../../web/src/modules/battle/chapter-context.ts';
import {createMarketContext} from '../../web/src/modules/battle/market-context.ts';
import {createGreenhouseContext} from '../../web/src/modules/battle/greenhouse-context.ts';
import {createL00Context} from '../../web/src/modules/battle/host-context.ts';
import {canUseCarry, carryDescription, getCarryWavePreview} from '../../web/src/modules/battle/CarryPanel.tsx';
import {createChapterBattle} from '../../web/src/modules/battle/chapter/engine.ts';
import {createMarketBattle} from '../../web/src/modules/battle/market/engine.ts';
import {createGreenhouseBattle} from '../../web/src/modules/battle/greenhouse/engine.ts';
import * as chapter from '../../web/src/modules/battle/chapter/config.ts';
import * as market from '../../web/src/modules/battle/market/config.ts';
import * as greenhouse from '../../web/src/modules/battle/greenhouse/config.ts';
import * as tunnel from '../../web/src/modules/battle/tunnel/config.ts';
import * as finale from '../../web/src/modules/battle/finale/config.ts';
import {createFinaleContext} from '../../web/src/modules/battle/finale-context.ts';
import {createFinaleBattle} from '../../web/src/modules/battle/finale/engine.ts';
import {createTunnelContext} from '../../web/src/modules/battle/tunnel-context.ts';
import {createTunnelBattle} from '../../web/src/modules/battle/tunnel/engine.ts';

const catalog: Pick<Catalog, 'stages'> = JSON.parse(fs.readFileSync('web/content/catalog.json', 'utf8'));
const ids: BattleCarryId[] = ['lantern','mirror','bell','box','dog','dove'];
const stages = [
  {id: 'alley_rescue', context: createChapterContext, create: createChapterBattle, anchor: {x:3,y:0}},
  {id: 'alley_boss', context: createChapterContext, create: createChapterBattle, anchor: {x:3,y:0}},
  {id: 'market_boss', context: createMarketContext, create: createMarketBattle, anchor: {x:3,y:0}},
  {id: 'greenhouse_boss', context: createGreenhouseContext, create: createGreenhouseBattle, anchor: {x:7,y:2}},
  {id: 'tunnel_boss', context: createTunnelContext, create: createTunnelBattle, anchor: {x:7,y:1}},
  {id: 'finale_boss', context: createFinaleContext, create: createFinaleBattle, anchor: {x:10,y:0}},
];
function fixture(stageId: string, carry?: unknown) {
  const state: Pick<GameState, 'phase'|'activeBattle'> & {eventState: unknown} = {
    phase:'battle',activeBattle:{id:'carry-saved-attempt',stageId,status:'active',modifiers:{shadowPressure:1}},
    eventState:{pendingModifiers:{shadowPressure:-1,carry:'bell'}},
  };
  if(carry!==undefined)Object.assign(state.activeBattle!.modifiers!,{carry});
  return state;
}

for(const stage of stages)test(`${stage.id}: restore the attempt carry and tier without reading later event output`,()=>{
  for(const id of ids){
    const state=fixture(stage.id,id),before=structuredClone(state);
    const context=stage.context(JSON.parse(JSON.stringify(state)),catalog);
    assert.deepEqual(context,{attemptId:'carry-saved-attempt',difficulty:'high',carry:id});
    const battle=stage.create(context);
    assert.equal(battle.carry.id,id);assert.deepEqual(battle.carry.anchor,stage.anchor);
    assert.equal(battle.difficulty,'high');assert.equal(battle.carry.used,false);
    assert.deepEqual(state,before);
  }
});

test('old attempts omit carry, and unknown carry becomes a warning without blocking battle entry',()=>{
  for(const stage of stages){
    const context=stage.context(fixture(stage.id),catalog);
    assert.deepEqual(context,{attemptId:'carry-saved-attempt',difficulty:'high'});
    const plain=stage.create(context);assert.equal(plain.carry.id,null);assert.equal(plain.carry.warning,null);
    for(const unknown of ['unreleased-carry','pigeon','crow',42,{id:'mirror'},false]){
      const original=fixture(stage.id,unknown),before=structuredClone(original);
      const restored=stage.context(original,catalog),battle=stage.create(restored);
      assert.deepEqual(restored.carry,unknown);assert.equal(battle.phase,'ready');assert.equal(battle.carry.id,null);
      assert.match(battle.carry.warning ?? '',/无法识别|未识别|未知|不支持/);
      assert.deepEqual(battle.cats,plain.cats);assert.deepEqual(battle.boss,plain.boss);assert.deepEqual(original,before);
    }
  }
});

test('the L00 host never forwards an event carry into the tutorial',()=>{
  for(const carry of ids){
    const context=createL00Context({...fixture('l00_tutorial',carry),cats:['miaomiao']},catalog);
    assert.equal('carry' in context,false);assert.equal('modifiers' in context.attempt,false);assert.deepEqual(context.modifiers,[]);
  }
});

test('mirror control is available once in active play and stays disabled in ready, pause and terminal phases',()=>{
  const carry=createGreenhouseBattle({carry:'mirror'}).carry;
  assert.equal(canUseCarry(carry,'battle',false),true);
  for(const phase of ['ready','won','lost'] as const)assert.equal(canUseCarry(carry,phase,false),false);
  assert.equal(canUseCarry(carry,'battle',true),false);
  assert.equal(canUseCarry({...carry,used:true},'battle',false),false);
  for(const id of ids.filter(id=>id!=='mirror'))assert.equal(canUseCarry({...carry,id},'battle',false),false);
});

const previews=[
  {config:chapter,entrances:{'0':chapter.MAP.spawns[2],'3':chapter.MAP.spawns[0],'4':chapter.MAP.spawns[1]},first:['A4','E10','D10']},
  {config:market,entrances:Object.fromEntries(Object.entries(market.ROUTES).map(([id,path])=>[id,path[0]])),first:['A4','C8','E4']},
  {config:finale,entrances:Object.fromEntries(Object.entries(finale.ROUTES).map(([id,path])=>[id,path[0]])),first:['A11','G11','D12']},
  {config:tunnel,entrances:Object.fromEntries(Object.entries(tunnel.ROUTES).map(([id,path])=>[id,path[0]])),first:['B8','D8','A2']},
  {config:greenhouse,entrances:Object.fromEntries(Object.entries(greenhouse.ROUTES).map(([id,path])=>[id,path[0]])),first:['C8','E8']},
];
test('dove reports real first, current and next waves with accurate entrances, enemy kinds and counts',()=>{
  for(const {config,entrances,first} of previews){
    const before=structuredClone(config.WAVES);
    const initial=getCarryWavePreview(config.WAVES,0,'ready',entrances,config.ENEMY_DEFINITIONS);
    assert.equal(initial.length,1);assert.equal(initial[0].label,'首波预告');assert.equal(initial[0].wave,1);
    assert.deepEqual([...new Set(initial[0].groups.map(group=>group.entrance))],first);
    for(let wave=1;wave<config.WAVES.length;wave++){
      const preview=getCarryWavePreview(config.WAVES,wave,'battle',entrances,config.ENEMY_DEFINITIONS);
      assert.deepEqual(preview.map(item=>item.wave),[wave,wave+1]);
      for(const item of preview){
        assert.equal(item.total,config.WAVES[item.wave-1].length);assert.equal(item.groups.reduce((sum,group)=>sum+group.count,0),item.total);
        for(const enemy of Object.values(config.ENEMY_DEFINITIONS)){
          const kind=Object.entries(config.ENEMY_DEFINITIONS).find(([,value])=>value===enemy)![0];
          assert.equal(item.groups.filter(group=>group.enemy===enemy.name).reduce((sum,group)=>sum+group.count,0),config.WAVES[item.wave-1].filter(entry=>entry.kind===kind).length);
        }
      }
    }
    for(const phase of ['battle','won','lost'] as const){
      const last=getCarryWavePreview(config.WAVES,config.WAVES.length,phase,entrances,config.ENEMY_DEFINITIONS);
      assert.equal(last.length,1);assert.equal(last[0].wave,config.WAVES.length);assert.equal(last[0].label,'最后一波');
    }
    assert.deepEqual(config.WAVES,before);
  }
});

test('carry descriptions explain the actual limits without a backpack or inventory cost',()=>{
  const carry=createGreenhouseBattle({carry:'lantern'}).carry;
  const describe=(id:BattleCarryId)=>carryDescription({...carry,id} as BattleCarryState);
  assert.match(describe('lantern'),/C8.*2 格.*4 秒.*20.*不影响首领/);
  assert.match(describe('mirror'),/一次.*全部小怪.*移动与攻击 3 秒.*不影响首领/);
  assert.match(describe('bell'),/20 能量.*100.*一次/);
  assert.match(describe('box'),/首波.*C8.*2 秒.*不占部署格/);
  assert.match(describe('dog'),/C8.*25%.*较慢.*不相乘/);
  assert.match(describe('dove'),/真实波表.*入口、怪种与数量.*不改变出怪时间/);
  for(const id of ids)assert.doesNotMatch(describe(id),/仓库消耗|免费发放|背包/);
});
