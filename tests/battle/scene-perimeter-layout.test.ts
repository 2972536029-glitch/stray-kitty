import test from 'node:test';
import assert from 'node:assert/strict';
import {CELLS as ALLEY_CELLS} from '../../web/src/modules/battle/chapter/config.ts';
import {CELLS as GREENHOUSE_CELLS} from '../../web/src/modules/battle/greenhouse/config.ts';
import {getScenePerimeterLayout, type ScenePerimeterCell, type ScenePerimeterLayout} from '../../web/src/modules/battle/scene-perimeter-layout.ts';

const key = ({x, y}: ScenePerimeterCell) => `${x},${y}`;
const rectangle = (width: number, height: number) => Array.from({length: width * height}, (_, i) => ({x: i % width, y: Math.floor(i / width)}));

function assertExteriorGeometry(layout: ScenePerimeterLayout, cells: readonly ScenePerimeterCell[]) {
  const occupied = new Set(cells.map(key));
  assert.equal(new Set(layout.edges.map(edge => `${key(edge.cell)}:${edge.side}`)).size, layout.edges.length);
  assert.equal(new Set(layout.outsideCells.map(key)).size, layout.outsideCells.length);
  for (const edge of layout.edges) {
    assert.ok(occupied.has(key(edge.cell)));
    assert.ok(!occupied.has(key(edge.outside)), 'raised terrain never occupies a battle cell');
    assert.equal(Math.abs(edge.end.x - edge.start.x) + Math.abs(edge.end.y - edge.start.y), 1);
    const midpoint = {x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2};
    const inside = {x: Math.floor(midpoint.x - edge.normal.x * .25), y: Math.floor(midpoint.y - edge.normal.y * .25)};
    const outside = {x: Math.floor(midpoint.x + edge.normal.x * .25), y: Math.floor(midpoint.y + edge.normal.y * .25)};
    assert.deepEqual(inside, edge.cell, 'normal starts at the true tile boundary');
    assert.deepEqual(outside, edge.outside, 'positive extrusion points outside combat');
  }
  assert.equal(layout.segments.reduce((count, segment) => count + segment.edges.length, 0), layout.edges.length);
  for (const segment of layout.segments) {
    assert.equal(Math.abs(segment.end.x - segment.start.x) + Math.abs(segment.end.y - segment.start.y), segment.edges.length);
    assert.ok(segment.edges.every(edge => edge.side === segment.side && edge.opening === segment.opening));
  }
}

test('one tile exposes four correctly oriented unit edges and adjacent exterior cells', () => {
  const cells = [{x: 3, y: -2}];
  const layout = getScenePerimeterLayout(cells);
  assertExteriorGeometry(layout, cells);
  assert.deepEqual(layout.edges.map(({side, start, end, normal, outside}) => ({side, start, end, normal, outside})), [
    {side: 'N', start: {x: 3, y: -2}, end: {x: 4, y: -2}, normal: {x: 0, y: -1}, outside: {x: 3, y: -3}},
    {side: 'E', start: {x: 4, y: -2}, end: {x: 4, y: -1}, normal: {x: 1, y: 0}, outside: {x: 4, y: -2}},
    {side: 'S', start: {x: 3, y: -1}, end: {x: 4, y: -1}, normal: {x: 0, y: 1}, outside: {x: 3, y: -1}},
    {side: 'W', start: {x: 3, y: -2}, end: {x: 3, y: -1}, normal: {x: -1, y: 0}, outside: {x: 2, y: -2}},
  ]);
  assert.equal(layout.segments.length, 4);
  assert.equal(layout.outsideCells.length, 4);
});

test('a rectangular battlefield merges straight outer runs without retaining internal tile seams', () => {
  const cells = rectangle(3, 2);
  const layout = getScenePerimeterLayout(cells);
  assertExteriorGeometry(layout, cells);
  assert.equal(layout.edges.length, 10);
  assert.deepEqual(layout.segments.map(segment => [segment.side, segment.edges.length]), [['N', 3], ['E', 2], ['S', 3], ['W', 2]]);
});

test('the real T-shaped alley follows both recessed shoulders instead of its bounding rectangle', () => {
  const layout = getScenePerimeterLayout(ALLEY_CELLS);
  assertExteriorGeometry(layout, ALLEY_CELLS);
  assert.equal(ALLEY_CELLS.length, 26);
  assert.equal(layout.edges.length, 30);
  assert.equal(layout.segments.length, 8);
  assert.deepEqual(layout.segments.filter(segment => segment.side === 'N').map(({start, end}) => ({start, end})), [
    {start: {x: 3, y: 0}, end: {x: 5, y: 0}},
    {start: {x: 0, y: 3}, end: {x: 3, y: 3}},
    {start: {x: 5, y: 3}, end: {x: 10, y: 3}},
  ]);
  assert.equal(layout.outsideCells.find(cell => cell.x === 2 && cell.y === 2)?.edges.length, 2);
});

