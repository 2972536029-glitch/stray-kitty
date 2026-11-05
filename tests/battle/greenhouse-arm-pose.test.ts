import assert from 'node:assert/strict';
import test from 'node:test';
import {createGreenhouseBattle} from '../../web/src/modules/battle/greenhouse/engine.ts';
import {getGreenhouseArmPose,getGreenhouseWhipCurve} from '../../web/src/modules/battle/shared/greenhouseArmPose.ts';
import {paintBasicAttack} from '../../web/src/modules/battle/shared/basicAttackPainter.ts';

const boss = createGreenhouseBattle().boss;
const target = (side: -1 | 1) => ({x: boss.x + (side === -1 ? -2 : 3), y: boss.y + 1});
const remaining = (progress: number) => .4 * (1 - progress);
const finite = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
  : value !== null && typeof value === 'object' ? Object.values(value).every(finite) : true;

test('the vine stays attached, unfurls to the target at full extension and follows through on the opposite side',()=>{
  for(const length of [0,12,80,240]){
    const windup=getGreenhouseWhipCurve(length,.18),hit=getGreenhouseWhipCurve(length,.42),follow=getGreenhouseWhipCurve(length,.64);
    for(const p of [0,.18,.3,.42,.64,.9,1]){
      const curve=getGreenhouseWhipCurve(length,p);
      assert.ok(finite(curve));
      assert.ok(curve[0].x===0&&curve[0].y===0,'root remains at the moving hand');
      assert.ok(curve.every(q=>q.x>=0&&q.x<=length),'vine cannot overshoot the actual target');
    }
    assert.deepEqual(hit.at(-1),{x:length,y:0});
    if(length){
      assert.ok(windup.at(-1)!.x<length*.5,'backswing tip is not already touching the cat');
      assert.ok(windup[12].y<0&&follow[12].y>0,'the bend swings across the aim line');
      assert.ok(getGreenhouseWhipCurve(length,.99).at(-1)!.x<length*.3,'the tip retracts with the arm');
    }
  }
});

test('the rendered vine starts at the exact same transformed hand as the animated greenhouse arm', () => {
  for (const side of [-1, 1] as const) for (const progress of [0, .12, .3, .5, .82]) for (const cellSize of [40, 80, 120]) {
    const to = target(side), time = remaining(progress);
    const pose = getGreenhouseArmPose(boss, to, time, cellSize);
    const hand = side === -1 ? pose.left.hand : pose.right.hand;
    const worldHand = {
      x: pose.body.x + hand.x * pose.body.scale,
      y: pose.body.y + hand.y * pose.body.scale,
    };
    assert.deepEqual(pose.whipOrigin, worldHand);

    const translations: number[][] = [], moves: number[][] = [];
    const context = {
      globalAlpha: 1,
      save() {}, restore() {},
      translate(x: number, y: number) {translations.push([x, y]);},
      moveTo(x: number, y: number) {moves.push([x, y]);},
      rotate() {}, scale() {}, beginPath() {}, closePath() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    paintBasicAttack(context, {kind: 'boss-attack', from: {...boss}, to, remaining: time},
      {cellSize, boss, theme: 'greenhouse'});
    assert.deepEqual(translations[0], [worldHand.x, worldHand.y], 'the real effect painter uses the arm attachment');
    assert.ok(moves[0]?.every(value => value === 0), 'the vine begins at the hand, with no remaining boss-edge offset');
  }
});

test('the target-facing arm throws and returns while the opposite arm keeps its idle pose', () => {
  const idle = getGreenhouseArmPose(boss);
  for (const side of [-1, 1] as const) {
    const to = target(side), rest = side === -1 ? idle.left : idle.right;
    const pose = getGreenhouseArmPose(boss, to, remaining(.42));
    const selected = side === -1 ? pose.left : pose.right;
    assert.equal(pose.side, side); assert.equal(pose.active, true);
    assert.notDeepEqual(selected.hand, rest.hand, 'the actual hand moves, not only the whole body');
    assert.ok((selected.hand.x - rest.hand.x) * side > 0, 'the hand extends toward the target side');
    assert.deepEqual(side === -1 ? pose.right : pose.left, side === -1 ? idle.right : idle.left);
    const settled = getGreenhouseArmPose(boss, to, 0);
    assert.equal(settled.active, false);
    assert.deepEqual(settled.left, idle.left); assert.deepEqual(settled.right, idle.right);
    assert.deepEqual(settled.body, idle.body);
    const nearlySettled = getGreenhouseArmPose(boss, to, remaining(.999));
    const almostHand = side === -1 ? nearlySettled.left.hand : nearlySettled.right.hand;
    assert.ok(Math.hypot(almostHand.x-rest.hand.x, almostHand.y-rest.hand.y) < .01,
      'the final active frame approaches the idle grip without a snap');
  }
});

test('an overlapping old hit follows the real raised hand during seed windup and rests during recovery', () => {
  for (const side of [-1, 1] as const) {
    const pose = getGreenhouseArmPose({...boss, phase: 'windup'}, target(side), remaining(.42));
    assert.equal(pose.active, false, 'the basic attack cannot replace the seed windup pose');
    // These are the existing two raised seed/hand positions in the actual model.
    assert.deepEqual(pose.whipOrigin, {
      x: pose.body.x + (side === -1 ? 7 : 73) * pose.body.scale,
      y: pose.body.y + 8 * pose.body.scale,
    });
    const rest = getGreenhouseArmPose({...boss, phase: 'recovery'});
    const recovery = getGreenhouseArmPose({...boss, phase: 'recovery'}, target(side), remaining(.42));
    assert.equal(recovery.active, false);
    assert.deepEqual(recovery.left, rest.left); assert.deepEqual(recovery.right, rest.right);
  }
});

test('poses read frozen inputs, stay finite for a coincident target and allow an existing hit to finish after retreat', () => {
  const frozenBoss = Object.freeze({...boss});
  const coincident = Object.freeze({x: boss.x + boss.width / 2 - .5, y: boss.y + boss.height / 2 - .5});
  const saved = JSON.stringify({boss: frozenBoss, target: coincident});
  for (const time of [undefined, .4, .3, .2, .01, 0, -1]) {
    const pose = getGreenhouseArmPose(frozenBoss, coincident, time);
    assert.ok(finite(pose));
    assert.equal(pose.side, -1, 'a coincident target uses a stable direction fallback');
  }
  assert.equal(JSON.stringify({boss: frozenBoss, target: coincident}), saved);
  const hit = getGreenhouseArmPose(frozenBoss, target(-1), .2);
  const afterRetreat = getGreenhouseArmPose(Object.freeze({...boss, phase: 'defeated'}), target(-1), .2);
  assert.deepEqual(afterRetreat, hit, 'an existing whip keeps its attachment when the boss disappears');
});
