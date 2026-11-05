import {useCallback} from 'react';
import type {DemoScene} from '../../examples/demo/scene';
import type {GameState} from '../../contracts';
import GlassLabels, {type GlassLabel} from '../../ui/GlassLabels';
import {marketEAction, marketInteractionTarget, marketPortalDisplay, marketPortals, marketRoadSigns} from './map';
import {marketEventAppearance, marketEventObjective, marketFixedEvents} from './eventLabels';
import {iconScale} from './eventProps';

// 与 MarketEventMarkers.draw 保持一致的事件点 → E 交互目标映射。
const interactions: Record<string, string> = {crow: 'market_crow_stall', pigeon: 'market_pigeon_perch', momo: 'market_momo_trace'};
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** 把集市现有事件点/传送门数据适配成玻璃胶囊标签（与陌生小巷同一视觉）。 */
function assembleMarketLabels(scene: DemoScene, state: GameState): GlassLabel[] {
  if (state.phase !== 'explore' || state.mapId !== 'market') return [];
  const {floor, player, camera, frame, flags, drawnEvents, busy, paused, canvas, viewSize} = scene.marketLabelContext();
  if (busy || paused) return [];
  // 世界坐标 → 视图（复用相机的 worldToScreen）→ 屏幕（与小巷同款 objectFit 换算）。
  const bounds = canvas.getBoundingClientRect();
  const fit = getComputedStyle(canvas).objectFit === 'cover' ? Math.max : Math.min;
  const scale = fit(bounds.width / viewSize.width, bounds.height / viewSize.height);
  const left = bounds.left + (bounds.width - viewSize.width * scale) / 2;
  const top = bounds.top + (bounds.height - viewSize.height * scale) / 2;
  const project = (x: number, y: number) => {
    const view = camera.worldToScreen({x, y}, frame);
    return {x: left + view.x * scale, y: top + view.y * scale};
  };
  const activeId = marketInteractionTarget(floor, player.x, player.y, flags, drawnEvents)?.id;
  const battleActive = marketEAction(floor, player.x, player.y, flags, drawnEvents)?.type === 'battle';
  const objective = marketEventObjective(flags);
  const labels: GlassLabel[] = [];
  for (const item of marketFixedEvents) {
    if (item.layer !== floor) continue;
    const appearance = marketEventAppearance(item, flags, drawnEvents);
    const distance = Math.hypot(player.x - item.x, player.y - item.y);
    labels.push({
      id: item.id,
      // Removing the old inspect dock must not hide the battle unlock condition.
      text: item.id === 'boss' && appearance.locked ? `${appearance.title} · 先完成两条情报` : appearance.title,
      key: (interactions[item.id] && interactions[item.id] === activeId) || (item.id === 'boss' && battleActive) ? 'e' : undefined,
      objective: item.id === objective,
      ...project(item.x, item.y - 38 * iconScale - 16),
      alpha: (item.id === objective ? 1 : clamp01((160 - distance) / 60)) * (appearance.completed ? .42 : 1)
    });
  }
  for (const portal of marketPortals) {
    for (const [side, point] of [portal.a, portal.b].entries()) {
      const display = marketPortalDisplay(portal, point, floor, player.x, player.y, flags);
      if (!display?.visible) continue;
      const distance = Math.hypot(player.x - point.x, player.y - point.y);
      labels.push({
        id: `portal:${portal.id}:${side}`,
        text: display.label.split(' · ')[1] ?? display.label,
        key: display.active ? portal.key : undefined,
        ...project(point.x, point.y - 14),
        alpha: display.active ? 1 : clamp01((90 - distance) / 30)
      });
    }
  }
  // 路标：文字沿用木牌数据（area · directions），渐显节奏与暗道入口胶囊一致（/30 渐入），
  // 无键位徽标——指路是信息提示，F/C 交互始终由传送门胶囊负责。
  for (const sign of marketRoadSigns) {
    if (sign.floor !== floor) continue;
    const distance = Math.hypot(player.x - sign.x, player.y - sign.y);
    labels.push({
      id: `sign:${sign.id}`,
      text: `${sign.area} · ${sign.directions}`,
      ...project(sign.x, sign.y - 24),
      alpha: clamp01((sign.revealRadius - distance) / 30)
    });
  }
  return labels;
}

/** 午夜集市的玻璃胶囊标签：数据适配在组件层完成，不侵入场景核心逻辑。 */
export default function MarketLabels({scene, state}: {scene: DemoScene; state: GameState}) {
  const getLabels = useCallback(() => assembleMarketLabels(scene, state), [scene, state]);
  const onAction = useCallback((key: 'e' | 'c' | 'f' | 'q') => scene.performAction(key), [scene]);
  return <GlassLabels getLabels={getLabels} onAction={onAction}/>;
}
