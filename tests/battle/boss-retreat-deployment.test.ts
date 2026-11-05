import assert from 'node:assert/strict';
import test from 'node:test';
import {buildModelAdvisorContext} from '../../web/src/modules/battle/advisor-context.ts';
import {cellName} from '../../web/src/modules/battle/shared/geometry.ts';
import {createChapterBattle, dispatchChapter, advanceChapter, isDeployableCell as chapterDeployable} from '../../web/src/modules/battle/chapter/engine.ts';
import {createMarketBattle, dispatchMarket, advanceMarket, isDeployableCell as marketDeployable} from '../../web/src/modules/battle/market/engine.ts';
import {createGreenhouseBattle, dispatchGreenhouse, advanceGreenhouse, isDeployableCell as greenhouseDeployable} from '../../web/src/modules/battle/greenhouse/engine.ts';
import {createTunnelBattle, dispatchTunnel, advanceTunnel, isDeployableCell as tunnelDeployable} from '../../web/src/modules/battle/tunnel/engine.ts';
import {createFinaleBattle, dispatchFinale, advanceFinale, isDeployableCell as finaleDeployable} from '../../web/src/modules/battle/finale/engine.ts';
import {MAP as CHAPTER_MAP} from '../../web/src/modules/battle/chapter/config.ts';
import {MAP as MARKET_MAP} from '../../web/src/modules/battle/market/config.ts';
import {MAP as GREENHOUSE_MAP} from '../../web/src/modules/battle/greenhouse/config.ts';
import {MAP as TUNNEL_MAP} from '../../web/src/modules/battle/tunnel/config.ts';
import {MAP as FINALE_MAP, ALLY_DEFINITIONS} from '../../web/src/modules/battle/finale/config.ts';
import {getChapterAnswer} from '../../web/src/modules/battle/chapter/advisor.ts';
import {getMarketAnswer} from '../../web/src/modules/battle/market/advisor.ts';
import {getGreenhouseAnswer} from '../../web/src/modules/battle/greenhouse/advisor.ts';
import {getTunnelAnswer} from '../../web/src/modules/battle/tunnel/advisor.ts';
import {getFinaleAnswer} from '../../web/src/modules/battle/finale/advisor.ts';
import type {ModelAdvisorState} from '../../web/src/modules/battle/advisor-context.ts';

interface Position {x: number; y: number}
type Scene = Exclude<ModelAdvisorState, {version: number}>;
type Action = {type: 'START'} | {type: 'CAST_SKILL'; catId: 'caster'; target: Position}
  | {type: 'MOVE_CAT'; catId: 'caster' | 'guard'; x: number; y: number};
interface Spec<S extends Scene> {
  name: string;
  create: () => S;
  dispatch: (state: S, action: Action) => S;
  advance: (state: S, seconds: number) => S;
  deployable: (cell: Position, state?: Pick<S, 'boss'>) => boolean;
  answer: (state: S, question: string) => {text: string};
  map: {boss: Position; bossCells: readonly Position[]; goal: Position; spawns: readonly Position[]; obstacles: readonly Position[]};
}

