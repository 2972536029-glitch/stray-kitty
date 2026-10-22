export type {BattleContext, BattleResult} from '../../contracts';
import type {BattleContext, BattleResult} from '../../contracts';
export interface BattleModule {start(context: BattleContext, complete: (result: BattleResult) => void): void; pause(paused: boolean): void; stop(): void}
