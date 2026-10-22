import type {GameState} from '../../contracts';
export type Listener = () => void;
export class GameStore {
  private state: GameState | null = null;
  private listeners = new Set<Listener>();
  getSnapshot = () => this.state;
  subscribe = (listener: Listener) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  replace(state: GameState) {this.state = state; this.listeners.forEach(listener => listener());}
}
