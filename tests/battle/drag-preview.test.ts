import assert from 'node:assert/strict';
import test from 'node:test';
import {getDragPreviewPlacement} from '../../web/src/modules/battle/shared/useBattleDragPreview.tsx';

test('drag preview preserves the grabbed point instead of snapping a scaled cat to the cursor', () => {
  const bounds = {left: 100, top: 40, width: 1000, height: 500};
  const position = Object.freeze({x: 3, y: 2});
  const preview = getDragPreviewPlacement(bounds, 10, 5, position, 430, 275);
  assert.deepEqual(preview, {offsetX: 20, offsetY: 15, size: 100});
  const pointer = {x: 650, y: 360};
  assert.deepEqual({x: pointer.x + preview.offsetX, y: pointer.y + preview.offsetY}, {x: 670, y: 375});
  assert.deepEqual(position, {x: 3, y: 2}, 'preview placement never writes a simulation position');
});

test('a fitted or scrolled board uses viewport coordinates and keeps the sprite at the displayed cell size', () => {
  const normal = getDragPreviewPlacement({left: 0, top: 0, width: 800, height: 400}, 10, 5, {x: 4, y: 3}, 360, 280);
  const fitted = getDragPreviewPlacement({left: -150, top: 100, width: 400, height: 200}, 10, 5, {x: 4, y: 3}, 30, 240);
  assert.deepEqual(normal, {offsetX: 0, offsetY: 0, size: 80});
  assert.deepEqual(fitted, {offsetX: 0, offsetY: 0, size: 40});
});

test('prologue and irregular-map boards use the same pointer placement without rounding to a destination tile', () => {
  const preview = getDragPreviewPlacement({left: 12, top: 80, width: 700, height: 300}, 7, 3, {x: 2, y: 1}, 259.5, 226.25);
  assert.deepEqual(preview, {offsetX: 2.5, offsetY: 3.75, size: 100});
  const outsidePointer = {x: -40, y: 25};
  assert.deepEqual({x: outsidePointer.x + preview.offsetX, y: outsidePointer.y + preview.offsetY}, {x: -37.5, y: 28.75},
    'a portal can follow the pointer outside the board; only pointer-up owns drop validation');
});
