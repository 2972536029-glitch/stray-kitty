import type {Catalog, GameState} from '../../contracts';
export const currentStory = (catalog: Catalog, state: GameState) => catalog.story.find(n => n.id === state.storyNodeId);
export function objective(state: GameState): string {
  if (state.phase === 'home') return '把获救的伙伴安顿好，让花房多一点家的样子。';
  if (state.cats.includes('diandian')) return '点点已经安全了。回到花房，看看伙伴们吧。';
  if (state.phase === 'battle') return '布置光源守住三条撤离路线，保护纸箱里的点点。';
  if (state.phase === 'preparation') return '带上找到的物资，为点点照亮安全的路。';
  return '探索小巷，寻找纸箱里传来的微弱叫声。';
}
