import test from 'node:test';
import assert from 'node:assert/strict';
import type {GameState} from '../../web/src/contracts/index.ts';
import {ExploreAdvisorHints, type ExploreHintInput} from '../../web/src/modules/advisor/explore-hints.ts';
import {AdvisorContextChanged, requestModelAdvisor, type ExploreHintRequest, type ModelAdvisorAnswer} from '../../web/src/modules/battle/model-advisor-client.ts';

const state = (): GameState => ({schemaVersion: 1, contentVersion: 'test', revision: 1, phase: 'explore',
  chapterId: 'market', mapId: 'market', storyNodeId: '', pendingEventId: '', activeBattle: null, flags: [],
  cats: [], inventory: {}, currencies: {}, furniture: [], placements: {}, completedStages: [], lastResult: {message: ''}});
const source = '集市北侧似乎还留着一条熟悉的踪迹。';
const model = (text = '北侧似乎留有熟悉的踪迹，不妨留意。'): ModelAdvisorAnswer => ({source: 'model', title: '阿策', text});
const flush = async () => {for (let i = 0; i < 8; i++) await Promise.resolve();};
function fixture() {
  let time = 0, next = 0, token: string | undefined = 'account-one', visible = true;
  const timers = new Map<number, {at: number; callback: () => void}>();
  const calls: {body: ExploreHintRequest; signal: AbortSignal; resolve: (v: ModelAdvisorAnswer) => void; reject: (v: unknown) => void}[] = [];
  const hints = new ExploreAdvisorHints({session: () => token, visible: () => visible, now: () => time,
    setTimer: (callback, delay) => {const id = ++next; timers.set(id, {at: time + delay, callback}); return id as unknown as ReturnType<typeof setTimeout>;},
    clearTimer: id => {timers.delete(id as unknown as number);},
    request: (body, signal) => new Promise((resolve, reject) => calls.push({body, signal, resolve, reject})),
  });
  let input: ExploreHintInput = {state: state(), enabled: true, inspectHint: source, floor: 'L0', hintKey: 'INTERNAL_UNSEEN_TRAP_ID:far'};
  const update = (patch: Partial<ExploreHintInput> = {}) => {input = {...input, ...patch}; hints.update(input);};
  const advance = async (ms: number) => {
    const end = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); time = due[1].at; due[1].callback(); await flush();
    }
    time = end; await flush();
  };
  return {hints, calls, update, advance, input: () => input, token: (value: string | undefined) => {token = value;}, visible: (value: boolean) => {visible = value;}};
}

test('automatic hint debounces, uses latest revision and sends only the approved sentence', async () => {
  const f = fixture(); f.update();
  assert.deepEqual(f.hints.getSnapshot(), {text: source, source: 'local', loading: true});
  await f.advance(799); assert.equal(f.calls.length, 0);
  f.update({state: {...f.input().state, revision: 42, exploreDistance: 900}});
  await f.advance(1); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.expectedRevision, 42);
  assert.deepEqual(JSON.parse(f.calls[0].body.context), {hint: source});
  assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['context', 'expectedRevision', 'sceneKey', 'scope']);
  assert.doesNotMatch(JSON.stringify(f.calls[0].body), /INTERNAL_|history|token|position/);
  f.calls[0].resolve(model()); await flush();
  assert.equal(f.hints.getSnapshot().source, 'model');
});

test('per-frame updates do not request again; revisiting a distance band uses its cached result', async () => {
  const f = fixture(); f.update(); await f.advance(800); f.calls[0].resolve(model()); await flush();
  for (let i = 0; i < 120; i++) f.update({state: {...f.input().state, revision: i + 50, exploreDistance: i}});
  await f.advance(30000); assert.equal(f.calls.length, 1);
  f.update({hintKey: 'near', inspectHint: '北侧高街的墙面像是留下了新的爪印。'});
  await f.advance(800); assert.equal(f.calls.length, 2); f.calls[1].resolve(model('北侧高街的墙面像是有新的爪印。')); await flush();
  f.update({hintKey: 'INTERNAL_UNSEEN_TRAP_ID:far', inspectHint: source});
  assert.equal(f.hints.getSnapshot().text, model().text); await f.advance(30000); assert.equal(f.calls.length, 2);
});

test('rapid target/distance changes coalesce and attempts stay at least 15 seconds apart', async () => {
  const f = fixture(); f.update(); await f.advance(800); f.calls[0].resolve(model()); await flush();
  f.update({hintKey: 'middle', inspectHint: '墙面像是有新的爪印。'}); await f.advance(400);
  f.update({hintKey: 'close', inspectHint: '离踪迹越来越近了，去看看墙边那条路。'});
  await f.advance(14599); assert.equal(f.calls.length, 1);
  await f.advance(1); assert.equal(f.calls.length, 2);
  assert.equal(JSON.parse(f.calls[1].body.context).hint, '离踪迹越来越近了，去看看墙边那条路。');
});

