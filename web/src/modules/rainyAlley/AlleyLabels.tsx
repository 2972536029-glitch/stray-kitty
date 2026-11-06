import {useCallback} from 'react';
import type {DemoScene} from '../../examples/demo/scene';
import GlassLabels, {type GlassLabelKey} from '../../ui/GlassLabels';

/** 陌生小巷的玻璃胶囊标签：数据与交互来自场景，渲染交给通用 GlassLabels。 */
export default function AlleyLabels({scene}: {scene: DemoScene}) {
  const getLabels = useCallback(() => scene.alleyExplorationLabels(), [scene]);
  const onAction = useCallback((key: GlassLabelKey) => scene.performAction(key), [scene]);
  return <GlassLabels getLabels={getLabels} onAction={onAction}/>;
}
