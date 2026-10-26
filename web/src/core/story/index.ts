import type {Catalog, GameState} from '../../contracts';
export const currentStory = (catalog: Catalog, state: GameState) => catalog.story.find(n => n.id === state.storyNodeId);
export function objective(state: GameState): string {
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
  if (state.phase === 'battle') return '布置光源守住三条撤离路线，保护纸箱里的点点。';
  if (state.phase === 'preparation') return '带上找到的物资，为点点照亮安全的路。';
  return '探索小巷，寻找纸箱里传来的微弱叫声。';
}
