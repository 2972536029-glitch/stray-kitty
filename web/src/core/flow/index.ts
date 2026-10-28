import type {GameCommand, GamePhase} from '../../contracts';
// 这里只声明阶段允许接收哪些命令，业务结果由对应规则处理。
const allowed: Record<GamePhase, readonly GameCommand['type'][]> = {
  dialogue: ['ADVANCE_STORY', 'START_STORY', 'GO_EXPLORE', 'GO_HOME'],
  explore: ['INTERACT', 'REPORT_MOVE', 'CHECK_RANDOM_ZONE', 'GO_HOME', 'START_BATTLE', 'GO_EXPLORE', 'START_STORY'],
  event: ['CHOOSE_EVENT'],
  preparation: ['START_BATTLE', 'GO_EXPLORE', 'GO_HOME', 'START_STORY'],
  battle: ['COMPLETE_BATTLE', 'QA_SIMULATE_VICTORY'],
  settlement: ['CONTINUE', 'START_BATTLE', 'START_STORY', 'GO_EXPLORE', 'GO_HOME'],
  home: ['GO_EXPLORE', 'DRAW_FURNITURE', 'PLACE_FURNITURE', 'START_BATTLE', 'BUY_FURNITURE', 'START_STORY']
};
export function canDispatch(phase: GamePhase, command: GameCommand['type']): boolean {
  return allowed[phase].includes(command);
}
