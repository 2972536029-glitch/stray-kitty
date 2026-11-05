import {useState} from 'react';
import type {GameApiPort} from '../core/ports';
import Modal from './Modal';
import './auth-dialog.css';

export default function AuthDialog({
  mode: initialMode,
  api,
  onLoggedIn,
  onClose,
  successLabel = '进入游戏'
}: {
  mode: 'register' | 'login';
  hasProgress?: boolean;
  api: GameApiPort;
  onLoggedIn: () => Promise<void> | void;
  onClose: () => void;
  successLabel?: string;
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
    if (username.trim().length < 3 || username.trim().length > 24) {
      setError('用户名需为 3~24 个字符，且不含空格');
      return;
    }
    if (password.length < 8 || password.length > 64) {
      setError('密码需为 8~64 个字符');
      return;
    }
    if (mode === 'register' && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const result = await api.registerAccount(username.trim(), password);
        await onLoggedIn();
        setDone(`账号「${result.username}」注册成功，已绑定当前进度！`);
      } else {
        const session = await api.loginAccount(username.trim(), password);
        api.adoptSession(session);
        await onLoggedIn();
        setDone('欢迎回来！旅程进度已同步。');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '出了点小问题，请再试一次。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={done ? '账号通知' : mode === 'register' ? '注册账号' : '账号登录'}
      className="auth-dialog"
    >
      {done ? (
        <div className="auth-success-card">
          <div className="auth-success-icon" aria-hidden="true">🐾</div>
          <p className="auth-success-msg">{done}</p>
          <button type="button" className="auth-submit-btn" onClick={onClose}>
            {successLabel}
          </button>
        </div>
      ) : (
        <form className="auth-card" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); setConfirm(''); }}
            >
              登 录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); setConfirm(''); }}
            >
              注 册
            </button>
          </div>

          <div className="auth-field">
            <label className="auth-field-label" htmlFor="auth-username">用户名</label>
            <input
              id="auth-username"
              className="auth-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="请输入用户名 (3~24位)"
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label className="auth-field-label" htmlFor="auth-password">密码</label>
            <input
              id="auth-password"
              type="password"
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder="请输入密码 (至少8位)"
              disabled={busy}
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="auth-confirm">确认密码</label>
              <input
                id="auth-confirm"
                type="password"
                className="auth-input"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="请再次输入密码"
                disabled={busy}
              />
            </div>
          )}

          {error && (
            <div className="auth-error-banner" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy ? '正在处理…' : mode === 'register' ? '立即注册' : '立即登录'}
          </button>

          <button
            type="button"
            className="auth-switch-link"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError('');
              setConfirm('');
            }}
          >
            {mode === 'register' ? '已有账号？点击去登录 ›' : '还没有账号？点击去注册 ›'}
          </button>
        </form>
      )}
    </Modal>
  );
}
