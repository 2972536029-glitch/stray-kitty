import type {StoryNode} from '../contracts';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import DialogueBubble, {type SceneAnchor} from './DialogueBubble';
import PixelCat from './PixelCat';
import {useEffect, useRef, useState, type ReactNode} from 'react';

const speakers: Record<string, CatBreed> = {'喵喵': 'miaomiao', '团子': 'tuanzi', '点点': 'diandian', '墨墨': 'momo'};

interface Props {
  node: StoryNode;
  disabled: boolean;
  onNext: () => void;
  onSkip?: () => void;
  eventResult?: ReactNode;
  /** 询问场景：说话者是否在画面里、头顶在哪（不在场则走旁白字幕条）。 */
  getSpeakerAnchor?: (breed: CatBreed) => SceneAnchor | null;
}

export default function DialoguePanel({node, disabled, onNext, onSkip, eventResult, getSpeakerAnchor}: Props) {
  const [attitude, setAttitude] = useState<'proud' | 'honest'>('proud');
  const [closing, setClosing] = useState(false);

  // 空格/回车推进对话（main 新增）；焦点在表单控件或对话框内时不抢键。
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (disabled || target?.closest('dialog') || target?.matches('input,select,textarea,button') || target?.isContentEditable) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!disabled) onNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [disabled, onNext]);

  let displayText = node.text;
  if (node.id === 'prologue_banter') {
    displayText = attitude === 'honest'
      ? '“呜……谁是小少爷！肚子好饿，爪子踩得冰凉凉的……胖橘，你身上有没有藏小鱼干先借本咪垫垫底……”'
      : '“谁是小少爷！本咪是微服私访的领地巡察官！……咕噜噜（肚子大声抗议）……本咪只是出来视察民情！”';
  } else if (node.id === 'prologue_sneak') {
    displayText = attitude === 'honest'
      ? '“咕噜噜……好香啊，本咪的口水已经止不住了！不行，就尝一口，就去吃一口好不好嘛！”'
      : '“咕噜噜……本咪的小肚子突然有了强烈的想法。本咪只是身为领地之王，顺便下楼巡视两分钟。只尝一口，一口就回来，肯定不会迷路！”';
  }

  // 打字机：逐字浮出台词；点击/键盘会立刻补全（e2e 依赖“每次点击必发命令”，不能吞点击）。
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

  // 出口节点（next 为空）或跳过剧情：先播放 240ms 淡出再真正推进，让气泡“缩放消失”。
  const advance = () => {
    if (disabled || closing) return;
    setShown(displayText.length);
    if (node.next) {onNext(); return;}
    setClosing(true);
    window.setTimeout(onNext, 240);
  };
  const skip = () => {
    if (disabled || closing || !onSkip) return;
    setClosing(true);
    window.setTimeout(onSkip, 240);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches('input,select,textarea') || target?.isContentEditable) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advanceRef.current();
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
      getAnchor={getSpeakerAnchor}
      avoid={['.lost-poster']}
      refreshKey={`${node.id}:${attitude}`}
      closing={closing}
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
      <div className="dialogue-actions">
        {onSkip && (
          <button type="button" className="skip-button" disabled={disabled || closing} onClick={skip} title="快速推进当前对话至出口（Space/Enter也可快速阅读）">
            ⏩ 跳过剧情
          </button>
        )}
        <button disabled={disabled || closing} onClick={advance} title="点击或按空格/回车继续">
          {node.id === 'rescue_intro_10' ? '返回花房，准备前往仓库' : '继续故事'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </DialogueBubble>
  </>;
}
