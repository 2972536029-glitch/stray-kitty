import type {StoryNode} from '../contracts';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import DialogueBubble from './DialogueBubble';
import PixelCat from './PixelCat';
import {useEffect, useRef, useState, type ReactNode} from 'react';

const speakers: Record<string, CatBreed> = {'喵喵': 'miaomiao', '团子': 'tuanzi', '点点': 'diandian', '墨墨': 'momo'};

interface Props {
  node: StoryNode;
  disabled: boolean;
  onNext: () => void;
  eventResult?: ReactNode;
}

export default function DialoguePanel({node, disabled, onNext, eventResult}: Props) {
  const [attitude, setAttitude] = useState<'proud' | 'honest'>('proud');
  const [closing, setClosing] = useState(false);

  let displayText = node.text;
  if (node.id === 'prologue_banter') {
    displayText = attitude === 'honest'
      ? '呜……谁是小少爷！肚子好饿，爪子踩得冰凉凉的……胖橘，你身上有没有藏小鱼干先借本咪垫垫底……'
      : '谁是小少爷！本咪是微服私访的领地巡察官！……咕噜噜（肚子大声抗议）……本咪只是出来视察民情！';
  } else if (node.id === 'prologue_sneak') {
    displayText = attitude === 'honest'
      ? '咕噜噜……好香啊，本咪的口水已经止不住了！不行，就尝一口，就去吃一口好不好嘛！'
      : '咕噜噜……本咪的小肚子突然有了强烈的想法。本咪只是身为领地之王，顺便下楼巡视两分钟。只尝一口，一口就回来，肯定不会迷路！';
  }

  // Typewriter text stays decorative: clicking the card always advances one node.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!displayText) return;
    const timer = window.setInterval(() => setShown(count => {
      if (count >= displayText.length) {window.clearInterval(timer); return count;}
      return count + 1;
    }), 18);
    return () => window.clearInterval(timer);
  }, [displayText]);
  const typing = shown < displayText.length;

  const advancing = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!disabled) {advancing.current = false;setClosing(false);}
  }, [node.id, disabled]);
  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  // Both the full-card click and skip advance exactly one story node.
  const advance = () => {
    if (disabled || closing || advancing.current) return;
    advancing.current = true;
    setShown(displayText.length);
    if (node.next) {onNext();return;}
    setClosing(true);
    exitTimer.current = window.setTimeout(onNext, 240);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || document.querySelector('.prologue-overlay,.dice-ceremony,dialog[open]') || target?.closest('dialog,input,select,textarea,button,a,[contenteditable=true]')) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();advanceRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const hasChoices = node.id === 'prologue_banter' || node.id === 'prologue_sneak';

  return <>
    {node.scene === 'poster' && <aside className="lost-poster" aria-label="寻猫启事"><b>寻猫启事</b><PixelCat size={100}/><strong>它叫喵喵。</strong><span>家里的蓝色饭碗，一直在等它。</span></aside>}
    <DialogueBubble
      speaker={node.speaker}
      breed={speakers[node.speaker]}
      closing={closing}
      disabled={disabled}
      onAdvance={advance}
      onSkip={advance}
    >
      {hasChoices && (
        <div className="attitude-toggle" role="group" aria-label="猫咪态度">
          <button
            type="button"
            className={`attitude-btn ${attitude === 'proud' ? 'active' : ''}`}
            onClick={() => setAttitude('proud')}
          >
            😼 傲娇嘴硬
          </button>
          <button
            type="button"
            className={`attitude-btn ${attitude === 'honest' ? 'active' : ''}`}
            onClick={() => setAttitude('honest')}
          >
            😿 诚实撒娇
          </button>
        </div>
      )}
      {eventResult}
      <p key={node.id + attitude}>{displayText.slice(0, shown)}{typing && <i className="dialogue-caret" aria-hidden="true"/>}</p>
    </DialogueBubble>
  </>;
}
