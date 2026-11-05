import type {GameState} from '../../contracts';
import {knownHomeStorySummaries} from './home-presentation';

/** Offline story answers share the panel's authored facts and visibility gates.
 * A topic match is only a request to look up a fact; it never unlocks that fact. */
export function getHomeStoryAnswer(state: GameState, question: string): {title: string; text: string} | null {
  if (state.phase !== 'home') return null;
  const requested: string[] = [];
  if (/墨墨/.test(question) && /加入|动机|为什么|为何|经历|过去|以前|故事|来历|回顾/.test(question)) requested.push('momo-joined');
  if (/集市/.test(question) && /回到|回的|回来|回家|回花房|经过/.test(question) &&
    /已经|之前|当时|怎么.*回|回的|回顾|故事|经过/.test(question)) requested.push('market-return');
  if (/暗道|地下通道/.test(question) && /救援|获救|救回|救出|安顿/.test(question) &&
    !/路线|怎么走|往哪|能去|可以去|怎么去|如何去/.test(question)) requested.push('tunnel-rescue');
  if (/王国|主人|重逢|结局/.test(question) && /落成|重逢|回来|回顾|发生|后来|怎么样|经历|故事|剧情|为什么|怎么|结局/.test(question)) requested.push('kingdom');
  if (/花房|家园/.test(question) && /为什么|为何|来到|来历|成为|成了|变成|安顿/.test(question) &&
    !/守|保卫|防线|修|装修|地下|第四/.test(question) && !requested.length) requested.push('shelter');
  const overview = /我们已经走到哪一步|回顾|(?:已知|以前|之前|前面|已发生).*(?:剧情|故事|经历)|(?:旅程|故事|剧情).*(?:总结|经历)|经历过什么|发生过什么/.test(question);
  if (!requested.length && !overview) return null;

  const known = knownHomeStorySummaries(state);
  const selected = requested.length ? known.filter(note => requested.includes(note.id)) : known;
  if (!selected.length) return {title: '已知故事的范围', text: '当前记录不足以确认这段经历。可以聊聊眼下已经公开的内容；没有记录的旧对白和选择，我无法准确回顾。'};
  const incomplete = requested.some(id => !selected.some(note => note.id === id));
  return {title: '已知的旅程片段', text: `目前能核实的片段是：${selected.map(note => note.text).join('')}${incomplete ? '其余所问经历目前没有足够记录确认。' : ''}这些只是已确认的短摘要，不是完整对白或全部选择记录；更深的动机和未记录的细节无法据此确认。`};
}
