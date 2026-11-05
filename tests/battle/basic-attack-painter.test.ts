import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceChapter, createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
import {ENEMY_DEFINITIONS} from '../../web/src/modules/battle/chapter/config.ts';
import {paintBasicAttack, resolveBasicAttack, type AttackTheme, type BasicAttackEffect, type BasicAttackOptions} from '../../web/src/modules/battle/shared/basicAttackPainter.ts';

const cats = ['caster', 'guard', 'tuanzi', 'diandian', 'bruiser', 'controller', 'momo', 'taotao'] as const;
const themes: AttackTheme[] = ['alley', 'market', 'greenhouse', 'tunnel', 'finale'];
const point = (id: string, x = 2, y = 2) => ({id, x, y});
const options: BasicAttackOptions = {cellSize: 80, theme: 'alley'};
const effect = (id: string, kind = 'attack'): BasicAttackEffect => ({
  kind, from: point(id), to: point('minion-1', 5, 2), remaining: .24,
});

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Record geometry and exercise Canvas save/restore semantics without depending on
// a particular colour, stroke count, or one implementation of an attack shape.
function canvas() {
  type CanvasState = {
    fillStyle: string; strokeStyle: string; lineWidth: number; globalAlpha: number;
    lineJoin: string; lineCap: string; transform: number[];
  };
  let state: CanvasState = {
    fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 7, globalAlpha: .63,
    lineJoin: 'round', lineCap: 'round', transform: [1, 0, 0, 1, 11, 13],
  };
  const stack: CanvasState[] = [];
  const commands: {op: string; args: number[]}[] = [];
  let draws = 0;
  const record = (op: string, ...args: number[]) => {
    assert.ok(args.every(Number.isFinite), `${op} must receive only finite coordinates`);
    commands.push({op, args});
  };
  const multiply = ([a, b, c, d, e, f]: number[]) => {
    const [aa, bb, cc, dd, ee, ff] = state.transform;
    state.transform = [aa*a+cc*b, bb*a+dd*b, aa*c+cc*d, bb*c+dd*d, aa*e+cc*f+ee, bb*e+dd*f+ff];
  };
  const target = {
    save() {stack.push(structuredClone(state));},
    restore() {assert.ok(stack.length, 'restore requires a matching save'); state = stack.pop()!;},
    translate(x: number, y: number) {record('translate', x, y); multiply([1, 0, 0, 1, x, y]);},
    rotate(angle: number) {record('rotate', angle); multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]);},
    scale(x: number, y: number) {record('scale', x, y); multiply([x, 0, 0, y, 0, 0]);},
    beginPath() {record('beginPath');},
    closePath() {record('closePath');},
    moveTo(x: number, y: number) {record('moveTo', x, y);},
    lineTo(x: number, y: number) {record('lineTo', x, y);},
    fillRect(x: number, y: number, w: number, h: number) {record('fillRect', x, y, w, h); draws++;},
    fill() {record('fill'); draws++;},
    stroke() {record('stroke'); draws++;},
  };
  const context = new Proxy(target, {
    get(object, key) {return key in state ? Reflect.get(state, key) : Reflect.get(object, key);},
    set(_object, key, value) {
      assert.ok(key in state, `unexpected Canvas state property ${String(key)}`);
      return Reflect.set(state, key, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return {context, commands, snapshot: () => structuredClone(state),
    get depth() {return stack.length;}, get draws() {return draws;}};
}

test('attack style follows original actor identity, including enemies sharing a cat tile and allies', () => {
  const cat = point('caster'), enemy = point('minion-1');
  const shot = {...effect('caster'), from: {...cat}};
  cat.x = 6; cat.y = 4; // A later move must not drag or relabel the old hit.
  const resolved = resolveBasicAttack(shot, options);
  assert.equal(resolved.style, 'caster');
  assert.deepEqual(resolved.from, {x: 200, y: 200});
  assert.equal(resolveBasicAttack({...shot, from: enemy}, options).style, 'enemy');
  assert.equal(resolveBasicAttack({...shot, from: {x: 2, y: 2}}, options).style, 'neutral');
  assert.equal(resolveBasicAttack(effect('elite-1', 'elite-attack'), options).style, 'enemy');
  assert.equal(resolveBasicAttack(effect('controller', 'ally-attack'), options).style, 'controller');
  assert.equal(resolveBasicAttack(effect('taotao', 'ally-attack'), options).style, 'taotao');
});

test('large boss hit snapshots retain their center across retreat while new occupants use their own tile', () => {
  for (const [index, theme] of themes.entries()) {
    const width = [2, 1, 2, 2, 3][index];
    const boss = {id: `boss-${theme}`, x: 6, y: 2, width, height: width, phase: 'idle'};
    const hit = {...effect('caster'), to: {...boss}};
    const expected = {x: (boss.x+width/2)*80, y: (boss.y+width/2)*80};
    const before = resolveBasicAttack(hit, {...options, theme, boss});
    assert.deepEqual(before.to, expected);
    boss.phase = 'defeated';
    assert.deepEqual(resolveBasicAttack(hit, {...options, theme, boss}).to, expected,
      'the killing hit remains attached to the original boss center');
    const outgoing = {kind: 'boss-attack', from: {...boss}, to: point('guard', 5, 2), remaining: .2};
    assert.deepEqual(resolveBasicAttack(outgoing, {...options, theme, boss}).from, expected,
      'a still-playing boss hit does not jump to the old footprint corner');
    const occupied = {...effect('guard'), from: point('guard', boss.x, boss.y), to: point('minion-2', 5, 2)};
    assert.deepEqual(resolveBasicAttack(occupied, {...options, theme, boss}).from,
      {x: (boss.x+.5)*80, y: (boss.y+.5)*80});
    const legacy = {...hit, to: {x: boss.x, y: boss.y}};
    assert.deepEqual(resolveBasicAttack(legacy, {...options, theme, boss}).to,
      {x: (boss.x+.5)*80, y: (boss.y+.5)*80}, 'anonymous coordinates in cleared tiles do not identify the old boss');
  }
});

test('real engine hits preserve separate cat, minion and boss identities without following later cat moves', () => {
  const initial = dispatchChapter(createChapterBattle(), {type: 'START'});
  for (const cat of initial.cats) cat.cooldown = 999;
  const guard = initial.cats.find(cat => cat.id === 'guard')!;
  guard.x = initial.boss.x - 1; guard.y = initial.boss.y; guard.cooldown = 0;
  initial.boss.cooldown = 0; initial.boss.skillCooldown = 999;
  initial.enemies.push({...ENEMY_DEFINITIONS.scout, id: 'minion-test', kind: 'scout', hp: 100,
    route: 'upper', x: guard.x + .3, y: guard.y, cooldown: 0, blockedBy: 'guard'});
  const state = advanceChapter(initial, .05);
  const hits = state.effects.filter(hit => hit.kind === 'attack' || hit.kind === 'boss-attack');
  const resolved = hits.map(hit => resolveBasicAttack(hit, {...options, boss: state.boss}));
  assert.deepEqual(new Set(resolved.map(hit => hit.style)), new Set(['guard', 'enemy', 'boss-alley']));
  const before = structuredClone(resolved);
  state.cats.find(cat => cat.id === 'guard')!.x = 2;
  assert.deepEqual(hits.map(hit => resolveBasicAttack(hit, {...options, boss: state.boss})), before);
  freeze(state);
  const saved = JSON.stringify(state);
  for (const hit of hits) paintBasicAttack(canvas().context, hit, {...options, boss: state.boss});
  assert.equal(JSON.stringify(state), saved, 'painting must not alter HP, timers, positions, or hit snapshots');
});

test('every cat and every boss theme renders a distinct geometric signature and restores Canvas state', () => {
  const signatures = new Set<string>();
  const cases = [
    ...cats.map(id => ({hit: effect(id), settings: options})),
    ...themes.map(theme => ({hit: effect(`boss-${theme}`, 'boss-attack'), settings: {...options, theme}})),
  ];
  for (const {hit, settings} of cases) {
    freeze(hit); freeze(settings);
    const spy = canvas(), before = spy.snapshot();
    paintBasicAttack(spy.context, hit, settings);
    assert.ok(spy.draws > 0, `${resolveBasicAttack(hit, settings).style} must be visible`);
    assert.equal(spy.depth, 0);
    assert.deepEqual(spy.snapshot(), before, 'transform, opacity and drawing styles cannot leak to later actors');
    signatures.add(JSON.stringify(spy.commands));
  }
  assert.equal(signatures.size, cases.length, 'role variety must include shape differences, not colours alone');
});

test('zero-distance hits remain finite, visible and bounded for all roles and boss themes', () => {
  for (const id of cats) {
    const spy = canvas();
    paintBasicAttack(spy.context, {...effect(id), to: point('minion-same-cell')}, options);
    assert.ok(spy.draws > 0); assert.equal(spy.depth, 0);
  }
  for (const theme of themes) {
    const boss = {id: `boss-${theme}`, x: 2, y: 2, width: 2, height: 2, phase: 'idle'};
    const spy = canvas();
    paintBasicAttack(spy.context, {kind: 'boss-attack', from: boss, to: {...boss}, remaining: .24}, {...options, theme, boss});
    assert.ok(spy.draws > 0); assert.equal(spy.depth, 0);
    // A body-center overlap can still span from a moving hand to that center.
    // Bound geometry around the actual painted origin/target, not an assumed
    // origin at the boss center (the greenhouse whip attaches to its hand).
    const origin = spy.commands.find(command => command.op === 'translate')!.args;
    const target = resolveBasicAttack({kind: 'boss-attack', from: boss, to: {...boss}, remaining: .24}, {...options, theme, boss}).to;
    const span = Math.hypot(target.x-origin[0], target.y-origin[1]);
    for (const command of spy.commands.filter(command => ['moveTo', 'lineTo', 'fillRect'].includes(command.op))) {
      const [x,y,w=0,h=0] = command.args;
      assert.ok(x>=-40 && x+w<=span+40 && y>=-40 && y+h<=40,
        'an overlapping-body hit stays inside its real hand-to-target span plus a compact half-cell impact');
    }
  }
});

test('expired effects draw nothing and immutable animation samples change only presentation', () => {
  const dead = canvas();
  paintBasicAttack(dead.context, {...effect('caster'), remaining: 0}, options);
  assert.equal(dead.draws, 0); assert.equal(dead.depth, 0);
  const original = freeze(effect('caster'));
  const saved = JSON.stringify(original);
  const frames = [.39, .24, .08].map(remaining => {
    const spy = canvas();
    paintBasicAttack(spy.context, freeze({...original, remaining}), options);
    return JSON.stringify(spy.commands);
  });
  assert.equal(new Set(frames).size, frames.length, 'remaining simulation time must animate the effect');
  assert.equal(JSON.stringify(original), saved);
});
