import type {Catalog, CommandRequest, CommandResponse, GameState, Session} from '../../contracts';
export interface GameApiPort {
  createSession(): Promise<Session>;
  load(): Promise<GameState>;
  execute(request: CommandRequest, idempotencyKey: string): Promise<CommandResponse>;
  catalog(): Promise<Catalog>;
}
export interface TokenStore {read(): Session | null; write(session: Session): void; clear(): void}
