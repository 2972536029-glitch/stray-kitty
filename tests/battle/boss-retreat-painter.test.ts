import assert from 'node:assert/strict';
import test from 'node:test';
import {createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
import {MAP} from '../../web/src/modules/battle/chapter/config.ts';
import {resolveBasicAttack} from '../../web/src/modules/battle/shared/basicAttackPainter.ts';
import type {ChapterEffect, ChapterState, Position} from '../../web/src/modules/battle/chapter/types.ts';

test('attack endpoints keep a cat on cleared D8 centered on its tile, while a live boss keeps its four-cell center', () => {
  const cellSize = 80;
  const center = (position: Position) => ({x: (position.x + .5) * cellSize, y: (position.y + .5) * cellSize});
  const enemy = {id: 'enemy-1', x: MAP.boss.x + .4, y: MAP.boss.y};
  let cleared = dispatchChapter(createChapterBattle(), {type: 'START'});
  cleared.boss.hp = 1; cleared.cats.find(cat => cat.id === 'caster')!.energy = 100;
  cleared = dispatchChapter(cleared, {type: 'CAST_SKILL', catId: 'caster', target: MAP.boss});
  cleared = dispatchChapter(cleared, {type: 'MOVE_CAT', catId: 'guard', ...MAP.boss});
  assert.equal(cleared.boss.phase, 'defeated');
  assert.equal(cleared.lastAction?.ok, true);
  const guard = cleared.cats.find(cat => cat.id === 'guard')!;

  function endpoints(state: ChapterState, from: Position, to: Position) {
    // Match the engine's spread snapshots: entity identity survives alongside x/y.
    const effect: ChapterEffect = {id: 1, kind: 'attack', from: {...from}, to: {...to}, remaining: .4};
    const result = resolveBasicAttack(effect, {cellSize, boss: state.boss, theme: 'alley'});
    return {from: result.from, to: result.to};
  }

  assert.deepEqual(endpoints(cleared, guard, enemy), {
    from: center(MAP.boss), to: center(enemy),
  }, 'the cat attacks from its actual D8 tile center after the boss retreats');
  assert.deepEqual(endpoints(cleared, enemy, guard), {
    from: center(enemy), to: center(MAP.boss),
  }, 'an ordinary enemy hit lands on the cat at D8, not the former boss center');

  const live = createChapterBattle(), attacker = live.cats.find(cat => cat.id === 'guard')!;
  assert.deepEqual(endpoints(live, attacker, live.boss), {
    from: center(attacker),
    to: {x: (live.boss.x + live.boss.width / 2) * cellSize, y: (live.boss.y + live.boss.height / 2) * cellSize},
  }, 'the living four-cell boss receives the hit at its visual center');
});
