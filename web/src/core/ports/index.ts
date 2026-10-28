import type {Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentHistoryResponse, Session} from '../../contracts';
export interface GameApiPort {
  createSession(): Promise<Session>;
  load(): Promise<GameState>;
  execute(request: CommandRequest, idempotencyKey: string): Promise<CommandResponse>;
  catalog(): Promise<Catalog>;
  // 模拟支付网关:充值(4242 必成功/0000 必失败)与流水查询。
  charge(playerId: string, packId: string, cardNumber: string): Promise<ChargeResponse>;
  paymentHistory(playerId: string): Promise<PaymentHistoryResponse>;
}
export interface TokenStore {read(): Session | null; write(session: Session): void; clear(): void}