function verify<S extends Scene>(spec: Spec<S>) {
  // Set up a nearly defeated boss, then use the actual cast/death transition.
  // No test writes boss.phase to make the new cells available.
  function retreat() {
    const live = spec.dispatch(spec.create(), {type: 'START'});
    live.boss.hp = 1;
    live.cats.find(cat => cat.id === 'caster')!.energy = 100;
    const defeated = spec.dispatch(live, {type: 'CAST_SKILL', catId: 'caster', target: spec.map.boss});
    assert.equal(defeated.lastAction?.ok, true);
    assert.equal(defeated.boss.phase, 'defeated');
    assert.equal(defeated.phase, 'battle', 'retreat does not skip unfinished waves');
    assert.equal(live.boss.phase, 'idle', 'dispatch preserves its input');
    return defeated;
  }
  function move(state: S, target: Position, catId: 'caster' | 'guard' = 'guard') {
    return spec.dispatch(state, {type: 'MOVE_CAT', catId, ...target});
  }

  test(`${spec.name}: every boss cell opens immediately after a real defeating skill, and a fresh attempt reserves it again`, () => {
    const live = spec.dispatch(spec.create(), {type: 'START'});
    const defeated = retreat();
    for (const cell of spec.map.bossCells) {
      assert.equal(spec.deployable(cell), false, 'static geometry represents the initial board');
      assert.equal(spec.deployable(cell, live), false);
      assert.equal(move(live, cell).lastAction?.ok, false);
      assert.equal(spec.deployable(cell, defeated), true);
      const moved = move(defeated, cell);
      assert.equal(moved.lastAction?.ok, true);
      const cat = moved.cats.find(cat => cat.id === 'guard')!;
      assert.deepEqual({x: cat.x, y: cat.y}, cell);
      assert.equal(move(spec.create(), cell).lastAction?.ok, false, 'new attempts do not inherit cleared cells');
    }
    live.boss.hp = 0;
    assert.equal(move(live, spec.map.boss).lastAction?.ok, false, 'HP alone does not bypass the death transition');
  });

  test(`${spec.name}: cleared boss ground still enforces enemies, obstacles, entrances, protected cells and battle state`, () => {
    const state = retreat(), target = spec.map.bossCells[0];
    for (const cell of [...spec.map.obstacles, ...spec.map.spawns, spec.map.goal, {x: -1, y: 0}, {x: .5, y: 1}]) {
      assert.equal(spec.deployable(cell, state), false);
      assert.equal(move(state, cell).lastAction?.ok, false);
    }
    const spawned = spec.advance(spec.dispatch(spec.create(), {type: 'START'}), .05);
    assert.ok(spawned.enemies.length, 'use a real spawned ordinary enemy for occupancy');
    const occupied = structuredClone(state);
    occupied.enemies = structuredClone(spawned.enemies);
    occupied.enemies.length = 1;
    Object.assign(occupied.enemies[0], target);
    const blocked = move(occupied, target);
    assert.equal(blocked.lastAction?.ok, false);
    assert.match(blocked.lastAction!.message, /黑影|无法安全/);
    assert.deepEqual(blocked.cats, occupied.cats);
    const retired = structuredClone(state);
    Object.assign(retired.cats.find(cat => cat.id === 'guard')!, {status: 'retired', hp: 0});
    assert.equal(move(retired, target).lastAction?.ok, false);
    const externalPause = structuredClone(state); externalPause.externallyPaused = true;
    assert.equal(move(externalPause, target).lastAction?.ok, false);
    for (const phase of ['won', 'lost'] as const) {
      const ended = structuredClone(state); ended.phase = phase;
      assert.equal(move(ended, target).lastAction?.ok, false);
    }
  });

  test(`${spec.name}: cats can swap into released boss cells while retaining combat values and unsafe swaps stay blocked`, () => {
    const cleared = retreat(), target = spec.map.bossCells[0];
    const positioned = move(cleared, target);
    const caster = positioned.cats.find(cat => cat.id === 'caster')!;
    const guard = positioned.cats.find(cat => cat.id === 'guard')!;
    const swapped = move(positioned, target, 'caster');
    assert.equal(swapped.lastAction?.ok, true);
    assert.deepEqual(swapped.cats.find(cat => cat.id === 'caster'), {...caster, ...target, blockedCount: 0});
    assert.deepEqual(swapped.cats.find(cat => cat.id === 'guard'), {...guard, x: caster.x, y: caster.y, blockedCount: 0});
    const spawned = spec.advance(spec.dispatch(spec.create(), {type: 'START'}), .05);
    positioned.enemies = structuredClone(spawned.enemies);
    positioned.enemies.length = 1;
    Object.assign(positioned.enemies[0], {x: caster.x, y: caster.y});
    const unsafe = move(positioned, target, 'caster');
    assert.equal(unsafe.lastAction?.ok, false);
    assert.match(unsafe.lastAction!.message, /原位置有黑影/);
  });

  test(`${spec.name}: the advisor exposes released cells and stops describing them as occupied`, () => {
    const live = spec.create(), defeated = retreat();
    const before = JSON.parse(buildModelAdvisorContext(live.stageId, live));
    const after = JSON.parse(buildModelAdvisorContext(defeated.stageId, defeated));
    const initialCells = before.地图.候选部署格.split('、');
    const clearedCells = after.地图.候选部署格.split('、');
    assert.equal(clearedCells.length, initialCells.length + spec.map.bossCells.length);
    for (const cell of spec.map.bossCells) {
      assert.equal(initialCells.includes(cellName(cell)), false);
      assert.equal(clearedCells.includes(cellName(cell)), true);
    }
    assert.equal(after.地图.首领占格, '');
    assert.match(spec.answer(defeated, '地图部署').text, /已可部署/);
    assert.match(spec.answer(defeated, '首领').text, /已可部署/);
  });
}

verify({name: 'chapter 1', create: createChapterBattle, dispatch: dispatchChapter, advance: advanceChapter, deployable: chapterDeployable, answer: getChapterAnswer, map: CHAPTER_MAP});
verify({name: 'chapter 2', create: createMarketBattle, dispatch: dispatchMarket, advance: advanceMarket, deployable: marketDeployable, answer: getMarketAnswer, map: MARKET_MAP});
verify({name: 'chapter 3', create: createGreenhouseBattle, dispatch: dispatchGreenhouse, advance: advanceGreenhouse, deployable: greenhouseDeployable, answer: getGreenhouseAnswer, map: GREENHOUSE_MAP});
verify({name: 'chapter 4', create: createTunnelBattle, dispatch: dispatchTunnel, advance: advanceTunnel, deployable: tunnelDeployable, answer: getTunnelAnswer, map: TUNNEL_MAP});
verify({name: 'chapter 5', create: createFinaleBattle, dispatch: dispatchFinale, advance: advanceFinale, deployable: finaleDeployable, answer: getFinaleAnswer, map: FINALE_MAP});

test('finale: boss retreat only releases boss cells, leaving elite and fixed support places reserved', () => {
  let state = dispatchFinale(createFinaleBattle(), {type: 'START'});
  state.boss.hp = 1; state.cats.find(cat => cat.id === 'caster')!.energy = 100;
  state = dispatchFinale(state, {type: 'CAST_SKILL', catId: 'caster', target: FINALE_MAP.boss});
  assert.equal(state.boss.phase, 'defeated');
  for (const elite of state.elites) {elite.status = 'defeated'; elite.hp = 0;}
  for (const cell of [...FINALE_MAP.eliteCells, ...ALLY_DEFINITIONS]) {
    assert.equal(finaleDeployable(cell, state), false);
    assert.equal(dispatchFinale(state, {type: 'MOVE_CAT', catId: 'guard', x: cell.x, y: cell.y}).lastAction?.ok, false);
  }
});
