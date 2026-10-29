import type {ApiErrorBody, AuthRegistration, Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentHistoryResponse, Session, QATools} from '../../contracts';
import type {GameApiPort} from '../../core/ports';
import {runtime} from '../../config/runtime';
import {BrowserSessionStore} from '../storage/BrowserSessionStore';
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {super(message);}
}
export class HttpGameApi implements GameApiPort {
  private session: Session | null;
  constructor(private cache = new BrowserSessionStore()) {this.session = cache.read();}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response=await fetch(runtime.apiBase+path,{signal:AbortSignal.timeout(15000),...init,headers:{...(this.session?{Authorization:'Bearer '+this.session.token}:{}),...init.headers}});
    if(!response.ok){const body=await response.json() as ApiErrorBody;throw new ApiError(body.error.code,body.error.message,response.status);}
    return response.json() as Promise<T>;
  }
  // 支付网关挂在 /api/payment 下,不在 /api/v1 前缀里;沿用同一错误结构与超时。
  async paymentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response=await fetch(runtime.paymentBase+path,{signal:AbortSignal.timeout(15000),...init,headers:{'Content-Type':'application/json',...init.headers}});
    if(!response.ok){const body=await response.json() as ApiErrorBody;throw new ApiError(body.error.code,body.error.message,response.status);}
    return response.json() as Promise<T>;
  }
  charge(playerId: string, packId: string, cardNumber: string) {
    return this.paymentRequest<ChargeResponse>('/charge',{method:'POST',body:JSON.stringify({playerId,packId,cardNumber})});
  }
  paymentHistory(playerId: string) {
    return this.paymentRequest<PaymentHistoryResponse>(`/history?playerId=${encodeURIComponent(playerId)}`);
  }
  // 账号端点挂在 /api/auth 下,注册沿用当前匿名令牌(Authorization 由 request 自动带)。
  async authRequest<T>(path: string, body: unknown): Promise<T> {
    const response=await fetch(runtime.authBase+path,{signal:AbortSignal.timeout(15000),method:'POST',headers:{'Content-Type':'application/json',...(this.session?{Authorization:'Bearer '+this.session.token}:{})},body:JSON.stringify(body)});
    if(!response.ok){const err=await response.json() as ApiErrorBody;throw new ApiError(err.error.code,err.error.message,response.status);}
    return response.json() as Promise<T>;
  }
  registerAccount(username: string, password: string) {
    return this.authRequest<AuthRegistration>('/register',{username,password});
  }
  loginAccount(username: string, password: string) {
    return this.authRequest<Session>('/login',{username,password});
  }
  adoptSession(session: Session) {this.session=session;this.cache.write(session);}
  async createSession() {
    this.session=await this.request<Session>('/sessions',{method:'POST'});
    this.cache.write(this.session);return this.session;
  }
  async initialize() {
    if(this.session) {
      // 服务端已不认识本地令牌(存档重置/换数据目录)时,自动重建匿名会话而不是卡死在"重新连接"。
      try {await this.load();} catch(error) {
        if(error instanceof ApiError&&error.status===401) {this.cache.clear();this.session=null;}
        else throw error;
      }
    }
    if(!this.session) await this.createSession();
    const pending=this.pending();
    if(pending) await this.execute(pending.request,pending.key);
    return this.load();
  }
  async startNewJourney() {
    this.cache.archiveUnavailableSession();
    this.session=null;
    await this.createSession();
    return this.load();
  }
  load() {return this.request<GameState>('/state');}
  catalog() {return this.request<Catalog>('/content');}
  async qaTools() {
    try {return await this.request<QATools>('/qa');}
    catch (error) {
      if (error instanceof SyntaxError || (error instanceof ApiError && error.status === 404)) throw new Error('当前游戏服务尚未提供流程验收接口，请同步部署游戏服务与前端。');
      throw error;
    }
  }
  pending() {return this.cache.pending(this.session?.playerId);}
  // 支付网关按 playerId 寻账,不认 Bearer 令牌;给充值弹窗取当前会话的玩家 ID。
  playerId() {return this.session?.playerId ?? '';}
  async execute(request: CommandRequest, key: string): Promise<CommandResponse> {
    if(!this.session) throw new Error('请先开始旅程');
    const existing=this.pending();
    if(existing&&existing.key!==key) throw new Error('上次操作尚未确认，请先重试。');
    this.cache.savePending({playerId:this.session.playerId,key,request});
    try {
      const response=await this.request<CommandResponse>('/commands',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(request)});
      this.cache.clearPending();return response;
    } catch(error) {
      // 4xx 表示明确拒绝；网络或 5xx 结果未知，保留同一个请求和幂等键。
      if(error instanceof ApiError&&error.status<500&&error.code!=='UNAUTHORIZED') this.cache.clearPending();
      throw error;
    }
  }
}
