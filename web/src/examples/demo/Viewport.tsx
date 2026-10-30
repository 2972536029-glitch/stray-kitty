import {useEffect, useRef} from 'react';
import type {BattleResult, GameState, StoryNode} from '../../contracts';
import type {Point} from '../../modules/rainyAlley/types';
import {CanvasViewport} from '../../adapters/canvas/CanvasViewport';
import {DemoScene} from './scene';

interface Props {
  state: GameState;
  paused: boolean;
  storyNode?: StoryNode;
  onNear: (near: boolean, interactionId?: string, label?: string) => void;
  onInteract: (interactionId?: string) => void;
  onResult: (result: BattleResult) => void;
  onInspectHint?: (hint: string | null) => void;
  onMove?: (distance: number) => void;
  onRandomZone?: (zoneId: string, floor?:string,point?:Point) => Promise<boolean>;
  onWorldPosition?: (point: Point) => void;
  onMarketBattle?: (floor:string,point:Point) => void;
  onMarketExit?: (floor:string,point:Point) => void;
  randomEligible?: boolean;
  onWarehousePosition?: (floor:'L0'|'L1',point:Point)=>void;
  onWarehouseClimbReady?: (climb:()=>void)=>void;
  /** 场景实例就绪/销毁时回调：App 用它拿到 DemoScene 查询说话者锚点（对话气泡跟随）。 */
  onSceneReady?: (scene: DemoScene | null) => void;
}

export function Viewport(props: Props) {
  const scene = useRef<DemoScene | null>(null);
  const latest = useRef(props);latest.current = props;
  useEffect(() => {
    if (scene.current) {scene.current.state = props.state;scene.current.pausedByUser = props.paused;scene.current.storyScene = props.storyNode?.scene;scene.current.storyNode = props.storyNode;scene.current.randomEligible = props.randomEligible ?? true;}
  }, [props.state, props.paused, props.storyNode, props.randomEligible]);
  const home = props.state.phase === 'home' && props.state.chapterId !== 'prologue';
  return <><CanvasViewport label={props.state.phase === 'battle' ? '三路守护战场：点击格子布置光源' : props.state.phase === 'home' ? '花房家园俯视场景，拖动查看，点击小猫或家具互动' : props.state.phase === 'dialogue' ? '剧情场景，小猫跟随当前故事行动' : '猫咪俯视探索场景，使用方向键或 WASD 移动'} createRuntime={canvas => {
    const runtime = new DemoScene(
      canvas,
      (near, id, label) => latest.current.onNear(near, id, label),
      id => latest.current.onInteract(id),
      result => latest.current.onResult(result),
      hint => latest.current.onInspectHint?.(hint),
      distance => latest.current.onMove?.(distance),
      zoneId => latest.current.onRandomZone?.(zoneId) ?? Promise.resolve(false),
      point => latest.current.onWorldPosition?.(point),
      (floor,point) => latest.current.onMarketBattle?.(floor,point),
      (floor,point) => latest.current.onMarketExit?.(floor,point),
      (zoneId,floor,point) => latest.current.onRandomZone?.(zoneId,floor,point) ?? Promise.resolve(false),
      (floor,point)=>latest.current.onWarehousePosition?.(floor,point)
    );
    runtime.state = latest.current.state;runtime.pausedByUser = latest.current.paused;runtime.storyScene = latest.current.storyNode?.scene;runtime.storyNode = latest.current.storyNode;runtime.randomEligible = latest.current.randomEligible ?? true;scene.current = runtime;
    runtime.start();
    latest.current.onWarehouseClimbReady?.(()=>runtime.climbWarehouse());
    latest.current.onSceneReady?.(runtime);
    // CanvasViewport 只认 destroy；在这里补一次 onSceneReady(null) 的通知。
    return {destroy() {runtime.destroy();scene.current = null;latest.current.onSceneReady?.(null);}};
  }}/>{home && <div className="home-camera-controls" aria-label="花房视角"><button disabled={props.paused} aria-label="放大花房" onClick={()=>scene.current?.homeZoom(.35)}>＋</button><button disabled={props.paused} aria-label="缩小花房" onClick={()=>scene.current?.homeZoom(-.35)}>－</button><button disabled={props.paused} onClick={()=>scene.current?.homeZoom(0)}>花房全景</button><span>拖动查看 · 点猫咪或家具互动</span></div>}</>;
}
