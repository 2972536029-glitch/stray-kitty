import type {Catalog, GameState} from '../../contracts';
import storyNotes from '../../../content/story/advisor-home.json';
import {homeStage} from '../home/layout';
import {currentHomeRenovation} from '../home/repairs';

/** UI supplies its real activity state. Chat's own pause is not externalPaused. */
export interface HomeAdvisorActivity {
  entered: boolean;
  externalPaused: boolean;
  overlayOpen: boolean;
  busy: boolean;
  pending: boolean;
  renovating: boolean;
  repairCardOpen: boolean;
  tutorialOpen: boolean;
  pageHidden: boolean;
}

export type HomeAdvisorBlock = 'outside-home' | 'not-entered' | 'page-hidden' |
  'external-pause' | 'overlay' | 'command' | 'renovation' | 'repair-card' | 'tutorial';

/** No timers, automatic opening, model calls, or game commands. */
export function homeAdvisorBlock(state: GameState, activity: HomeAdvisorActivity): HomeAdvisorBlock | null {
  if (state.phase !== 'home' || state.chapterId === 'prologue') return 'outside-home';
  if (!activity.entered) return 'not-entered';
  if (activity.pageHidden) return 'page-hidden';
  if (activity.externalPaused) return 'external-pause';
  if (activity.overlayOpen) return 'overlay';
  if (activity.busy || activity.pending) return 'command';
  if (activity.renovating) return 'renovation';
  if (activity.repairCardOpen) return 'repair-card';
  if (activity.tutorialOpen) return 'tutorial';
  return null;
}

export interface HomeStorySummary {id: string; title: string; text: string}

/** Story flags prove these small milestones, never every old line or choice.
 * QA checkpoints manufacture progress; battle completion alone is not story. */
export function knownHomeStorySummaries(state: GameState): HomeStorySummary[] {
  if (state.phase !== 'home' || state.qaCheckpointId) return [];
  return storyNotes.filter(note =>
    note.requiredFlags.every(flag => state.flags.includes(flag)) &&
    note.requiredCats.every(cat => state.cats.includes(cat)),
  ).map(({id, title, text}) => ({id, title, text}));
}

const welcomes = [
  '先在花房歇一会儿。想修哪里、想怎么布置，我们慢慢商量。',
  '花房暖和起来了。歇歇脚，修缮和伙伴的事都可以慢慢聊。',
  '花房又添了几分家的样子。想聊家具，还是伙伴们的事？',
  '灯串亮着，花房里很暖。歇一会儿吧，有什么想问的就说。',
];

/** Show on a deliberate chat open, never as an unsolicited arrival popup. */
export function homeAdvisorCopy(state: GameState, catalog: Catalog) {
  if (state.phase !== 'home' || state.chapterId === 'prologue') return null;
  const stories = knownHomeStorySummaries(state);
  const renovation = currentHomeRenovation(state, catalog);
  return {
    name: '阿策',
    subtitle: '在花房，慢慢聊',
    welcome: welcomes[homeStage(state) - 1],
    context: renovation
      ? '想继续修缮，可以看看场景里的修补标记。需要哪些材料，以当前修缮说明为准。'
      : '家的新模样已经亮起来了。想换个摆法，或聊聊眼下的疑问，都可以问我。',
    placeholder: '想问点什么？',
    pending: '让我看看眼下的情况……',
    modelLabel: '阿策 · 模型建议',
    localLabel: '阿策 · 本地说明',
    localNotice: '这次先用已有规则回答你。',
    changedNotice: '眼下的情况变了，想聊的话可以再问我。',
    prompts: [
      ...(renovation ? ['修缮该从哪里开始？'] : []),
      '怎么摆放或收起家具？',
      ...(state.cats.length ? ['聊聊已经结识的伙伴吧。'] : []),
      '战斗技能怎么蓄能？',
      '事件的骰点和鼓励怎么用？',
      ...(stories.length ? ['我们已经走到哪一步了？'] : []),
    ],
    stories,
  };
}
