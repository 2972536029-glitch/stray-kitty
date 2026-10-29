import {useEffect, useRef} from 'react';
import type {BattleResult, GameState, StoryNode} from '../../contracts';
import type {Direction} from '../../adapters/platform/input';
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
  onDirectionReady: (send: (direction: Direction, held: boolean) => void) => void;
  onInspectHint?: (hint: string | null) => void;
  onMove?: (distance: number) => void;
  onRandomZone?: (zoneId: string, floor?:string,point?:Point) => Promise<boolean>;
  onWorldPosition?: (point: Point) => void;
  onMarketBattle?: (floor:string,point:Point) => void;
  onMarketExit?: (floor:string,point:Point) => void;
  randomEligible?: boolean;
}

export function Viewport(props: Props) {
  const scene = useRef<DemoScene | null>(null);
  const latest = useRef(props);latest.current = props;
  useEffect(() => {
    if (scene.current) {scene.current.state = props.state;scene.current.pausedByUser = props.paused;scene.current.storyScene = props.storyNode?.scene;scene.current.storyNode = props.storyNode;scene.current.randomEligible = props.randomEligible ?? true;}
  }, [props.state, props.paused, props.storyNode, props.randomEligible]);
  return <CanvasViewport label={props.state.phase === 'battle' ? '三路守护战场：点击格子布置光源' : props.state.phase === 'home' ? '花房家园俯视场景，点击小猫互动' : props.state.phase === 'dialogue' ? '剧情场景，小猫跟随当前故事行动' : '猫咪俯视探索场景，使用方向键或 WASD 移动'} createRuntime={canvas => {
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
      (zoneId,floor,point) => latest.current.onRandomZone?.(zoneId,floor,point) ?? Promise.resolve(false)
    );
    runtime.state = latest.current.state;runtime.pausedByUser = latest.current.paused;runtime.storyScene = latest.current.storyNode?.scene;runtime.storyNode = latest.current.storyNode;runtime.randomEligible = latest.current.randomEligible ?? true;scene.current = runtime;
    latest.current.onDirectionReady((direction, held) => runtime.setDirection(direction, held));runtime.start();
    return runtime;
  }}/>;
}
