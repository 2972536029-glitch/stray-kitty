import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';
import {createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
import {MAP} from '../../web/src/modules/battle/chapter/config.ts';
import type {ChapterEffect, ChapterState, Position} from '../../web/src/modules/battle/chapter/types.ts';

// Supply Vite-style asset URLs so the real painter can run in Node. With no
// Image/document globals, scenery uses its normal procedural fallback.
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.png')) return {format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true};
    return nextLoad(url, context);
  }
`), import.meta.url);

type PointCommand = ['moveTo' | 'lineTo', number, number];
function canvasSpy() {
  let path: PointCommand[] = [];
  const strokes: {path: PointCommand[]; color: string; width: number}[] = [];
  const target = {
    globalAlpha: 1, strokeStyle: '', lineWidth: 1,
    beginPath() {path = [];},
    moveTo(x: number, y: number) {path.push(['moveTo', x, y]);},
    lineTo(x: number, y: number) {path.push(['lineTo', x, y]);},
    stroke() {strokes.push({path: [...path], color: target.strokeStyle, width: target.lineWidth});},
    createLinearGradient: () => ({addColorStop() {}}),
    createRadialGradient: () => ({addColorStop() {}}),
    measureText: (text: string) => ({width: text.length * 8}),
  };
  const context = new Proxy(target, {
    get: (object, key) => key in object ? Reflect.get(object, key) : () => {},
  }) as unknown as CanvasRenderingContext2D;
  return {context, strokes};
}

test('chapter painter keeps attacks from and into a cat on cleared D8 centered on its tile, while the live boss keeps its four-cell center', async () => {
  const {paintChapter, CELL} = await import('../../web/src/modules/battle/chapter/painter.ts');
  const center = (position: Position): [number, number] => [(position.x + .5) * CELL, (position.y + .5) * CELL];
  const enemy = {x: MAP.boss.x + .4, y: MAP.boss.y};
  let cleared = dispatchChapter(createChapterBattle(), {type: 'START'});
  cleared.boss.hp = 1; cleared.cats.find(cat => cat.id === 'caster')!.energy = 100;
  cleared = dispatchChapter(cleared, {type: 'CAST_SKILL', catId: 'caster', target: MAP.boss});
  cleared = dispatchChapter(cleared, {type: 'MOVE_CAT', catId: 'guard', ...MAP.boss});
  assert.equal(cleared.boss.phase, 'defeated');
  assert.equal(cleared.lastAction?.ok, true);
  const guard = cleared.cats.find(cat => cat.id === 'guard')!;

  function paintAttack(state: ChapterState, from: Position, to: Position) {
    const effect: ChapterEffect = {id: 1, kind: 'attack', from: {...from}, to: {...to}, remaining: .4};
    const spy = canvasSpy();
    paintChapter(spy.context, {...state, effects: [effect]}, null, null);
    // Combat effects are the final board layer, after scenery and combatants.
    const stroke = spy.strokes.at(-1);
    assert.ok(stroke, 'the actual painter must draw the attack');
    assert.equal(stroke.color, '#f4ce83');
    assert.equal(stroke.width, 3);
    return stroke.path;
  }

  assert.deepEqual(paintAttack(cleared, guard, enemy), [
    ['moveTo', ...center(MAP.boss)], ['lineTo', ...center(enemy)],
  ], 'the cat attacks from the actual D8 tile center, not the old boss center');
  assert.deepEqual(paintAttack(cleared, enemy, guard), [
    ['moveTo', ...center(enemy)], ['lineTo', ...center(MAP.boss)],
  ], 'an ordinary enemy attack lands on the cat at D8');

  const live = createChapterBattle(), attacker = live.cats.find(cat => cat.id === 'guard')!;
  assert.deepEqual(paintAttack(live, attacker, live.boss), [
    ['moveTo', ...center(attacker)],
    ['lineTo', (live.boss.x + live.boss.width / 2) * CELL, (live.boss.y + live.boss.height / 2) * CELL],
  ], 'the living four-cell boss still receives the effect at its existing visual center');
});
