import test from 'node:test';
import assert from 'node:assert/strict';
import map from '../level_design/chapter4/data/chapter4.map.json' with {type: 'json'};
import geometry from '../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type: 'json'};
import {tunnelExplorationLabels} from '../web/src/modules/chapter4/explorationLabels';
import {tunnelConnections} from '../web/src/modules/chapter4/navigation';
import {tunnelSurfaceConnections} from '../web/src/modules/chapter4/surfaces';
import type {TunnelMarkerState} from '../web/src/modules/chapter4/eventMarkers';
import {warehouseExplorationLabels} from '../web/src/modules/chapter5/explorationLabels';
import type {MarkerState} from '../web/src/modules/chapter5/eventMarkers';

function tunnel(position: {x: number; y: number}, flags: string[] = []): TunnelMarkerState {
  return {floor: 'L0', surface: 'ground', position, flags, drawnEvents: [], nearTarget: null,
    connections: tunnelSurfaceConnections('L0', 'ground', tunnelConnections('L0', position))};
}

test('tunnel locked valve and stairs explain prerequisites without advertising an available key', () => {
  const valve = map.events.find(event => event.id === 'tunnel_valve_three')!;
  const state = tunnel(valve);
  const label = tunnelExplorationLabels(state).find(label => label.id === valve.id)!;
  assert.match(label.text, /先调查诱饵/);
  assert.equal(label.key, undefined);
  const stairs = map.portals.find(portal => portal.id === 'e1')!;
  const locked = tunnelExplorationLabels(tunnel(stairs.a)).find(label => label.id === 'portal:e1:a')!;
  assert.match(locked.text, /先调查假猫叫诱饵/);
  assert.equal(locked.key, undefined);
  const unlocked = tunnelExplorationLabels(tunnel(stairs.a, ['tunnel_false_kitten_trap_found'])).find(label => label.id === 'portal:e1:a')!;
  assert.equal(unlocked.key, 'f');
});

test('tunnel E label yields only to the actual event and completed events lose their key', () => {
  const valve = map.events.find(event => event.id === 'tunnel_valve_three')!;
  const state = tunnel(valve, ['tunnel_false_kitten_trap_found']);
  state.nearTarget = {id: valve.id, label: valve.label};
  assert.deepEqual(tunnelExplorationLabels(state).filter(label => label.key).map(label => [label.id, label.key]), [[valve.id, 'e']]);
  state.drawnEvents = ['node:valve_three_event'];
  assert.equal(tunnelExplorationLabels(state).find(label => label.id === valve.id)?.key, undefined);
});

test('tunnel Space and reverse C labels retain their real keys and landing directions', () => {
  const jump = map.portals.find(portal => portal.id === 'upper-gap-jump')!;
  for (const point of [jump.a, jump.b]) {
    const labels = tunnelExplorationLabels(tunnel(point, ['tunnel_false_kitten_trap_found']));
    const active = labels.find(label => label.key === ' ')!;
    assert.ok(active.id.startsWith('portal:upper-gap-jump:'));
    assert.equal(active.text, '跳过水沟');
    assert.equal(labels.filter(label => label.key === ' ').length, 1);
  }
  const ridge = map.portals.find(portal => portal.id === 'tank-climb')!;
  const state = tunnel(ridge.b, ['tunnel_false_kitten_trap_found']);
  state.surface = 'tank-ridge';
  state.connections = tunnelSurfaceConnections('L0', state.surface, tunnelConnections('L0', ridge.b));
  const down = tunnelExplorationLabels(state).find(label => label.key === 'c')!;
  assert.match(down.text, /返回下方通道/);
  assert.ok(tunnelExplorationLabels(state).every(label => label.id.startsWith('portal:')));
});

test('warehouse labels follow nearest E/C selection, light state, floor and completion', () => {
  const state: MarkerState = {floor: 'L0', position: {x: 833, y: 557}, flags: new Set(), drawn: new Set(),
    near: {id: 'central_spotlight', key: 'E', label: '打开聚光灯 · E', distance: 0}};
  let labels = warehouseExplorationLabels(state);
  assert.deepEqual(labels.filter(label => label.key).map(label => label.key), ['e']);
  assert.equal(labels.find(label => label.id === 'central_spotlight')?.text, '打开聚光灯');
  assert.equal(labels.find(label => label.id === 'bunker_exit')?.key, undefined);
  assert.equal(labels.some(label => label.id === 'warehouse_light_crate'), false);
  state.flags = new Set(['central_spotlight']);
  state.near = {...state.near!, label: '关闭聚光灯 · E'};
  assert.equal(warehouseExplorationLabels(state).find(label => label.key === 'e')?.text, '关闭聚光灯');
  state.position = geometry.climbs[1];
  state.near = {id: 'warehouse_climb', key: 'C', label: 'C · 攀上货架', distance: 0};
  labels = warehouseExplorationLabels(state);
  assert.deepEqual(labels.filter(label => label.key).map(label => [label.id, label.key]), [['climb:C2', 'c']]);
  state.floor = 'L1';
  assert.equal(warehouseExplorationLabels(state).find(label => label.key === 'c')?.text, '回到地面');
  state.drawn = new Set(['node:warehouse_light_crate']);
  state.position = {x: 574, y: 292};
  state.near = null;
  const completed = warehouseExplorationLabels(state).find(label => label.id === 'warehouse_light_crate')!;
  assert.match(completed.text, /已完成/);
  assert.equal(completed.key, undefined);
});
