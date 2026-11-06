import type {ReactNode} from 'react';
import type {CatAppearance} from '../adapters/canvas/pixelCat';
import PixelCat from './PixelCat';
import './story-dialogue.css';

/** Kept for scene APIs; story dialogue no longer follows a scene anchor. */
export interface SceneAnchor {x: number; y: number}

interface Props {
  speaker: string;
  breed?: CatAppearance;
  kicker?: string;
  closing?: boolean;
  disabled?: boolean;
  hint?: string;
  onAdvance: () => void;
  onSkip: () => void;
  children: ReactNode;
}

/** Shared bottom dialogue for the opening sequence and every story chapter. */
export default function DialogueBubble({speaker, breed, kicker, closing = false, disabled = false, hint, onAdvance, onSkip, children}: Props) {
  return <section className={`dialogue-bubble dialogue-bubble-caption story-dialogue${breed ? ' dialogue-has-portrait' : ''}${closing ? ' dialogue-bubble-closing' : ''}`} data-speaker={speaker} aria-label="剧情对话">
    <button type="button" className="dialogue-advance-hit" aria-label="继续故事" disabled={disabled || closing} onClick={onAdvance}/>
    {breed && <span className="dialogue-avatar" aria-hidden="true"><PixelCat breed={breed} size={280}/></span>}
    <header className="dialogue-header">
      <div className="dialogue-who" data-main={speaker === '喵喵'}>
        <span className="dialogue-identity">{kicker && <small>{kicker}</small>}<b className="speaker">{speaker}</b></span>
      </div>
      <button type="button" className="skip-button dialogue-skip" disabled={disabled || closing} onClick={onSkip} title="跳到下一个选择、场景或战斗">跳过剧情 <svg viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="m4 3 5 5-5 5m7-10 5 5-5 5" stroke="currentColor" strokeWidth="1.4"/></svg></button>
    </header>
    <div className="dialogue-copy">{children}</div>
    <span className="dialogue-read-hint" aria-hidden="true">{hint ?? '点击任意位置继续'} <i/></span>
  </section>;
}
