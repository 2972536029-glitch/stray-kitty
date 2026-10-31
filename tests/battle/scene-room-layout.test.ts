import test from 'node:test';
import assert from 'node:assert/strict';
import {getIllustratedRoomBounds, getSceneRoomLayout, type SceneRoomLayout, type SceneRoomRect} from '../../web/src/modules/battle/scene-room-layout.ts';

function encloses(room: SceneRoomLayout, ...rects: SceneRoomRect[]) {
  for (const rect of rects) {
    assert.ok(room.left < rect.x, 'left wall stays outside combat');
    assert.ok(room.right > rect.x + rect.width, 'right wall stays outside combat');
    assert.ok(room.back < rect.y, 'back wall foot stays above combat');
    assert.ok(room.front > rect.y + rect.height, 'foreground stays below combat');
  }
}

test('desktop room encloses both the board and its wider scrollport with breathing room', () => {
  const board = {x: 160, y: 156, width: 960, height: 400};
  const viewport = {x: 32, y: 88, width: 1216, height: 488};
  const room = getSceneRoomLayout(1280, 720, board, viewport, 80);
  encloses(room, board, viewport);
  assert.equal(room.left, 12.8);
  assert.equal(room.right, 1267.2);
  assert.equal(room.back, 68.8);
  assert.equal(room.front, 595.2);
  assert.equal(room.wallHeight, 128);
});

test('widescreen camera changes do not stretch a room whose board and viewport are unchanged', () => {
  const board = {x: 380, y: 150, width: 1200, height: 700};
  const viewport = {x: 40, y: 100, width: 1840, height: 800};
  const room = getSceneRoomLayout(1920, 1080, board, viewport, 100);
  encloses(room, board, viewport);
  assert.equal(room.wallHeight, 144);
  assert.deepEqual(getSceneRoomLayout(2560, 1440, board, viewport, 100), room);
});

test('zoomed and scrolled boards can push walls offscreen instead of squeezing the battlefield', () => {
  const board = {x: -220, y: -75, width: 1600, height: 933.5};
  const viewport = {x: 32, y: 88, width: 1216, height: 488};
  const room = getSceneRoomLayout(1280, 720, board, viewport, 1600 / 12);
  encloses(room, board, viewport);
  assert.deepEqual(room, {left: -248, right: 1408, back: -103, front: 886.5, wallHeight: 144});
});

test('mobile overview leaves a readable minimum gap without forcing side walls into the scrollport', () => {
  const board = {x: 12, y: 220, width: 366, height: 213.5};
  const viewport = {x: 0, y: 149, width: 390, height: 455};
  const room = getSceneRoomLayout(390, 844, board, viewport, 30.5);
  encloses(room, board, viewport);
  assert.deepEqual(room, {left: -12, right: 402, back: 137, front: 616, wallHeight: 88});
});

test('fractional scrolling preserves wall clearance without snapping the room to integer pixels', () => {
  const viewport = {x: 0, y: 100, width: 390, height: 500};
  const board = {x: -150.25, y: 80.5, width: 960, height: 560};
  const initial = getSceneRoomLayout(390, 844, board, viewport, 80);
  const movedBoard = {...board, x: board.x - 10.5, y: board.y - 7.25};
  const moved = getSceneRoomLayout(390, 844, movedBoard, viewport, 80);
  encloses(moved, movedBoard, viewport);
  assert.equal(moved.left - initial.left, -10.5);
  assert.equal(moved.right - initial.right, -10.5);
  assert.equal(moved.back - initial.back, -7.25);
  assert.equal(moved.front - initial.front, -7.25);
  assert.equal(moved.wallHeight, initial.wallHeight);
});

test('camera dimensions never clamp a fully offscreen room or mutate its input rectangles', () => {
  const board = Object.freeze({x: -1400, y: -850, width: 320, height: 180});
  const viewport = Object.freeze({x: -1300, y: -800, width: 250, height: 120});
  const room = getSceneRoomLayout(320, 240, board, viewport, 80);
  encloses(room, board, viewport);
  assert.ok(room.right < 0 && room.front < 0);
  assert.equal(room.wallHeight, 128);
});

test('nonfinite measurements fall back to the stage while invalid cell sizes use the normal tile scale', () => {
  const invalid = {x: NaN, y: Infinity, width: Infinity, height: -Infinity};
  const room = getSceneRoomLayout(640, 480, invalid, invalid, NaN);
  encloses(room, {x: 0, y: 0, width: 640, height: 480});
  assert.deepEqual(room, {left: -19.2, right: 659.2, back: -19.2, front: 499.2, wallHeight: 128});
  assert.deepEqual(getSceneRoomLayout(640, 480, invalid, invalid, -80), room);
  assert.deepEqual(getSceneRoomLayout(640, 480, invalid, invalid, 0), room);
});

