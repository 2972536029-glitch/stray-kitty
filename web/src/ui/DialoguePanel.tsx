import type {StoryNode} from '../contracts';
import PixelCat from './PixelCat';
import type {ReactNode} from 'react';

const speakers: Record<string, string> = {'喵喵': 'miaomiao', '团子': 'tuanzi', '点点': 'diandian', '墨墨': 'momo'};
export default function DialoguePanel({node, disabled, onNext, eventResult}: {node: StoryNode; disabled: boolean; onNext: () => void; eventResult?: ReactNode}) {
  return <>
    {node.scene === 'poster' && <aside className="lost-poster" aria-label="寻猫启事"><b>寻猫启事</b><PixelCat size={100}/><strong>它叫喵喵。</strong><span>家里的蓝色饭碗，一直在等它。</span></aside>}
    <section className="dialogue-card"><div className="dialogue-portrait"><PixelCat breed={speakers[node.speaker]} size={68}/></div><div className="dialogue-copy"><span className="speaker">{node.speaker}</span>{eventResult}<p key={node.id}>{node.text}</p><button disabled={disabled} onClick={onNext}>继续故事 <span aria-hidden="true">→</span></button></div></section>
  </>;
}
