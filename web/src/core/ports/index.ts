import type {AuthRegistration, Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentConfig, PaymentHistoryResponse, PaymentSessionResponse, Session} from '../../contracts';
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
  // 账号:注册绑定当前匿名进度;登录换取账号存档的新会话。
  registerAccount(username: string, password: string): Promise<AuthRegistration>;
  loginAccount(username: string, password: string): Promise<Session>;
  // 登录成功后把本地会话切换为返回的会话(写 localStorage 并替换内部令牌)。
  adoptSession(session: Session): void;
}
export interface TokenStore {read(): Session | null; write(session: Session): void; clear(): void}
