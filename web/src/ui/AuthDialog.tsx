import {useState} from 'react';
import type {GameApiPort} from '../core/ports';
import Modal from './Modal';

// 小猫账号:注册把当前旅程绑定到用户名密码(进度原样保留),登录在任意设备取回。
// 游客玩法不受影响——不注册也照常玩,账号只解决"换设备找回归档"。
export default function AuthDialog({mode: initialMode, hasProgress, api, onLoggedIn, onClose}: {
  mode: 'register' | 'login'; hasProgress: boolean; api: GameApiPort;
  onLoggedIn: () => Promise<void> | void; onClose: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const submit = async () => {
    if (busy) return;
    setError('');
    if (username.trim().length < 3 || username.trim().length > 24) {setError('用户名要 3~24 个字符，且不含空格。');return;}
    if (password.length < 8 || password.length > 64) {setError('密码要 8~64 个字符。');return;}
    if (mode === 'register' && password !== confirm) {setError('两次输入的密码不一致。');return;}
    setBusy(true);
    try {
      if (mode === 'register') {
        const result = await api.registerAccount(username.trim(), password);
        setDone(`账号「${result.username}」已保存这段旅程——换电脑或清缓存后，用登录就能找回。`);
      } else {
        const session = await api.loginAccount(username.trim(), password);
        api.adoptSession(session);
        await onLoggedIn();
        setDone('欢迎回来！旅程进度已取回。');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '出了点小问题，请再试一次。');
    } finally {setBusy(false);}
  };

  return <Modal onClose={onClose} title={done ? '小猫账号' : mode === 'register' ? '把旅程存进账号' : '登录取回旅程'}>
    {done ? <div className="auth-done">
      <p>{done}</p>
      <button className="primary-action-btn" onClick={onClose}>好的</button>
    </div> : <form className="auth-form" onSubmit={e=>{e.preventDefault();void submit();}}>
      <header><span className="eyebrow">A JOURNEY TO KEEP</span><h2>{mode === 'register' ? '把旅程存进账号' : '登录取回旅程'}</h2></header>
      {mode === 'register' && hasProgress && <p className="muted">注册不会打断旅程——当前的进度会原样绑定到账号。</p>}
      {mode === 'register' && !hasProgress && <p className="muted">先开始旅程再来注册，账号保存的是进行中的进度。</p>}
      {mode === 'login' && <p className="muted">在任何设备登录，都能取回绑定的旅程进度。</p>}
      <label className="select-label">用户名<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="3~24 个字符" disabled={busy}/></label>
      <label className="select-label">密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="至少 8 位" disabled={busy}/></label>
      {mode === 'register' && <label className="select-label">再输一遍密码<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" disabled={busy}/></label>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="auth-actions">
        <button type="submit" disabled={busy}>{busy ? '稍等…' : mode === 'register' ? '注册并保存进度' : '登录'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => {setMode(mode === 'register' ? 'login' : 'register');setError('');setConfirm('');}}>
          {mode === 'register' ? '已有账号？去登录' : '还没有账号？去注册'}
        </button>
      </div>
    </form>}
  </Modal>;
}
