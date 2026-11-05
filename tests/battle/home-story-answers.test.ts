import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Catalog, GameState} from '../../web/src/contracts';
import notes from '../../web/content/story/advisor-home.json';
import {getJourneyLocalAnswer} from '../../web/src/modules/advisor/journey-context';

const catalog = JSON.parse(readFileSync(new URL('../../web/content/catalog.json', import.meta.url), 'utf8')) as Catalog;
const questions: Record<string, string> = {
  shelter: '为什么来到花房，这里为什么能成为家园？',
  'market-return': '我们之前怎么从集市回来的？',
  'momo-joined': '墨墨为什么加入我们？',
  'tunnel-rescue': '地下通道救援后来怎么样了？',
  kingdom: '王国落成后，喵喵和主人重逢了吗？',
};
function home(changes: Partial<GameState> = {}): GameState {
  return {schemaVersion: 1, contentVersion: catalog.version, revision: 1, phase: 'home', chapterId: 'greenhouse',
    storyNodeId: '', mapId: 'greenhouse', flags: [], cats: ['miaomiao', 'tuanzi'], inventory: {}, currencies: {},
    furniture: [], placements: {}, completedStages: [], pendingEventId: '', activeBattle: null,
    lastResult: {message: ''}, ...changes};
}
const answer = (state: GameState, question: string) => getJourneyLocalAnswer(state, catalog, question).text;

test('home offline story answers use each approved fact only after all its conditions are satisfied', () => {
  for (const note of notes) {
    const state = home({flags: [...note.requiredFlags], cats: [...note.requiredCats]});
    const before = structuredClone(state);
    assert.ok(answer(state, questions[note.id]).includes(note.text), note.id);
    for (const flag of note.requiredFlags) {
      const hidden = answer({...state, flags: state.flags.filter(value => value !== flag)}, questions[note.id]);
      assert.ok(!hidden.includes(note.text), `${note.id} missing ${flag}`);
      assert.match(hidden, /记录不足/);
    }
    for (const cat of note.requiredCats) {
      assert.ok(!answer({...state, cats: state.cats.filter(value => value !== cat)}, questions[note.id]).includes(note.text), `${note.id} missing ${cat}`);
    }
    assert.deepEqual(state, before);
  }
});

test('story overview shares only known summaries; QA and battle-only records do not unlock them', () => {
  const early = home({flags: ['alley_rescued', 'rescue_story_done'], cats: ['diandian']});
  const summary = answer(early, '我们已经走到哪一步了？');
  assert.ok(summary.includes(notes[0].text));
  for (const future of notes.slice(1)) assert.ok(!summary.includes(future.text));
  const all = home({flags: notes.flatMap(note => note.requiredFlags), cats: ['diandian', 'momo']});
  for (const note of notes) assert.ok(answer(all, '回顾一下我们已知的剧情').includes(note.text));
  const qa = {...all, qaCheckpointId: 'finale.home'};
  assert.match(answer(qa, '我们已经走到哪一步了？'), /记录不足/);
  const trials = home({completedStages: ['greenhouse_boss', 'tunnel_boss', 'finale_boss'], cats: ['momo'],
    lastResult: {stageId: 'finale_boss', outcome: 'won', message: '胜利'}});
  assert.match(answer(trials, '墨墨为什么加入我们？'), /记录不足/);
});

test('story answers never replace rule, current-goal, or unavailable full-history answers', () => {
  const state = home({flags: ['chapter_3_started', 'momo_joined', 'rescue_story_done'], cats: ['momo'],
    completedStages: ['greenhouse_boss']});
  assert.match(answer(state, '现在能去地下通道了吗？'), /先完成花房保卫战/);
  assert.match(answer(state, '为什么要守花房？'), /先完成花房保卫战/);
  assert.match(answer(state, '墨墨花房技能怎么用？'), /巡光护行/);
  assert.match(answer(state, '你记得我以前说的所有台词吗？'), /不是完整/);
  assert.match(answer(state, '未来结局是什么？'), /无法确认/);
  assert.doesNotMatch(answer(state, '未来结局是什么？'), /主人重逢/);
  assert.match(answer(state, '墨墨为什么加入我们？'), /更深的动机.*无法.*确认/);
});
