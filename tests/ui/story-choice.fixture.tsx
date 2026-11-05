import {createRoot} from 'react-dom/client';
import DialoguePanel from '../../web/src/ui/DialoguePanel';
import type {StoryNode} from '../../web/src/contracts';

const root = createRoot(document.getElementById('root')!);
const calls: Array<{optionId?: 'proud'|'honest'}> = [];
Object.assign(window, {storyChoice: {
  calls,
  render(id: string, disabled = false) {
    const node = {id, chapterId:'prologue', speaker:'旁白', text:'选择一句台词', next:'next'} as StoryNode;
    root.render(<DialoguePanel node={node} disabled={disabled} onNext={optionId => calls.push({optionId})}/>);
  },
}});