test('the real irregular greenhouse retains its narrow lower spur and deduplicates concave exterior cells', () => {
  const layout = getScenePerimeterLayout(GREENHOUSE_CELLS);
  assertExteriorGeometry(layout, GREENHOUSE_CELLS);
  assert.equal(GREENHOUSE_CELLS.length, 34);
  assert.equal(layout.edges.length, 30);
  assert.deepEqual(layout.edges.filter(edge => edge.cell.x === 6 && edge.cell.y === 5).map(edge => edge.side), ['E', 'S', 'W']);
  const recess = layout.outsideCells.find(cell => cell.x === 0 && cell.y === 0);
  assert.deepEqual(recess?.edges.map(edge => [edge.cell, edge.side]), [[{x: 1, y: 0}, 'W'], [{x: 0, y: 1}, 'N']]);
});

test('spawn and goal openings split solid runs while preserving low-threshold geometry', () => {
  const cells = rectangle(4, 1);
  const layout = getScenePerimeterLayout(cells, [
    {x: 1, y: 0, side: 'N', kind: 'spawn'},
    {x: 0, y: 0, side: 'W', kind: 'goal'},
    {x: 1, y: 0, side: 'E', kind: 'spawn'}, // An interior side cannot create an edge.
    {x: 40, y: 0, kind: 'spawn'}, // Absent cells do not create openings.
  ]);
  assertExteriorGeometry(layout, cells);
  assert.equal(layout.edges.length, 10);
  assert.deepEqual(layout.segments.filter(segment => segment.side === 'N').map(segment => [segment.opening, segment.edges.length]), [[null, 1], ['spawn', 1], [null, 2]]);
  assert.deepEqual(layout.edges.filter(edge => edge.opening).map(edge => [edge.side, edge.opening]), [['W', 'goal'], ['N', 'spawn']]);
  assert.deepEqual(layout.outsideCells.find(cell => cell.x === 1 && cell.y === -1)?.openings, ['spawn']);
  assert.equal(layout.edges.find(edge => edge.cell.x === 1 && edge.side === 'S')?.opening, null);
});

test('an unspecified opening side opens only exposed sides and keeps shared exterior space free', () => {
  const cells = [{x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}];
  const layout = getScenePerimeterLayout(cells, [{x: 1, y: 0, kind: 'spawn'}]);
  assertExteriorGeometry(layout, cells);
  assert.deepEqual(layout.edges.filter(edge => edge.opening).map(edge => edge.side), ['N', 'E', 'W']);
  const recess = layout.outsideCells.find(cell => cell.x === 0 && cell.y === 0);
  assert.equal(recess?.edges.length, 2);
  assert.deepEqual(recess?.openings, ['spawn'], 'a raised bed must not fill a recess used by an opening');
  assert.equal(recess?.edges.filter(edge => edge.opening === null).length, 1);
});

test('holes and separated islands retain real boundaries without merging across gaps', () => {
  const ring = rectangle(3, 3).filter(cell => cell.x !== 1 || cell.y !== 1);
  const ringLayout = getScenePerimeterLayout(ring);
  assertExteriorGeometry(ringLayout, ring);
  assert.equal(ringLayout.edges.length, 16);
  assert.equal(ringLayout.segments.length, 8);
  assert.equal(ringLayout.outsideCells.find(cell => cell.x === 1 && cell.y === 1)?.edges.length, 4);
  const islands = [{x: 0, y: 0}, {x: 2, y: 0}];
  const islandLayout = getScenePerimeterLayout(islands);
  assertExteriorGeometry(islandLayout, islands);
  assert.equal(islandLayout.segments.length, 8);
});

test('duplicates and input order do not change geometry, and frozen inputs remain untouched', () => {
  const cells = Object.freeze(rectangle(3, 2).map(cell => Object.freeze(cell)));
  const openings = Object.freeze([
    Object.freeze({x: 1, y: 0, kind: 'spawn' as const}),
    Object.freeze({x: 1, y: 0, kind: 'goal' as const, side: 'N' as const}),
  ]);
  const expected = getScenePerimeterLayout(cells, openings);
  assert.deepEqual(getScenePerimeterLayout([...cells].reverse().concat(cells), [...openings].reverse()), expected);
  assert.equal(expected.edges.find(edge => edge.cell.x === 1 && edge.side === 'N')?.opening, 'goal');
});

test('empty or invalid cells produce no fabricated boundaries', () => {
  const empty = {edges: [], segments: [], outsideCells: []};
  assert.deepEqual(getScenePerimeterLayout([], [{x: 0, y: 0, kind: 'spawn'}]), empty);
  assert.deepEqual(getScenePerimeterLayout([{x: NaN, y: 0}, {x: 0, y: Infinity}, {x: .5, y: 0}, {x: Number.MAX_SAFE_INTEGER, y: 0}]), empty);
});
