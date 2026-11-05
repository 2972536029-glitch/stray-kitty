import type {ButtonHTMLAttributes, ReactNode} from 'react';

// 首页主菜单的统一按钮:三个按钮共用同一结构(24x24 图标 + 主标题 + 副标题),
// 几何(长宽、圆角、投影、切角)全部由 .start-actions .game-button 控制,
// 变体类(start-play / start-shop / start-reset)只负责配色,避免样式漂移。
const ICONS: Record<'play' | 'shop' | 'reset' | 'account', ReactNode> = {
  account: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4.9v14.2c0 .9 1 1.5 1.8 1L20.5 13c.8-.5.8-1.6 0-2.1L9.8 3.9C9 3.4 8 4 8 4.9z"/></svg>,
  shop: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12 3 3.6 9.8v11h16.8v-11L12 3zm-1.8 10h3.6v7h-3.6v-7z"/></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 5v5.5H8"/><path d="M4 15a8.5 8.5 0 1 0 1.8-8.7L2.5 10"/></svg>
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: 'play' | 'shop' | 'reset' | 'account';
  label: string;
  sub?: string;
}

export default function GameButton({icon, label, sub, className = '', ...rest}: Props) {
  return <button type="button" className={`game-button ${className}`} {...rest}>
    <span className="game-button-icon">{ICONS[icon]}</span>
    <span className="game-button-copy"><b>{label}</b>{sub ? <small>{sub}</small> : null}</span>
  </button>;
}
