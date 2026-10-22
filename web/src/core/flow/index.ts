import type {GameCommand, GamePhase} from '../../contracts';
// 这里只声明阶段允许接收哪些命令，业务结果由对应规则处理。
const allowed: Record<GamePhase, readonly GameCommand['type'][]> = {
  dialogue: ['ADVANCE_STORY'], explore: ['INTERACT', 'GO_HOME', 'START_BATTLE'], event: ['CHOOSE_EVENT'],
  preparation: ['START_BATTLE'], battle: ['COMPLETE_BATTLE'], settlement: ['CONTINUE'],
  home: ['GO_EXPLORE', 'DRAW_FURNITURE', 'PLACE_FURNITURE', 'START_BATTLE', 'BUY_FURNITURE']
};
export function canDispatch(phase: GamePhase, command: GameCommand['type']): boolean {
  return allowed[phase].includes(command);
}
