import type {CommandRequest, Session} from '../../contracts';
import type {TokenStore} from '../../core/ports';
export interface PendingCommand {playerId: string; key: string; request: CommandRequest}
const SESSION_KEY = 'stray-kitty.session.v1';
const PENDING_KEY = 'stray-kitty.pending.v1';
// 这里只保存浏览器会话与待确认请求，长期游戏进度仍由服务端持久化。
export class BrowserSessionStore implements TokenStore {
  read(): Session | null {try {return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');} catch {return null;}}
  write(session: Session) {localStorage.setItem(SESSION_KEY, JSON.stringify(session));}
  clear() {localStorage.removeItem(SESSION_KEY);localStorage.removeItem(PENDING_KEY);}
  pending(playerId: string | undefined): PendingCommand | null {
    try {const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingCommand | null;return pending?.playerId === playerId ? pending : null;} catch {return null;}
  }
  savePending(pending: PendingCommand) {localStorage.setItem(PENDING_KEY, JSON.stringify(pending));}
  clearPending() {localStorage.removeItem(PENDING_KEY);}
}
