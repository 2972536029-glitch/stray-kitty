import {useEffect, useRef} from 'react';
import type {BattleResult, GameState, StoryNode} from '../../contracts';
import type {Point} from '../../modules/rainyAlley/types';
import {CanvasViewport} from '../../adapters/canvas/CanvasViewport';
import {DemoScene} from './scene';

interface Props {
  state: GameState;
  paused: boolean;
  storyScene?: StoryNode['scene'];
  onNear: (near: boolean, interactionId?: string, label?: string) => void;
  onInteract: (interactionId?: string) => void;
  onResult: (result: BattleResult) => void;
  onInspectHint?: (hint: string | null) => void;
  onMove?: (distance: number) => void;
  onRandomZone?: (zoneId: string) => Promise<boolean>;
  onWorldPosition?: (point: Point) => void;
  randomEligible?: boolean;
  /** 场景实例就绪/销毁时回调：App 用它拿到 DemoScene 查询说话者锚点（对话气泡跟随）。 */
  onSceneReady?: (scene: DemoScene | null) => void;
}

export function Viewport(props: Props) {
  const scene = useRef<DemoScene | null>(null);
  const latest = useRef(props);latest.current = props;
  useEffect(() => {
    if (scene.current) {scene.current.state = props.state;scene.current.pausedByUser = props.paused;scene.current.storyScene = props.storyScene;scene.current.randomEligible = props.randomEligible ?? true;}
  }, [props.state, props.paused, props.storyScene]);
  return <CanvasViewport label={props.state.phase === 'battle' ? '三路守护战场：点击格子布置光源' : '猫咪俯视探索场景，使用方向键或 WASD 移动'} createRuntime={canvas => {
    const runtime = new DemoScene(
      canvas,
      (near, id, label) => latest.current.onNear(near, id, label),
      id => latest.current.onInteract(id),
      result => latest.current.onResult(result),
      hint => latest.current.onInspectHint?.(hint),
      distance => latest.current.onMove?.(distance),
      zoneId => latest.current.onRandomZone?.(zoneId) ?? Promise.resolve(false),
      point => latest.current.onWorldPosition?.(point)
    );
    runtime.state = latest.current.state;runtime.pausedByUser = latest.current.paused;runtime.storyScene = latest.current.storyScene;runtime.randomEligible = latest.current.randomEligible ?? true;scene.current = runtime;
    runtime.start();
    latest.current.onSceneReady?.(runtime);
    // CanvasViewport 只认 destroy；在这里补一次 onSceneReady(null) 的通知。
    return {destroy() {runtime.destroy();scene.current = null;latest.current.onSceneReady?.(null);}};
  }}/>;
}