test('nearby real interactions cancel rewriting; completed goals and scene changes remove late results', async () => {
  const f = fixture(); f.update(); await f.advance(800);
  f.update({nearTarget: {id: 'interaction', label: '按 E 查看'}});
  assert.equal(f.calls[0].signal.aborted, true); f.calls[0].resolve(model('不该出现')); await flush();
  assert.equal(f.hints.getSnapshot().source, 'local');
  await f.advance(60000); assert.equal(f.calls.length, 1);
  f.update({nearTarget: null, inspectHint: null, state: {...f.input().state, drawnEvents: ['node:done'], revision: 5}});
  assert.equal(f.hints.getSnapshot().text, null);
  f.update({inspectHint: source, state: {...f.input().state, phase: 'event', pendingEventId: 'event'}});
  assert.equal(f.hints.getSnapshot().text, null); await f.advance(60000); assert.equal(f.calls.length, 1);
});

test('floor, completion progress, account and QA resets invalidate caches and old responses', async () => {
  for (const change of ['floor', 'progress', 'account', 'qa', 'restart']) {
    const f = fixture(); f.update(); await f.advance(800);
    if (change === 'floor') f.update({floor: 'L1'});
    if (change === 'progress') f.update({state: {...f.input().state, flags: ['done'], revision: 2}});
    if (change === 'account') {f.token('account-two'); f.update();}
    if (change === 'qa') f.update({resetKey: 'new-qa-visit'});
    if (change === 'restart') f.update({state: {...f.input().state, revision: 0}});
    assert.equal(f.calls[0].signal.aborted, true, change);
    f.calls[0].resolve(model('旧场景')); await flush(); assert.equal(f.hints.getSnapshot().source, 'local', change);
    await f.advance(15000); assert.equal(f.calls.length, 2, change);
  }
});

test('same-tab token switch rejects a response even before the next render', async () => {
  const f = fixture(); f.update(); await f.advance(800); f.token('account-two');
  f.calls[0].resolve(model('旧账号提示')); await flush();
  assert.equal(f.hints.getSnapshot().source, 'local'); assert.doesNotMatch(f.hints.getSnapshot().text!, /旧账号/);
});

test('failure, context conflicts and invalid output keep original text and are not retried', async () => {
  for (const failure of ['network', 'stale', 'local', 'long', 'html', 'multiline']) {
    const f = fixture(); f.update(); await f.advance(800);
    if (failure === 'network') f.calls[0].reject(new Error('offline'));
    if (failure === 'stale') f.calls[0].reject(new AdvisorContextChanged());
    if (failure === 'local') f.calls[0].resolve({source: 'local', title: '', text: '', reason: 'rate_limited'});
    if (failure === 'long') f.calls[0].resolve(model('字'.repeat(81)));
    if (failure === 'html') f.calls[0].resolve(model('<script>bad()</script>'));
    if (failure === 'multiline') f.calls[0].resolve(model('一行\n另一行'));
    await flush(); assert.deepEqual(f.hints.getSnapshot(), {text: source, source: 'local', loading: false}, failure);
    f.update(); await f.advance(60000); assert.equal(f.calls.length, 1, failure);
  }
});

test('unsupported phases, hub, hidden page, locked rules and missing session never call a model', async () => {
  for (const change of ['phase', 'hub', 'disabled', 'hidden', 'locked', 'key', 'auth', 'empty', 'blocked', 'missing-floor']) {
    const f = fixture();
    if (change === 'phase') f.update({state: {...f.input().state, phase: 'home'}});
    if (change === 'hub') f.update({state: {...f.input().state, mapId: 'greenhouse'}});
    if (change === 'disabled') f.update({enabled: false});
    if (change === 'hidden') {f.visible(false); f.update();}
    if (change === 'locked') f.update({inspectHint: '需要先解锁机关。'});
    if (change === 'key') f.update({inspectHint: '按 F 切换楼层。'});
    if (change === 'auth') {f.token(undefined); f.update();}
    if (change === 'empty') f.update({inspectHint: null});
    if (change === 'blocked') f.update({blocked: true});
    if (change === 'missing-floor') f.update({floor: undefined});
    await f.advance(60000); assert.equal(f.calls.length, 0, change);
  }
});

test('the request client uses the existing authenticated route without adding chat fields', async () => {
  const body: ExploreHintRequest = {scope: 'explore_hint', sceneKey: 'scene', expectedRevision: 5, context: JSON.stringify({hint: source})};
  let observed: unknown;
  const answer = await requestModelAdvisor(body, new AbortController().signal, {session: {read: () => ({playerId: 'player', token: 'session-private'})},
    apiBase: 'http://local.test/api/v1', fetch: async (url, init) => {
      assert.equal(url, 'http://local.test/api/v1/advisor');
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer session-private');
      observed = JSON.parse(String(init!.body)); return new Response(JSON.stringify(model()));
    }});
  assert.deepEqual(observed, body); assert.equal(answer.source, 'model');
});
