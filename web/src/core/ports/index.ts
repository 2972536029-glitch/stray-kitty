import type {Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentConfig, PaymentHistoryResponse, PaymentSessionResponse, Session} from '../../contracts';
export interface GameApiPort {
  createSession(): Promise<Session>;
  load(): Promise<GameState>;
  execute(request: CommandRequest, idempotencyKey: string): Promise<CommandResponse>;
  catalog(): Promise<Catalog>;
  // 支付网关:mock=演示卡号直付;xsolla=跳转沙盒收银台(配置/会话/流水)。
  charge(playerId: string, packId: string, cardNumber: string): Promise<ChargeResponse>;
  paymentHistory(playerId: string): Promise<PaymentHistoryResponse>;
  paymentConfig(): Promise<PaymentConfig>;
  paymentSession(playerId: string, packId: string): Promise<PaymentSessionResponse>;
}
export interface TokenStore {read(): Session | null; write(session: Session): void; clear(): void}
