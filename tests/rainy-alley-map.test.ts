import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import contentCatalog from '../web/content/catalog.json';
import {rainyAlleyMapData} from '../web/src/modules/rainyAlley/mapData.ts';
import {findPath, sweepMove} from '../web/src/modules/rainyAlley/collision.ts';
import {
  battleReturnPositionTarget, CRATE_CLIMBS, crateClimbTarget, rainyAlleyFieldClosed, rainyAlleyFieldOpen,
  rainyAlleySqueezeFieldClosed, rainyAlleySqueezeFieldOpen, SQUEEZE_BOUNDS, SQUEEZE_CENTER_X, squeezeExitTarget
} from '../web/src/modules/rainyAlley/runtimeGeometry.ts';

const authoredSvg = readFileSync(new URL('../level_design/rainy_alley/source/rainy_alley_v09.svg', import.meta.url), 'utf8');
const sourceManifest = JSON.parse(readFileSync(new URL('../level_design/rainy_alley/SOURCE_MANIFEST.json', import.meta.url), 'utf8'));

test('Rainy Alley crate and random zones match gameplay source coordinates, and the authored floorplan stays locked', () => {
  const crate = rainyAlleyMapData.objects.fixed.find(object => object.id === 'alley_crate');
  assert.deepEqual({x: crate?.x, y: crate?.y, eventId: crate?.eventId}, {x: 975, y: 453, eventId: 'crate_event'});
  const contentCrate = contentCatalog.maps.find(map => map.id === 'alley')?.interactions.find(item => item.id === 'alley_crate');
  assert.deepEqual({x: contentCrate?.x, y: contentCrate?.y, eventId: contentCrate?.eventId}, {x: 975, y: 453, eventId: 'crate_event'});
  const zones = Object.fromEntries(rainyAlleyMapData.objects.zones.map(zone => [zone.id, {x: zone.x, y: zone.y, r: zone.r}]));
  assert.deepEqual(zones, {
    rainy_random_west: {x: 170, y: 487, r: 23},
    rainy_random_central: {x: 455, y: 560, r: 28},
    rainy_random_east: {x: 780, y: 400, r: 30}
  });
  const expectedHash = sourceManifest.hashes_sha256['level_design/rainy_alley/source/rainy_alley_v09.svg'];
  assert.equal(createHash('sha256').update(authoredSvg).digest('hex'), expectedHash);
});

test('closed gate collision has a reachable interaction point beside the mandatory crate', () => {
  const crate = rainyAlleyMapData.objects.fixed.find(object => object.id === 'alley_crate');
  assert.ok(crate);
  const spawn = rainyAlleyFieldClosed.nearestTraversable({x: 111, y: 626});
  assert.ok(spawn);
  let reachable: {x: number; y: number} | undefined;
  for (let y = crate.y - 36; y <= crate.y + 36 && !reachable; y += 2) {
    for (let x = crate.x - 36; x <= crate.x + 36; x += 2) {
      const point = {x, y};
      if (Math.hypot(x - crate.x, y - crate.y) <= rainyAlleyMapData.objects.interactionRadius &&
          rainyAlleyFieldClosed.isTraversable(x, y) && findPath(rainyAlleyFieldClosed, spawn, point, 8).length) {
        reachable = point; break;
      }
    }
  }
  assert.ok(reachable, 'expected a collision-valid route from entrance to the crate radius');
});

for (const gateOpen of [false, true]) for (const direction of [-1, 1] as const) {
  test('squeeze exit direction ' + direction + ' with gate ' + (gateOpen ? 'open' : 'closed'), () => {
    const normal = gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const squeeze = gateOpen ? rainyAlleySqueezeFieldOpen : rainyAlleySqueezeFieldClosed;
    const entry = normal.nearestTraversable({x: SQUEEZE_CENTER_X, y: direction > 0 ? SQUEEZE_BOUNDS.top - 8 : SQUEEZE_BOUNDS.bottom + 8}, 32);
    const exit = squeezeExitTarget(normal, squeeze, direction);
    assert.ok(entry && exit);
    assert.ok(squeeze.isTraversable(entry.x, entry.y));
    assert.ok(normal.isTraversable(exit.x, exit.y));
    let position = {...entry};
    for (let i = 0; i < 180; i++) {
      const dx = SQUEEZE_CENTER_X - position.x, dy = exit.y - position.y, distance = Math.hypot(dx, dy);
      if (distance <= 1) {position = {x: SQUEEZE_CENTER_X, y: exit.y}; break;}
      const amount = Math.min(distance, 58 / 60);
      position = sweepMove(squeeze, position, {x: dx / distance * amount, y: dy / distance * amount}, 2).position;
    }
    assert.ok(normal.isTraversable(position.x, position.y));
    if (direction < 0) for (const x of [-12, 12]) {
      const turn = sweepMove(normal, position, {x, y: 0}, 2);
      assert.ok(Math.abs(turn.position.x - position.x) >= 10, 'upper squeeze exit must release sideways movement');
    }
    const resumed = sweepMove(normal, position, {x: 0, y: direction * 4}, 2).position;
    assert.ok(direction * (resumed.y - position.y) > 0, 'normal foot collider must move outward after squeezing');
    assert.ok(normal.isTraversable(resumed.x, resumed.y));
  });
}

