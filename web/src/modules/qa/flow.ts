import type {Catalog, GameCommand, GameState} from '../../contracts';
import {simulateVictoryCommand} from '../battle/qa';

export const QA_CHAPTERS = [
  {id: 'prologue', label: '序章', title: '金枪鱼事件', route: '开场对白 → 六波教学 → 雨巷入口'},
  {id: 'alley', label: '第一章', title: '陌生小巷', route: '遇见团子 → 探索与纸箱事件 → 营救点点 → 寻猫启事 → 花房'},
  {id: 'market', label: '第二章', title: '午夜集市', route: '集市剧情 → 三层探索 → 两条情报 → 北街守护 → 北侧出口'},
  {id: 'greenhouse', label: '第三章', title: '废弃花房', route: '墨墨登场 → 伙伴分工 → 家园修缮与摆放；花房战斗为独立试玩'},
  {id: 'rescue', label: '第四章', title: '消失的猫咪们', route: '暗道探索 → 假猫叫诱饵 → 第三泄洪阀 → 出口守护 → 护送回家'},
  {id: 'finale', label: '终章', title: '点亮流浪猫王国', route: '线索分支 → 终章叙事 → 庆典与告别；总仓库战斗为独立试玩'},
] as const;
export const QA_PHASE_LABELS: Record<GameState['phase'], string> = {
  dialogue: '剧情', explore: '探索', event: '事件判定', preparation: '战斗准备', battle: '战斗', settlement: '战斗结算', home: '家园',
};
export interface QACurrentAction {id: string; label: string; command?: GameCommand; skip?: boolean; reason?: string}

// Normal-flow controls stay scoped to their real phase. Cross-chapter testing
// uses QA_CHECKPOINT, whose prerequisites are prepared only by the server.
export function qaCurrentActions(state: GameState, catalog: Catalog, enabled: boolean): QACurrentAction[] {
  const actions: QACurrentAction[] = [];
  if (state.phase === 'dialogue' && state.storyNodeId) {
    actions.push({id: 'qa-next-story', label: '继续一句剧情', command: {type: 'ADVANCE_STORY', nodeId: state.storyNodeId}});
    actions.push({id: 'qa-skip-story', label: '跳过当前段对白', skip: true});
  }
  if (state.phase === 'explore' && state.mapId === 'alley' && !state.flags.includes('alley_rescued') && !state.drawnEvents?.includes('node:crate_event')) {
    actions.push({id: 'dev-trigger-crate', label: '触发纸箱事件', command: {type: 'INTERACT', interactionId: 'alley_crate'}});
  }
  if (state.phase === 'explore' && state.mapId === 'alley' && state.flags.includes('alley_rescued') && !state.flags.includes('lost_poster_found')) {
    actions.push({id: 'qa-inspect-poster', label: '调查墙上的寻猫启事', command: {type: 'INTERACT', interactionId: 'alley_poster'}});
  }
  if (state.phase === 'preparation') {
    const stage = state.activeBattle?.stageId ?? state.lastResult.stageId ?? (state.mapId === 'alley' ? 'alley_rescue' : '');
    if (stage && catalog.stages.some(s => s.id === stage)) actions.push({id: 'qa-enter-battle', label: '进入当前战斗', command: {type: 'START_BATTLE', stageId: stage}});
  }
  if (state.phase === 'battle' && state.activeBattle) {
    const command = simulateVictoryCommand(state.activeBattle, catalog.stages.map(s => s.id));
    if (command) {
      const reason = enabled ? undefined : '服务端未启用战斗模拟';
      actions.push({id: 'qa-simulate-victory', label: '模拟胜利并结算', command, reason});
      actions.push({id: 'qa-simulate-defeat', label: '模拟失败并结算', command: {type: 'QA_SIMULATE_DEFEAT', attemptId: state.activeBattle.id}, reason});
    }
  }
  if (state.phase === 'settlement') actions.push({id: 'qa-continue', label: state.lastResult.outcome === 'lost' ? '进入重试准备' : '继续结算后的流程', command: {type: 'CONTINUE'}});
  return actions;
}
