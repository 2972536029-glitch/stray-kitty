import type {StoryNode} from '../contracts';
import {hasStoryChoice} from '../core/story';
import type {CatAppearance} from '../adapters/canvas/pixelCat';
import DialogueBubble from './DialogueBubble';
import PixelCat from './PixelCat';
import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';

type Attitude = 'proud' | 'honest';

function AttitudeChoice({nodeId, disabled, onChoose}: {nodeId: string; disabled: boolean; onChoose: (value: Attitude) => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="story-choice-modal" aria-labelledby="story-choice-title" aria-describedby="story-choice-prompt" onCancel={event => event.preventDefault()}>
    <span className="story-choice-kicker">喵喵的心里话</span>
    <PixelCat breed="miaomiao" size={144}/>
    <h2 id="story-choice-title">这一刻，想怎么回应？</h2>
    <p id="story-choice-prompt">{nodeId === 'prologue_sneak' ? '香气飘了过来，小肚子先动了心……' : '被叫作小少爷，喵喵有点不服气……'}</p>
    <div className="story-choice-options" role="group" aria-label="猫咪态度">
      <button type="button" disabled={disabled} onClick={() => onChoose('proud')}><span aria-hidden="true">😼</span><strong>傲娇嘴硬</strong><small>本咪当然有自己的打算！</small></button>
      <button type="button" disabled={disabled} onClick={() => onChoose('honest')}><span aria-hidden="true">😿</span><strong>诚实撒娇</strong><small>就说出心里真正的想法吧。</small></button>
    </div>
    <small className="story-choice-hint">选择后，继续听喵喵说下去</small>
  </dialog>;
}

const speakers: Record<string, CatAppearance> = {'喵喵': 'miaomiao', '团子': 'tuanzi', '点点': 'diandian', '墨墨': 'momo', '阿策': 'ace', '绒绒': 'rongrong'};

interface Props {
  node: StoryNode;
  disabled: boolean;
  onNext: (optionId?: 'proud' | 'honest') => void;
  onSkip?: (optionId?: 'proud' | 'honest') => void;
  eventResult?: ReactNode;
}

export default function DialoguePanel({node, disabled, onNext, onSkip, eventResult}: Props) {
  const [choice, setChoice] = useState<{nodeId: string; attitude: Attitude} | null>(null);
  const attitude = choice?.nodeId === node.id ? choice.attitude : null;
  const [closing, setClosing] = useState(false);

  const hasChoices = hasStoryChoice(node.id);
  const choosing = hasChoices && !attitude;
  useEffect(() => {
    if (hasChoices && attitude) document.querySelector<HTMLButtonElement>('.dialogue-advance-hit')?.focus({preventScroll:true});
  }, [node.id, hasChoices, attitude]);

  let displayText = choosing ? '' : node.text;
  if (hasChoices && attitude) {
    if (node.id === 'prologue_banter') {
      displayText = attitude === 'honest'
        ? '呜……谁是小少爷！肚子好饿，爪子踩得冰凉凉的……胖橘，你身上有没有藏小鱼干先借本咪垫垫底……'
        : '谁是小少爷！本咪是微服私访的领地巡察官！……咕噜噜（肚子大声抗议）……本咪只是出来视察民情！';
    } else if (node.id === 'prologue_sneak') {
      displayText = attitude === 'honest'
        ? '咕噜噜……好香啊，本咪的口水已经止不住了！不行，就尝一口，就去吃一口好不好嘛！'
        : '咕噜噜……本咪的小肚子突然有了强烈的想法。本咪只是身为领地之王，顺便下楼巡视两分钟。只尝一口，一口就回来，肯定不会迷路！';
    }
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

  // Normal reading advances one line; skip keeps choices and scene boundaries.
  const advance = () => {
    if (disabled || closing || advancing.current || (hasChoices && !attitude)) return;
    advancing.current = true;
    setShown(displayText.length);
    const next = () => onNext(hasChoices ? (attitude ?? undefined) : undefined);
    if (node.next) {next(); return;}
    setClosing(true);
    exitTimer.current = window.setTimeout(next, 240);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || document.querySelector('.prologue-overlay,.dice-ceremony,dialog[open]') || target?.closest('dialog,input,select,textarea,button,a,[contenteditable=true]') || target?.isContentEditable) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();advanceRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return <>
    {node.scene === 'poster' && <aside className="lost-poster" aria-label="寻猫启事"><b>寻猫启事</b><PixelCat size={100}/><strong>它叫喵喵。</strong><span>家里的蓝色饭碗，一直在等它。</span></aside>}
    {choosing ? <AttitudeChoice key={node.id} nodeId={node.id} disabled={disabled} onChoose={value => setChoice({nodeId:node.id, attitude:value})}/> : <DialogueBubble
      speaker={node.speaker}
      breed={speakers[node.speaker]}
      closing={closing}
      disabled={disabled}
      onAdvance={advance}
      onSkip={() => {
        if (!onSkip) {advance();return;}
        if (disabled || closing || advancing.current || choosing) return;
        advancing.current = true;
        onSkip(attitude ?? undefined);
      }}
    >
      {eventResult}
      <p key={node.id + (attitude ?? 'initial')}>{displayText.slice(0, shown)}{typing && <i className="dialogue-caret" aria-hidden="true"/>}</p>
    </DialogueBubble>}
  </>;
}
