import assert from 'node:assert/strict';
import test from 'node:test';
import {getDragRangeCat} from '../../web/src/modules/battle/shared/dragRangePreview.ts';
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
import {validatePlacement} from '../../web/src/modules/battle/l00/engine.ts';
import {getAttackCells as prologueAttackCells} from '../../web/src/modules/battle/l00/ranges.ts';
import {beginBattle} from './helpers.ts';

type Position = {x: number; y: number};
function verifyChapter<Cat extends Position & {id: string}, State extends {cats: Cat[]}>(
  name: string, create: () => State,
  error: (state: State, catId: Cat['id'], target: Position) => string | null,
  attackCells: (cat: Cat) => Position[], cells: readonly Position[], forbidden: Position,
) {
  test(`${name}: drag range follows a legal hover without changing the deployed cat, and clears off board or over forbidden cells`, () => {
    const state = create(), cat = state.cats.find(cat => cat.id === 'caster')!;
    Object.freeze(cat);
    const before = JSON.stringify(state);
    const legal = cells.find(p => (p.x !== cat.x || p.y !== cat.y) && !error(state, cat.id, p));
    assert.ok(legal);
    const canPlace = (cat: Cat, target: Position) => !error(state, cat.id, target);
    const preview = getDragRangeCat(cat, cat.id, legal, canPlace);
    assert.ok(preview);
    assert.notEqual(preview, cat);
    assert.deepEqual(attackCells(preview), attackCells({...cat, ...legal}));
    assert.notDeepEqual(attackCells(preview), attackCells(cat), 'the highlighted cells actually move');
    assert.equal(getDragRangeCat(cat, cat.id, forbidden, canPlace), undefined);
    assert.equal(getDragRangeCat(cat, cat.id, null, canPlace), undefined, 'outside clears rather than falling back to the original tile');
    assert.equal(getDragRangeCat(cat, null, legal, canPlace), cat, 'cancel returns to the deployed origin');
    assert.equal(JSON.stringify(state), before, 'range drawing does not alter battle or cooldown state');
  });
}
verifyChapter('chapter', chapter.createChapterBattle, chapter.getDeployError, chapter.getAttackCells, chapterConfig.CELLS, chapterConfig.MAP.bossCells[0]);
verifyChapter('market', market.createMarketBattle, market.getDeployError, market.getAttackCells, marketConfig.CELLS, marketConfig.MAP.bossCells[0]);
verifyChapter('greenhouse', greenhouse.createGreenhouseBattle, greenhouse.getDeployError, greenhouse.getAttackCells, greenhouseConfig.CELLS, greenhouseConfig.MAP.bossCells[0]);
verifyChapter('tunnel', tunnel.createTunnelBattle, tunnel.getDeployError, tunnel.getAttackCells, tunnelConfig.CELLS, tunnelConfig.MAP.bossCells[0]);
verifyChapter('finale', finale.createFinaleBattle, finale.getDeployError, finale.getAttackCells, finaleConfig.CELLS, finaleConfig.MAP.bossCells[0]);

test('prologue: hover ranges reuse placement rules, retain clipping, and restore on cancel without moving cats', () => {
  const state = beginBattle();
  const cat = state.cats.find(cat => cat.id === 'caster')!;
  Object.freeze(cat);
  const before = JSON.stringify(state);
  const canPlace = (candidate: typeof cat, target: Position) => !validatePlacement(state, candidate, target.x, target.y, true);
  const preview = getDragRangeCat(cat, cat.id, {x: 5, y: 0}, canPlace);
  assert.ok(preview);
  assert.deepEqual(prologueAttackCells(preview), [{x: 5, y: 0}, {x: 5, y: 1}, {x: 6, y: 0}, {x: 6, y: 1}]);
  for (const target of [{x: 0, y: 1}, {x: 6, y: 1}, {x: -1, y: 0}, null]) {
    assert.equal(getDragRangeCat(cat, cat.id, target, canPlace), undefined);
  }
  assert.equal(getDragRangeCat(cat, null, null, canPlace), cat);
  assert.equal(JSON.stringify(state), before);
});
