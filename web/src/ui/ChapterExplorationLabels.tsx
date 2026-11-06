import {useCallback} from 'react';
import type {DemoScene} from '../examples/demo/scene';
import GlassLabels, {type GlassLabelKey} from './GlassLabels';

export default function ChapterExplorationLabels({scene, mapId}: {scene: DemoScene; mapId: 'tunnel' | 'warehouse'}) {
  const getLabels = useCallback(() => scene.chapterExplorationLabels(mapId), [scene, mapId]);
  const onAction = useCallback((key: GlassLabelKey) => scene.performAction(key), [scene]);
  return <GlassLabels getLabels={getLabels} onAction={onAction}/>;
}
