import test from 'node:test';
import assert from 'node:assert/strict';
import {alignToDevicePixel, canvasResolution} from '../web/src/adapters/canvas/resolution';

test('native cover rendering supplies physical display pixels without changing the logical aspect', () => {
  assert.deepEqual(canvasResolution(800, 480, 1600, 900, 1, 'cover', true), {width: 1600, height: 960});
  assert.deepEqual(canvasResolution(800, 480, 1600, 900, 2, 'cover', true), {width: 3200, height: 1920});
  const fractional = canvasResolution(800, 480, 1333, 777, 1.25, 'cover', true);
  assert.equal(fractional.width * 480, fractional.height * 800);
  assert.ok(fractional.width >= 1333 * 1.25);
  assert.ok(fractional.height >= 777 * 1.25);
});
test('contain mode fits the actual image rectangle, including narrow mobile layouts', () => {
  assert.deepEqual(canvasResolution(800, 480, 844, 390, 1, 'contain', true), {width: 650, height: 390});
});

test('other chapters retain their existing logical-resolution backing buffers', () => {
  for (const fit of ['contain', 'cover'] as const) {
    assert.deepEqual(canvasResolution(800, 480, 1600, 900, 1, fit, false), {width: 800, height: 480});
    assert.deepEqual(canvasResolution(800, 480, 1600, 900, 2, fit, false), {width: 1600, height: 960});
  }
  assert.deepEqual(canvasResolution(800, 480, 0, 0, 2, 'cover', true), {width: 1600, height: 960});
});

test('pixel alignment moves only the drawing origin by at most half a physical pixel', () => {
  for (const density of [.8125, 1, 1.25, 2, 4]) for (const offset of [-104.871, -.49, 0, .127, 54.0218, 900.83]) {
    const aligned = alignToDevicePixel(offset, density);
    assert.ok(Math.abs(aligned * density - Math.round(aligned * density)) < 1e-9);
    assert.ok(Math.abs(aligned - offset) <= .5 / density + 1e-9);
  }
});
