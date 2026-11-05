import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceChapter, createChapterBattle, dispatchChapter} from '../../web/src/modules/battle/chapter/engine.ts';
import {advanceFinale, createFinaleBattle, dispatchFinale} from '../../web/src/modules/battle/finale/engine.ts';
import {getCatAttackProgress, getCatBodyPose, getCatLimbPose, withCatAttackLimb, type CatLimbStyle} from '../../web/src/modules/battle/shared/catAttackMotion.ts';

const cat = {id: 'guard', x: 3, y: 2, status: 'active'};
const hit = (remaining = .2, kind = 'attack') => ({kind, from: {...cat}, remaining});

test('a paw gesture belongs to the original attacker and tile, never another occupant or an unrelated effect', () => {
  assert.equal(getCatAttackProgress([hit()], cat), .5);
  assert.equal(getCatAttackProgress([hit(.2, 'ally-attack')], cat), .5);
  for (const kind of ['boss-attack', 'elite-attack', 'inspire', 'heal', 'shield', 'skill']) {
    assert.equal(getCatAttackProgress([hit(.2, kind)], cat), undefined, kind);
  }
  assert.equal(getCatAttackProgress([hit()], {...cat, id: 'bruiser'}), undefined);
  assert.equal(getCatAttackProgress([hit()], {...cat, x: cat.x + 1}), undefined);
  assert.equal(getCatAttackProgress([hit()], {...cat, y: cat.y + 1}), undefined);
  assert.equal(getCatAttackProgress([{...hit(), from: {x: cat.x, y: cat.y}}], cat), undefined);
  for (const status of ['retired', 'waiting']) assert.equal(getCatAttackProgress([hit()], {...cat, status}), undefined);
  for (const remaining of [0, -.1, NaN, Infinity]) assert.equal(getCatAttackProgress([hit(remaining)], cat), undefined);
  assert.equal(getCatAttackProgress([], cat), undefined);
  assert.equal(getCatAttackProgress([hit(.1), hit(.4)], cat), 0, 'a new attack supersedes an older gesture');
});

test('a real engine hit retains its identity; pausing freezes the gesture without mutating combat state', () => {
  const initial = dispatchChapter(createChapterBattle(), {type: 'START'});
  for (const actor of initial.cats) actor.cooldown = 999;
  const guard = initial.cats.find(actor => actor.id === 'guard')!;
  guard.x = initial.boss.x - 1; guard.y = initial.boss.y; guard.cooldown = 0;
  initial.boss.cooldown = 999; initial.boss.skillCooldown = 999;
  const attacked = advanceChapter(initial, .05);
  const currentGuard = attacked.cats.find(actor => actor.id === 'guard')!;
  assert.ok(currentGuard.attacks > 0);
  assert.notEqual(getCatAttackProgress(attacked.effects, currentGuard), undefined,
    'the engine must retain the actor id in its runtime Position snapshot');
  const paused = dispatchChapter(attacked, {type: 'PAUSE', paused: true});
  const before = structuredClone(paused);
  const progress = getCatAttackProgress(paused.effects, currentGuard);
  for (let frame = 0; frame < 20; frame++) {
    assert.deepEqual(getCatLimbPose('shield', getCatAttackProgress(paused.effects, currentGuard)), getCatLimbPose('shield', progress));
    assert.deepEqual(getCatBodyPose(getCatAttackProgress(paused.effects, currentGuard)), getCatBodyPose(progress));
  }
  assert.deepEqual(paused, before);
  const later = advanceChapter(paused, 2);
  assert.equal(getCatAttackProgress(later.effects, later.cats.find(actor => actor.id === 'guard')!), progress);
  assert.equal(getCatAttackProgress(attacked.effects, {...currentGuard, x: currentGuard.x - 1}), undefined);
});

