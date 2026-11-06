import type {Catalog, GameCommand} from '../contracts';
import {currentStory, hasStoryChoice} from '../core/story';
import type {GameApiPort} from '../core/ports';
import {canDispatch} from '../core/flow';
import {GameStore} from '../core/state';
// 幂等键 UUID：crypto.randomUUID 仅在安全上下文(HTTPS/localhost)可用，公网裸 HTTP 部署下不存在，
// 改用 getRandomValues(非安全上下文也可用)实现 v4；极端环境下退化为 Math.random。
function requestId(): string {
  const bytes=new Uint8Array(16);
  if(typeof crypto!=='undefined'&&crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for(let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=bytes[6]&0x0f|0x40;bytes[8]=bytes[8]&0x3f|0x80;
  const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export class GameController {
  private busy=false;
  constructor(readonly port: GameApiPort, readonly store: GameStore) {}
  async skipDialogue(catalog: Catalog, optionId?: 'proud' | 'honest') {
    const initial = this.store.getSnapshot();
    if (!initial || initial.phase !== 'dialogue') return;
    const scene = currentStory(catalog, initial)?.scene;
    const visited = new Set<string>();
    while (true) {
      const state = this.store.getSnapshot();
      if (!state || state.phase !== 'dialogue' || state.chapterId !== initial.chapterId || state.mapId !== initial.mapId) return;
      const node = currentStory(catalog, state);
      if (!node || node.scene !== scene) return;
      const attitude = state.storyNodeId === initial.storyNodeId ? optionId : undefined;
      if (hasStoryChoice(node.id) && !attitude) return;
      if (visited.has(node.id)) throw new Error('剧情暂时无法继续，请重试。');
      visited.add(node.id);
      await this.dispatch({type:'ADVANCE_STORY', nodeId:node.id, ...(attitude ? {optionId:attitude} : {})});
    }
  }
  async dispatch(command: GameCommand) {
    const state=this.store.getSnapshot();
    if(this.busy||!state) throw new Error('请等待当前操作完成');
    if(!canDispatch(state.phase,command.type)) throw new Error('当前阶段不能执行此操作');
    this.busy=true;
    try {
      const result=await this.port.execute({expectedRevision:state.revision,command},requestId());
      this.store.replace(result.replayed?await this.port.load():result.state);
    } finally {this.busy=false;}
  }
}