test('western crate and railing block direct, diagonal and shared-edge movement while keeping the lamppost passage open', () => {
  const field = rainyAlleyFieldClosed;
  assert.ok(field.isTraversable(300, 340), 'legitimate passage near the lamppost remains walkable');
  assert.ok(findPath(field, {x: 111, y: 626}, {x: 300, y: 340}, 8).length, 'lamppost passage remains reachable');
  assert.ok(field.isTraversable(300, 338), 'walkway immediately below the railing remains open');
  assert.equal(field.isTraversable(300, 332), false, 'the railing-to-boundary gap is closed for the normal foot collider');
  for (const delta of [{x: 0, y: -12}, {x: 12, y: -12}, {x: -12, y: -12}]) {
    const entry = sweepMove(field, {x: 300, y: 340}, delta);
    assert.ok(entry.position.y > 332, 'normal and diagonal movement cannot enter the railing gap');
  }
  assert.equal(field.isTraversable(330, 360), false, 'visible wooden crate footprint is solid');
  assert.equal(field.isTraversable(340, 335), false, 'visible railing footprint is solid');
  for (const point of [{x: 330, y: 346}, {x: 330, y: 348}, {x: 338, y: 348}]) {
    assert.equal(field.isTraversable(point.x, point.y), false, 'the shared crate/railing boundary has no collider gap');
  }
  const railApproach = {x: 380, y: 340}, railTarget = {x: 340, y: 340};
  assert.ok(field.isTraversable(railApproach.x, railApproach.y));
  const railWalk = sweepMove(field, railApproach, {x: railTarget.x - railApproach.x, y: 0});
  assert.notDeepEqual(railWalk.position, railTarget, 'normal walking cannot cross the railing');
  assert.equal(crateClimbTarget(railApproach, field, false), null, 'the rail section outside the crate passage has no C shortcut');
  assert.equal(findPath(field, CRATE_CLIMBS[0].ends[0], CRATE_CLIMBS[0].ends[1], 8).length, 0,
    'normal pathing cannot cross between the lower street and upper walkway');
  assert.equal(crateClimbTarget({x: 300, y: 360}, field, false), null, 'the old left-side C shortcut is removed');
  assert.equal(crateClimbTarget({x: 360, y: 360}, field, false), null, 'the old right-side C shortcut is removed');
  for (const side of [0, 1] as const) {
    const start = CRATE_CLIMBS[0].ends[side], beyond = CRATE_CLIMBS[0].ends[1 - side];
    const verticalDirection = Math.sign(beyond.y - start.y);
    for (const horizontal of [0, -12, 12]) {
      const result = sweepMove(field, start, {x: horizontal, y: verticalDirection * Math.abs(beyond.y - start.y)});
      assert.ok(field.isTraversable(result.position.x, result.position.y));
      assert.ok(side === 0 ? result.position.y > beyond.y : result.position.y < beyond.y,
        'normal or diagonal input cannot clip through the western crate');
    }
  }
});


for (const gateOpen of [false, true]) for (const climb of CRATE_CLIMBS) for (const side of [0, 1] as const) {
  test(climb.crateId + ' crate normal walk block and C landing, side ' + side + ', rescued=' + gateOpen, () => {
    const normal = gateOpen ? rainyAlleyFieldOpen : rainyAlleyFieldClosed;
    const start = climb.ends[side], landing = climb.ends[side === 0 ? 1 : 0];
    assert.ok(normal.isTraversable(start.x, start.y), 'climb approach must fit normal foot collider');
    assert.ok(normal.isTraversable(landing.x, landing.y), 'climb landing must fit normal foot collider');
    const walk = sweepMove(normal, start, {x: landing.x - start.x, y: landing.y - start.y});
    assert.notDeepEqual(walk.position, landing, 'normal walking cannot pass through the crates');
    if (climb.rescueRequired && !gateOpen) {
      assert.equal(crateClimbTarget(start, normal, false), null, 'eastern C climb stays locked before rescue');
      return;
    }
    const crossing = crateClimbTarget(start, normal, gateOpen);
    assert.ok(crossing);
    assert.deepEqual(crossing.from, start);
    assert.deepEqual(crossing.to, landing);
    assert.ok(normal.isTraversable(crossing.to.x, crossing.to.y));
    if (climb.crateId === 'west') {
      assert.equal(crossing.from.x, crossing.to.x, 'west climb stays on a vertical crossing axis');
      assert.notEqual(crossing.from.y, crossing.to.y, 'west climb crosses between lower and upper elevations');
      const approach = side === 0 ? {x: 111, y: 626} : {x: 300, y: 310};
      assert.ok(findPath(normal, approach, start, 8).length, 'each side is reachable by ordinary movement within its walkway');
      assert.equal(crateClimbTarget({x: 300, y: 360}, normal, gateOpen), null);
      assert.equal(crateClimbTarget({x: 360, y: 360}, normal, gateOpen), null);
    }
    const verticalDirection = Math.sign(landing.y - start.y);
    const resumed = sweepMove(normal, crossing.to, {x: 0, y: verticalDirection * 4}).position;
    assert.equal(Math.sign(resumed.y - crossing.to.y), verticalDirection, 'normal movement resumes after landing');
    if (climb.crateId === 'east') {
      assert.equal(findPath(normal, climb.ends[0], climb.ends[1], 8).length, 0, 'east crates block ordinary route to the poster');
      if (side === 1) {
        const poster = rainyAlleyMapData.objects.fixed.find(object => object.id === 'alley_poster');
        assert.ok(poster && Math.hypot(crossing.to.x - poster.x, crossing.to.y - poster.y) <= rainyAlleyMapData.objects.interactionRadius);
        assert.ok(poster && findPath(normal, crossing.to, poster, 8).length, 'post-climb landing can reach the poster');
      }
    }
  });
}

test('rescue battle return restores exact valid world position or a nearby collision-safe point', () => {
  const point = {x: 111, y: 626};
  assert.deepEqual(battleReturnPositionTarget(point, rainyAlleyFieldOpen), point);
  const invalid = {x: -1, y: 900};
  assert.equal(battleReturnPositionTarget(invalid, rainyAlleyFieldOpen), null);
});
