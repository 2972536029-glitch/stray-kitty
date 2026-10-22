import type {StoryNode} from '../contracts';
import PixelCat from './PixelCat';
import {useState, type ReactNode} from 'react';

const speakers: Record<string, string> = {'喵喵': 'miaomiao', '团子': 'tuanzi', '点点': 'diandian', '墨墨': 'momo'};

export default function DialoguePanel({node, disabled, onNext, eventResult}: {node: StoryNode; disabled: boolean; onNext: () => void; eventResult?: ReactNode}) {
  const [attitude, setAttitude] = useState<'proud' | 'honest'>('proud');

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

  const hasChoices = node.id === 'prologue_banter' || node.id === 'prologue_sneak';

  return <>
    {node.scene === 'poster' && <aside className="lost-poster" aria-label="寻猫启事"><b>寻猫启事</b><PixelCat size={100}/><strong>它叫喵喵。</strong><span>家里的蓝色饭碗，一直在等它。</span></aside>}
    <section className="dialogue-card">
      <div className="dialogue-portrait">
        <PixelCat breed={speakers[node.speaker]} size={68} mood={hasChoices && attitude === 'honest' ? 'worried' : undefined}/>
      </div>
      <div className="dialogue-copy">
        <div className="speaker-row">
          <span className="speaker">{node.speaker}</span>
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
        </div>
        {eventResult}
        <p key={node.id + attitude}>{displayText}</p>
        <button disabled={disabled} onClick={onNext}>继续故事 <span aria-hidden="true">→</span></button>
      </div>
    </section>
  </>;
}
