import type {ReactNode} from 'react';
import './game-icons.css';

export type GameIconName='manual'|'journal'|'post'|'supply'|'map'|'decorate'|'settings'|'acceptance'|'confirm'|'cancel'|'store';

const drawings:Record<GameIconName,ReactNode>={
  manual:<><path d="M12 6C9.4 4.4 6.2 4 3 4.8v14c3.2-.8 6.4-.4 9 1.2 2.6-1.6 5.8-2 9-1.2v-14c-3.2-.8-6.4-.4-9 1.2Z"/><path d="M12 6v14M6 9c1.1-.1 2.2.1 3.2.5M15 9.5c1-.4 2.1-.6 3.2-.5"/></>,
  journal:<><path d="M6.5 3H20v18H6.5a2.5 2.5 0 0 1 0-5H20M4 18.5v-13A2.5 2.5 0 0 1 6.5 3"/><path d="M13 3v8l2.5-1.8L18 11V3M8 7.5h2"/></>,
  post:<><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7M3.5 18l5.5-5M20.5 18 15 13"/></>,
  supply:<><path d="M5 8.5h14l1 12H4l1-12ZM8 8.5V6a4 4 0 0 1 8 0v2.5M12 12v5M9.5 14.5h5"/></>,
  map:<><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16"/><path d="m5.5 10 1 1M17.5 12l1 1"/></>,
  decorate:<><path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4M6 16h12M6 19v2M18 19v2"/><path d="M6 15v-3a2 2 0 0 0-4 0v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v3"/></>,
  settings:<><path d="m9.5 3-.6 2.4-2 .9-2.2-.7-2.4 4.2L4 11.5v2l-1.7 1.7 2.4 4.2 2.2-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.2.7 2.4-4.2-1.7-1.7v-2l1.7-1.7-2.4-4.2-2.2.7-2-.9L14.5 3h-5Z"/><circle cx="12" cy="12.5" r="3.2"/></>,
  acceptance:<><path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 18 4.5h-3"/><rect x="9" y="2.5" width="6" height="4" rx="1"/><path d="m8 13 2.5 2.5L16 10"/></>,
  confirm:<path d="m5 12 4.5 4.5L19 7"/>,
  cancel:<path d="m6 6 12 12M18 6 6 18"/>,
  store:<><path d="M4 12.5V20h16v-7.5M4 12.5h4l2 3h4l2-3h4M12 3v8m-3-3 3 3 3-3"/></>,
};

/** Shared 24-unit drawings keep stroke weight and alignment consistent. */
export default function GameIcon({name}:{name:GameIconName}) {
  return <svg className="game-icon" data-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[name]}</svg>;
}