test('empty, negative and extreme measurements always produce finite ordered room limits', () => {
  const fixtures = [
    {width: 0, height: 0, rect: {x: 0, y: 0, width: 0, height: 0}, cell: 1},
    {width: -1, height: -1, rect: {x: 12, y: -3, width: -80, height: -20}, cell: -1},
    {width: NaN, height: Infinity, rect: {x: NaN, y: -Infinity, width: NaN, height: Infinity}, cell: Infinity},
    {width: Number.MAX_VALUE, height: Number.MAX_VALUE, rect: {x: Number.MAX_VALUE, y: -Number.MAX_VALUE, width: Number.MAX_VALUE, height: Number.MAX_VALUE}, cell: Number.MAX_VALUE},
  ];
  for (const {width, height, rect, cell} of fixtures) {
    const room = getSceneRoomLayout(width, height, rect, rect, cell);
    assert.ok(Object.values(room).every(Number.isFinite));
    assert.ok(room.left < room.right && room.back < room.front);
    assert.ok(room.wallHeight >= 88 && room.wallHeight <= 144);
  }
});

function insideIllustratedSafeArea(image: SceneRoomRect, board: SceneRoomRect) {
  const epsilon = 1e-8;
  assert.ok(board.x >= image.x + image.width * .25 - epsilon, 'board clears the illustrated left wall');
  assert.ok(board.x + board.width <= image.x + image.width * .75 + epsilon, 'board clears the illustrated right wall');
  assert.ok(board.y >= image.y + image.height * .2 - epsilon, 'board clears the illustrated back wall');
  assert.ok(board.y + board.height <= image.y + image.height * .7 + epsilon, 'board clears the illustrated foreground');
}

for (const {name, viewWidth, cell, x, y} of [
  {name: 'mobile overview', viewWidth: 390, cell: 30.5, x: 12, y: 220},
  {name: 'desktop overview', viewWidth: 1280, cell: 54, x: 316, y: 144},
  {name: 'wide desktop overview', viewWidth: 2560, cell: 160, x: 320, y: 150},
  {name: 'zoomed and scrolled view', viewWidth: 390, cell: 100, x: -510.5, y: -225.25},
]) test(`illustrated finale keeps its 12-by-7 board safe in ${name}`, () => {
  const board = {x, y, width: cell * 12, height: cell * 7};
  const image = getIllustratedRoomBounds(viewWidth, board);
  insideIllustratedSafeArea(image, board);
  assert.equal(image.width, cell * 24, 'normal finale illustration spans twenty-four cells');
  assert.ok(Math.abs(image.height / image.width - .6) < 1e-10);
  assert.ok(Math.abs(image.x + image.width / 2 - (board.x + board.width / 2)) < 1e-8);
});

test('illustrated room expands to a camera wider than the board without stretching its aspect ratio', () => {
  const board = {x: 850, y: 180, width: 360, height: 210};
  const image = getIllustratedRoomBounds(2560, board);
  insideIllustratedSafeArea(image, board);
  assert.equal(image.width, 2560);
  assert.equal(image.height, 1536);
});

test('illustrated safe area still contains boards whose CSS width and height use different scales', () => {
  for (const board of [
    {x: 123.25, y: 167.75, width: 900, height: 600},
    {x: -40, y: -80, width: 480, height: 700},
    {x: 90, y: 130, width: 1440, height: 420},
  ]) {
    const image = getIllustratedRoomBounds(1280, board);
    insideIllustratedSafeArea(image, board);
    assert.ok(Math.abs(image.height / image.width - .6) < 1e-10);
  }
});

test('illustrated background follows fractional horizontal and vertical scroll by exactly the board offset', () => {
  const board = {x: 42.5, y: 136.25, width: 960, height: 560};
  const before = getIllustratedRoomBounds(390, board);
  const delta = {x: -287.25, y: -113.5};
  const movedBoard = {...board, x: board.x + delta.x, y: board.y + delta.y};
  const after = getIllustratedRoomBounds(390, movedBoard);
  insideIllustratedSafeArea(after, movedBoard);
  assert.equal(after.x - before.x, delta.x);
  assert.equal(after.y - before.y, delta.y);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
});
