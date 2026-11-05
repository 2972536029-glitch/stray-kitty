import assert from 'node:assert/strict';
import test from 'node:test';
import * as chapter from '../../web/src/modules/battle/chapter/engine.ts';
import * as market from '../../web/src/modules/battle/market/engine.ts';
import * as greenhouse from '../../web/src/modules/battle/greenhouse/engine.ts';
import * as tunnel from '../../web/src/modules/battle/tunnel/engine.ts';
import * as finale from '../../web/src/modules/battle/finale/engine.ts';
import * as chapterConfig from '../../web/src/modules/battle/chapter/config.ts';
import * as marketConfig from '../../web/src/modules/battle/market/config.ts';
import * as greenhouseConfig from '../../web/src/modules/battle/greenhouse/config.ts';
import * as tunnelConfig from '../../web/src/modules/battle/tunnel/config.ts';
import * as finaleConfig from '../../web/src/modules/battle/finale/config.ts';
import {getAttackCells as tutorialAttackCells} from '../../web/src/modules/battle/l00/ranges.ts';
import {beginBattle} from './helpers.ts';

type Point = {x: number; y: number};
interface Scene {
  cats: (Point & {id: string; range: string; cooldown: number; attacks: number})[];
  boss: Point & {hp: number; cooldown: number; skillCooldown: number};
  enemies: unknown[]; spawnIndex: number; nextWaveIn: number | null;
  elites?: {status: string; hp: number; cooldown: number}[];
}
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const keys = (cells: Point[]) => cells.map(({x, y}) => `${x},${y}`).sort();

function verifyScene<S extends Scene>(name: string, create: () => S, advance: (state: S, seconds: number) => S,
  attackCells: (cat: S['cats'][number]) => Point[], bossCells: (boss: S['boss']) => Point[],
  cells: readonly Point[], obstacles: readonly Point[]) {
  test(`${name}: shield cats retain four-cell T ranges and only damage a boss whose footprint intersects those cells`, () => {
    const initial = create();
    const playable = cells.filter(cell => !obstacles.some(obstacle => same(cell, obstacle)));
    const clear = playable.find(cell => [cell, {x: cell.x+1, y: cell.y}, {x: cell.x, y: cell.y-1}, {x: cell.x, y: cell.y+1}]
      .every(neighbour => playable.some(position => same(position, neighbour))));
    assert.ok(clear, 'the map has an unobstructed T-shaped placement for this range check');
    const footprint = bossCells(initial.boss);
    for (const id of ['guard', 'bruiser']) {
      const cat = initial.cats.find(cat => cat.id === id) as S['cats'][number] | undefined;
      if (!cat) continue; // Chapter one has not introduced Lili yet.
      assert.equal(cat.range, 'melee');
      assert.deepEqual(keys(attackCells({...cat, ...clear})), keys([
        clear, {x: clear.x+1, y: clear.y}, {x: clear.x, y: clear.y-1}, {x: clear.x, y: clear.y+1},
      ]));
      const legal = playable.filter(position => !footprint.some(cell => same(cell, position)));
      const touchesBoss = (position: Point) => attackCells({...cat, ...position}).some(cell => footprint.some(part => same(cell, part)));
      const near = legal.find(touchesBoss), far = legal.find(position => !touchesBoss(position));
      assert.ok(near); assert.ok(far);
      for (const [position, shouldHit] of [[near, true], [far, false]] as const) {
        const fixture = create();
        fixture.enemies = []; fixture.spawnIndex = 999; fixture.nextWaveIn = null;
        fixture.boss.cooldown = fixture.boss.skillCooldown = 999;
        for (const ally of fixture.cats) ally.cooldown = 999;
        for (const elite of fixture.elites ?? []) {elite.status = 'defeated'; elite.hp = 0; elite.cooldown = 999;}
        const attacker = fixture.cats.find(cat => cat.id === id)!;
        Object.assign(attacker, position, {cooldown: 0});
        const hp = fixture.boss.hp, attacks = attacker.attacks;
        const after = advance(fixture, .05);
        assert.equal(after.boss.hp < hp, shouldHit, `${id} must only damage the boss through the actual highlighted range`);
        assert.equal(after.cats.find(cat => cat.id === id)!.attacks > attacks, shouldHit,
          `${id} cannot create a basic attack without a target in its four cells`);
      }
    }
    const tuanzi = initial.cats.find(cat => cat.id === 'tuanzi') as S['cats'][number];
    assert.equal(tuanzi.range, 'claws', 'Tuanzi has an existing distinct claw range, not the shield-cat range');
    const forwardPosition = playable.find(position => {
      const front = {x: position.x+2, y: position.y};
      return playable.some(cell => same(cell, front));
    });
    assert.ok(forwardPosition);
    assert.ok(attackCells({...tuanzi, ...forwardPosition}).some(cell => same(cell, {x: forwardPosition.x+2, y: forwardPosition.y})),
      'Tuanzi retains the original forward second-column reach');
  });
}

