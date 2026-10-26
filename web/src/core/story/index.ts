import type {Catalog, GameState} from '../../contracts';
export const currentStory = (catalog: Catalog, state: GameState) => catalog.story.find(n => n.id === state.storyNodeId);
export function objective(state: GameState): string {
  if (state.activeBattle?.stageId === 'greenhouse_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase)) return '六位伙伴沿花房通路守住八波黑影，保护 B1 并击败四格首领，结束试玩后回到家园。';
  if (state.activeBattle?.stageId === 'market_boss' && ['battle', 'preparation', 'settlement'].includes(state.phase)) return '六位伙伴守住八波黑影，击败集市首领，结束试玩后回到家园。';
  if (state.phase === 'battle') return state.activeBattle?.stageId === 'l00_tutorial'
    ? '练习伙伴站位、蓄能与技能配合，守住六波教学防线。'
    : '与绒绒、斑斑、团子和点点守住八波黑影，击败小巷首领。';
  if (state.phase === 'preparation') return '调整伙伴站位与技能安排，守住点点的撤离路线。';
  if (state.chapterId === 'rescue' || state.flags.includes('chapter_4_started')) {
    if (state.phase === 'dialogue') return '随墨墨深入地下暗道，识破陷阱寻找失踪伙伴。';
    return '侦查地下暗道，营救受困的小猫并锁闭黑影通道。';
  }
  if (state.chapterId === 'greenhouse' || state.flags.includes('chapter_3_started')) {
    if (state.phase === 'dialogue') return '聆听墨墨带来的暗影情报与修缮计划。';
    return '与伙伴们共同修缮废弃花房，布置避风要塞防线。';
  }
  if (state.chapterId === 'market' || state.mapId === 'market') {
    if (state.phase === 'dialogue') return '聆听午夜集市的情报与喧嚣。';
    if (state.phase === 'event') return '在集市中与动物交换信息。';
    return '探索午夜集市，向老黑羽或咕咕大盗打听失踪宠物猫的线索。';
  }
  if (state.phase === 'home') return '把获救的伙伴安顿好，让花房多一点家的样子。';
  if (state.cats.includes('diandian')) return '点点已经安全了。回到花房，看看伙伴们吧。';
  return '探索小巷，寻找纸箱里传来的微弱叫声。';
}
