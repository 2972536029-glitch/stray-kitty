import type {AuthRegistration, Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentHistoryResponse, Session} from '../../contracts';
export interface GameApiPort {
  createSession(): Promise<Session>;
  load(): Promise<GameState>;
  execute(request: CommandRequest, idempotencyKey: string): Promise<CommandResponse>;
  catalog(): Promise<Catalog>;
  // 模拟支付网关:充值(4242 必成功/0000 必失败)与流水查询。
  charge(playerId: string, packId: string, cardNumber: string): Promise<ChargeResponse>;
  paymentHistory(playerId: string): Promise<PaymentHistoryResponse>;
  // 账号:注册绑定当前匿名进度;登录换取账号存档的新会话。
  registerAccount(username: string, password: string): Promise<AuthRegistration>;
  loginAccount(username: string, password: string): Promise<Session>;
  // 登录成功后把本地会话切换为返回的会话(写 localStorage 并替换内部令牌)。
  adoptSession(session: Session): void;
}
export interface TokenStore {read(): Session | null; write(session: Session): void; clear(): void}
