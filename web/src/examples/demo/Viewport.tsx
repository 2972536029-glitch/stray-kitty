import {useEffect, useRef, useState} from 'react';
import type {BattleResult, GameState, StoryNode} from '../../contracts';
import type {Point} from '../../modules/rainyAlley/types';
import {CanvasViewport} from '../../adapters/canvas/CanvasViewport';
import {DemoScene} from './scene';
import type {ChapterBackgroundStatus} from '../../modules/map/artwork';
import TouchControls, {type TouchInteraction} from '../../ui/TouchControls';
import AlleyLabels from '../../modules/rainyAlley/AlleyLabels';
import MarketLabels, {assembleMarketLabels} from '../../modules/nightMarket/MarketLabels';
import ChapterExplorationLabels from '../../ui/ChapterExplorationLabels';

interface Props {
  onHomeAdvisor?:()=>void;
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
  const [activeScene, setActiveScene] = useState<DemoScene | null>(null);
  const [background, setBackground] = useState<ChapterBackgroundStatus | null>(null);
  const latest = useRef(props);latest.current = props;
  // Use the same reachable actions as the map prompts, then dispatch exactly
  // one existing key handler. Re-evaluate on press so moving never uses a stale key.
  const getInteraction = (): TouchInteraction => {
    const runtime = scene.current, state = latest.current.state;
    const labels = !runtime || latest.current.paused ? [] : state.mapId === 'alley' ? runtime.alleyExplorationLabels()
      : state.mapId === 'market' ? assembleMarketLabels(runtime, state)
      : state.mapId === 'tunnel' || state.mapId === 'warehouse' ? runtime.chapterExplorationLabels(state.mapId) : [];
    const key = (labels.find(label => label.key === 'e') ?? labels.find(label => label.key))?.key ?? 'e';
    return {key, label: key === 'q' ? '钻缝' : key === 'c' ? '攀爬' : key === 'f' ? '下行' : key === ' ' ? '跳跃' : '交互'};
  };
  useEffect(() => {
    if (scene.current) {scene.current.state = props.state;scene.current.pausedByUser = props.paused;scene.current.storyScene = props.storyNode?.scene;scene.current.storyNode = props.storyNode;scene.current.randomEligible = props.randomEligible ?? true;}
  }, [props.state, props.paused, props.storyNode, props.randomEligible]);
  return <><CanvasViewport nativeResolution={(props.state.chapterId === 'alley' && props.state.mapId === 'alley') || props.state.mapId === 'market' || props.state.mapId === 'tunnel'} label={props.state.phase === 'battle' ? '三路守护战场：点击格子布置光源' : props.state.phase === 'home' ? '花房家园俯视场景，拖动查看，点击小猫或家具互动' : props.state.phase === 'dialogue' ? '剧情场景，小猫跟随当前故事行动' : '猫咪俯视探索场景，使用方向键或 WASD 移动'} createRuntime={canvas => {
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
      (floor,point)=>latest.current.onWarehousePosition?.(floor,point),
      setBackground
    );
    runtime.onHomeAdvisor=()=>latest.current.onHomeAdvisor?.();
    runtime.state = latest.current.state;runtime.pausedByUser = latest.current.paused;runtime.storyScene = latest.current.storyNode?.scene;runtime.storyNode = latest.current.storyNode;runtime.randomEligible = latest.current.randomEligible ?? true;scene.current = runtime;
    runtime.start();
    setActiveScene(runtime);
    latest.current.onWarehouseClimbReady?.(()=>runtime.climbWarehouse());
    latest.current.onSceneReady?.(runtime);
    return {resize() {runtime.resize();},destroy() {runtime.destroy();scene.current = null;latest.current.onSceneReady?.(null);}};
  }}/>{activeScene && props.state.phase === 'explore' && props.state.mapId === 'alley' && <AlleyLabels scene={activeScene}/>}{activeScene && props.state.phase === 'explore' && props.state.mapId === 'market' && <MarketLabels scene={activeScene} state={props.state}/>}{activeScene && props.state.phase === 'explore' && (props.state.mapId === 'tunnel' || props.state.mapId === 'warehouse') && <ChapterExplorationLabels scene={activeScene} mapId={props.state.mapId}/>}{props.state.phase === 'explore' && <TouchControls disabled={props.paused || background?.state === 'loading' || background?.state === 'error'} getInteraction={getInteraction}
    onDirection={(direction, held) => scene.current?.setDirection(direction, held)} onAction={action => scene.current?.performAction(action)}/>}
  {background && (background.state === 'loading' || background.state === 'error') && <div className="map-loading-panel" role={background.state === 'error' ? 'alert' : 'status'}>
    <div><span aria-hidden="true">ฅ</span><p>{background.state === 'error' ? '地图暂时没打开' : '正在打开地图……'}</p>
      {background.state === 'error' ? <button onClick={()=>scene.current?.retryBackground()}>重新加载地图</button> : <small>路铺好后，小猫就可以出发了。</small>}
    </div>
  </div>}</>;
}
