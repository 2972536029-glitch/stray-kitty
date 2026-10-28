import type {ApiErrorBody, Catalog, ChargeResponse, CommandRequest, CommandResponse, GameState, PaymentHistoryResponse, Session} from '../../contracts';
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
  async createSession() {
    this.session=await this.request<Session>('/sessions',{method:'POST'});
    this.cache.write(this.session);return this.session;
  }
  async initialize() {
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
