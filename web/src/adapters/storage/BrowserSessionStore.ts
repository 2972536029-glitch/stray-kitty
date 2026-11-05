import type {CommandRequest, Session} from '../../contracts';
import type {TokenStore} from '../../core/ports';
export interface PendingCommand {playerId: string; key: string; request: CommandRequest}
const SESSION_KEY = 'stray-kitty.session.v1';
const ACCOUNT_KEY = 'stray-kitty.account.v1';
const PENDING_KEY = 'stray-kitty.pending.v1';
const UNAVAILABLE_SESSIONS_KEY = 'stray-kitty.unavailable-sessions.v1';
export interface UnavailableSession {session: Session; pending: PendingCommand | null; archivedAt: string}
// 这里只保存浏览器会话与待确认请求，长期游戏进度仍由服务端持久化。
export class BrowserSessionStore implements TokenStore {
  read(): Session | null {try {return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');} catch {return null;}}
  write(session: Session) {localStorage.setItem(SESSION_KEY, JSON.stringify(session));}
  clear() {localStorage.removeItem(SESSION_KEY);localStorage.removeItem(PENDING_KEY);localStorage.removeItem(ACCOUNT_KEY);}
  rememberAccount(playerId:string,username:string) {localStorage.setItem(ACCOUNT_KEY,JSON.stringify({playerId,username}));}
  accountName(playerId:string|undefined):string|null {
    try {const account=JSON.parse(localStorage.getItem(ACCOUNT_KEY)??'null');return account?.playerId===playerId&&typeof account?.username==='string'?account.username:null;} catch {return null;}
  }
  pending(playerId: string | undefined): PendingCommand | null {
    try {const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingCommand | null;return pending?.playerId === playerId ? pending : null;} catch {return null;}
  }
  savePending(pending: PendingCommand) {localStorage.setItem(PENDING_KEY, JSON.stringify(pending));}
  clearPending() {localStorage.removeItem(PENDING_KEY);}
  archiveUnavailableSession() {
    const session = this.read();
    if (session) {
      const pending = this.pending(session.playerId);
      let archives: UnavailableSession[] = [];
      try {archives = JSON.parse(localStorage.getItem(UNAVAILABLE_SESSIONS_KEY) ?? '[]') as UnavailableSession[];} catch { /* replace a malformed archive below */ }
      archives.unshift({session, pending, archivedAt: new Date().toISOString()});
      localStorage.setItem(UNAVAILABLE_SESSIONS_KEY, JSON.stringify(archives.slice(0, 5)));
    }
    this.clear();
  }
}
