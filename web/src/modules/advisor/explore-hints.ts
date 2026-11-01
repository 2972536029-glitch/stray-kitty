import type {GameState} from '../../contracts';
import {BrowserSessionStore} from '../../adapters/storage/BrowserSessionStore';
import {requestModelAdvisor, type ExploreHintRequest, type ModelAdvisorAnswer} from '../battle/model-advisor-client';
import {journeySceneKey} from './journey-context';

export interface ExploreHintInput {
  state: GameState;
  /** The map must approve this contextual hint. Do not enable for lock reasons or key instructions. */
  enabled: boolean;
  inspectHint?: string | null;
  nearTarget?: {id: string; label: string} | null;
  floor?: string;
  /** Optional map-owned target/distance-band identity. Never sent to the model. */
  hintKey?: string;
  blocked?: boolean;
  resetKey?: string | number;
}
export interface ExploreHintSnapshot {text: string | null; source: 'local' | 'model'; loading: boolean}
type Requester = (request: ExploreHintRequest, signal: AbortSignal) => Promise<ModelAdvisorAnswer>;
interface Dependencies {
  request?: Requester;
  session?: () => string | undefined;
  visible?: () => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}
const maps = new Set(['alley', 'market', 'tunnel', 'warehouse']);
const debounceMs = 800, intervalMs = 15000, cacheLimit = 64;
const local = (text: string | null, loading = false): ExploreHintSnapshot => ({text, source: 'local', loading});
const hintText = (input: ExploreHintInput) => input.inspectHint?.trim() || null;
const ordinaryHint = (text: string | null) => !!text && Array.from(text).length <= 240 &&
  !/\b(?:E|C|F|S|Space)\b|锁定|解锁|按键|无法|不能|必须|前置/.test(text);
const progressKey = (s: GameState, floor?: string) => JSON.stringify([journeySceneKey(s), floor,
  s.flags, s.drawnEvents, s.cats, s.inventory, s.currencies, s.completedStages, s.lastResult]);
const validAnswer = (answer: ModelAdvisorAnswer) => answer.source === 'model' && !!answer.text.trim() &&
  Array.from(answer.text).length <= 80 && (answer.text.match(/[。！？!?]/g)?.length ?? 0) <= 1 &&
  !/[\r\n<>`*#\[\]]|:\/\//.test(answer.text);

/** Opt-in map wording. No UI, game commands, per-frame requests or persisted tracking. */
export class ExploreAdvisorHints {
  private state: ExploreHintSnapshot = local(null);
  private listeners = new Set<() => void>();
  private latest: ExploreHintInput | null = null;
  private cache = new Map<string, Pick<ExploreHintSnapshot, 'text' | 'source'>>();
  private key = '';
  private scope = '';
  private identity = '';
  private revision = -1;
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private active: AbortController | null = null;
  private lastAttempt = -Infinity;
  private request: Requester;
  private session: () => string | undefined;
  private visible: () => boolean;
  private now: () => number;
  private setTimer: NonNullable<Dependencies['setTimer']>;
  private clearTimer: NonNullable<Dependencies['clearTimer']>;

  constructor(dependencies: Dependencies = {}) {
    const store = new BrowserSessionStore();
    this.request = dependencies.request ?? requestModelAdvisor;
    this.session = dependencies.session ?? (() => store.read()?.token);
    this.visible = dependencies.visible ?? (() => true);
    this.now = dependencies.now ?? Date.now;
    this.setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = dependencies.clearTimer ?? (timer => clearTimeout(timer));
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  private publish(next: ExploreHintSnapshot) {
    if (next.text === this.state.text && next.source === this.state.source && next.loading === this.state.loading) return;
    this.state = next; for (const listener of this.listeners) listener();
  }
  private cancel() {
    this.epoch++;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.active?.abort(); this.active = null;
  }
  private remember(key: string, value: Pick<ExploreHintSnapshot, 'text' | 'source'>) {
    this.cache.delete(key); this.cache.set(key, value);
    if (this.cache.size > cacheLimit) this.cache.delete(this.cache.keys().next().value!);
  }
  private eligible(input: ExploreHintInput) {
    return input.enabled && !input.blocked && this.visible() && input.state.phase === 'explore' &&
      maps.has(input.state.mapId) && (input.state.mapId === 'alley' || !!input.floor?.trim()) &&
      !input.nearTarget && ordinaryHint(hintText(input));
  }
  update(input: ExploreHintInput) {
    this.latest = input;
    const token = this.session(), identity = JSON.stringify([token, input.state.qaCheckpointId, input.resetKey]);
    const scope = progressKey(input.state, input.floor);
    if (identity !== this.identity || input.state.revision < this.revision || scope !== this.scope) {
      this.cancel(); this.cache.clear(); this.key = '';
      this.identity = identity; this.scope = scope;
    }
    this.revision = input.state.revision;
    const text = hintText(input);
    if (!this.eligible(input) || !token) {
      this.cancel(); this.key = ''; this.publish(local(input.state.phase === 'explore' ? text : null)); return;
    }
    const key = JSON.stringify([scope, input.hintKey, text]);
    if (key !== this.key) {this.cancel(); this.key = key;}
    const cached = this.cache.get(key);
    if (cached) {this.remember(key, cached); this.publish({...cached, loading: false}); return;}
    if (this.active || this.timer !== undefined) return;
    this.publish(local(text, true));
    const epoch = this.epoch;
    const current = () => epoch === this.epoch && key === this.key && token === this.session() &&
      !!this.latest && this.scope === progressKey(this.latest.state, this.latest.floor) && this.eligible(this.latest);
    const finish = (answer?: ModelAdvisorAnswer) => {
      if (!current()) return;
      this.active = null;
      const next = answer && validAnswer(answer) ? {text: answer.text.trim(), source: 'model' as const} : {text, source: 'local' as const};
      // Cache the local result after failure too: no automatic retries while the
      // same map target/distance band remains active.
      this.remember(key, next); this.publish({...next, loading: false});
    };
    const delay = Math.max(debounceMs, intervalMs - (this.now() - this.lastAttempt));
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      if (!current()) return;
      const latest = this.latest!, controller = new AbortController();
      this.active = controller; this.lastAttempt = this.now();
      const payload: ExploreHintRequest = {scope: 'explore_hint', sceneKey: journeySceneKey(latest.state),
        expectedRevision: latest.state.revision, context: JSON.stringify({hint: text})};
      void Promise.resolve().then(() => {
        if (!current() || controller.signal.aborted) throw new Error('hint_cancelled');
        return this.request(payload, controller.signal);
      }).then(answer => finish(answer)).catch(() => finish());
    }, delay);
  }
  recheck = () => {if (this.latest) this.update(this.latest);};
  dispose() {this.cancel(); this.cache.clear(); this.key = ''; this.latest = null; this.publish(local(null));}
}