test('real finale ally attacks animate but the non-attacking energy support does not', () => {
  const initial = dispatchFinale(createFinaleBattle(), {type: 'START'});
  for (const actor of initial.cats) actor.cooldown = 999;
  for (const ally of initial.allies) {ally.status = 'active'; ally.cooldown = 0;}
  initial.boss.cooldown = 999; initial.boss.skillCooldown = 999;
  const attacked = advanceFinale(initial, .05);
  for (const id of ['controller', 'taotao'] as const) {
    const ally = attacked.allies.find(actor => actor.id === id)!;
    assert.ok(ally.attacks > 0, `${id} must actually attack in the engine fixture`);
    assert.notEqual(getCatAttackProgress(attacked.effects, ally), undefined);
  }
  const singer = attacked.allies.find(actor => actor.id === 'yinyin')!;
  assert.ok(singer.attacks > 0, 'the energy pulse really occurred');
  assert.equal(getCatAttackProgress(attacked.effects, singer), undefined);
});

test('each gesture returns to the original pose and stays finite and close to the shoulder', () => {
  const styles: CatLimbStyle[] = ['claw', 'shield', 'cast', 'support', 'punch', 'bell', 'lantern'];
  const rest = {x: 0, y: 0, angle: 0};
  for (const progress of [undefined, 0, 1, -1, 2, NaN, Infinity]) assert.deepEqual(getCatBodyPose(progress), {x: 0, y: 0});
  const body=getCatBodyPose(.5);
  assert.ok(body.x > 0 && body.x <= 2 && body.y < 0 && body.y >= -1, 'the body should make a small visible forward hop');
  assert.ok(Object.values(getCatBodyPose(.99999)).every(value => Math.abs(value) < .001), 'the whole sprite must settle back without drifting');
  for (const style of styles) {
    for (const progress of [undefined, 0, 1, -1, 2, NaN, Infinity]) assert.deepEqual(getCatLimbPose(style, progress), rest);
    for (const progress of [.05, .2, .3, .44, .6, .8, .99]) {
      const pose = getCatLimbPose(style, progress);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(Math.hypot(pose.x, pose.y) < 4, 'small native-pixel displacement must not resemble a new attack reach');
      assert.ok(Math.abs(pose.angle) < 1, 'the wrist should not turn the limb upside down');
    }
    assert.notDeepEqual(getCatLimbPose(style, .2), getCatLimbPose(style, .44), `${style} must have distinct preparation and release`);
    assert.ok(Object.values(getCatLimbPose(style, .99999)).every(value => Math.abs(value) < .001), 'recovery must approach rest continuously');
  }
});

test('limb transforms preserve the surrounding Canvas state, including when drawing fails', () => {
  let state = {x: 11, y: 13, angle: .1, fillStyle: '#123456'};
  const initial = {...state};
  const stack: typeof state[] = [];
  const ctx = {
    save() {stack.push({...state});},
    restore() {assert.ok(stack.length); state = stack.pop()!;},
    translate(x: number, y: number) {assert.ok(Number.isFinite(x) && Number.isFinite(y)); state.x += x; state.y += y;},
    rotate(angle: number) {assert.ok(Number.isFinite(angle)); state.angle += angle;},
  } as unknown as CanvasRenderingContext2D;
  let draws = 0;
  withCatAttackLimb(ctx, 'claw', .44, 24, 21, () => {
    draws++; assert.notDeepEqual(state, initial); state.fillStyle = '#abcdef';
  });
  assert.equal(draws, 1); assert.deepEqual(state, initial); assert.equal(stack.length, 0);
  const failure = new Error('drawing failed');
  assert.throws(() => withCatAttackLimb(ctx, 'bell', .6, 24, 21, () => {throw failure;}), error => error === failure);
  assert.deepEqual(state, initial); assert.equal(stack.length, 0);
});

test('idle and completed gestures paint directly without introducing transforms', () => {
  for (const progress of [undefined, 0, 1]) {
    let draws = 0;
    const untouched = {} as CanvasRenderingContext2D;
    withCatAttackLimb(untouched, 'cast', progress, 23, 22, () => {draws++;});
    assert.equal(draws, 1);
  }
});