verifyScene('chapter', () => chapter.dispatchChapter(chapter.createChapterBattle(), {type: 'START'}), chapter.advanceChapter,
  chapter.getAttackCells, chapter.getBossCells, chapterConfig.CELLS, chapterConfig.MAP.obstacles);
verifyScene('market', () => market.dispatchMarket(market.createMarketBattle(), {type: 'START'}), market.advanceMarket,
  market.getAttackCells, market.getBossCells, marketConfig.CELLS, marketConfig.MAP.obstacles);
verifyScene('greenhouse', () => greenhouse.dispatchGreenhouse(greenhouse.createGreenhouseBattle(), {type: 'START'}), greenhouse.advanceGreenhouse,
  greenhouse.getAttackCells, greenhouse.getBossCells, greenhouseConfig.CELLS, greenhouseConfig.MAP.obstacles);
verifyScene('tunnel', () => tunnel.dispatchTunnel(tunnel.createTunnelBattle(), {type: 'START'}), tunnel.advanceTunnel,
  tunnel.getAttackCells, tunnel.getBossCells, tunnelConfig.CELLS, tunnelConfig.MAP.obstacles);
verifyScene('finale', () => finale.dispatchFinale(finale.createFinaleBattle(), {type: 'START'}), finale.advanceFinale,
  finale.getAttackCells, finale.getBossCells, finaleConfig.CELLS, finaleConfig.MAP.obstacles);

test('tutorial Banban has the same right-facing T, with no rear, diagonal, or two-cell forward reach', () => {
  const guard = beginBattle().cats.find(cat => cat.id === 'guard')!;
  Object.assign(guard, {x: 3, y: 1, status: 'active'});
  assert.deepEqual(keys(tutorialAttackCells(guard)), ['3,0', '3,1', '3,2', '4,1']);
});

test('an approaching minion is hit only after entering a melee attack tile, including its fractional edge', () => {
  function step(enemyX: number) {
    const state = chapter.dispatchChapter(chapter.createChapterBattle(), {type: 'START'});
    state.spawnIndex = 999; state.nextWaveIn = null; state.boss.cooldown = state.boss.skillCooldown = 999;
    const guard = state.cats.find(cat => cat.id === 'guard')!;
    Object.assign(guard, {x: 4, y: 3, cooldown: 0});
    for (const cat of state.cats) if (cat.id !== 'guard') cat.cooldown = 999;
    state.enemies = [{...chapterConfig.ENEMY_DEFINITIONS.scout, id: 'range-minion', kind: 'scout',
      x: enemyX, y: guard.y, hp: 100, route: 'upper', cooldown: 999, speed: 0, blockedBy: null}];
    const after = chapter.advanceChapter(state, .05);
    return {hp: after.enemies[0].hp, attacks: after.cats.find(cat => cat.id === 'guard')!.attacks};
  }
  assert.deepEqual(step(5.51), {hp: 100, attacks: 0}, 'the minion is still in the second forward tile');
  const boundary = step(5.49);
  assert.ok(boundary.hp < 100); assert.equal(boundary.attacks, 1, 'entering the first forward tile is sufficient');
});
