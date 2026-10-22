import type {GameCommand} from '../contracts';
import type {GameApiPort} from '../core/ports';
import {canDispatch} from '../core/flow';
import {GameStore} from '../core/state';
export class GameController {
  private busy=false;
  constructor(readonly port: GameApiPort, readonly store: GameStore) {}
  async dispatch(command: GameCommand) {
    const state=this.store.getSnapshot();
    if(this.busy||!state) throw new Error('请等待当前操作完成');
    if(!canDispatch(state.phase,command.type)) throw new Error('当前阶段不能执行此操作');
    this.busy=true;
    try {
      const result=await this.port.execute({expectedRevision:state.revision,command},crypto.randomUUID());
      this.store.replace(result.replayed?await this.port.load():result.state);
    } finally {this.busy=false;}
  }
}
