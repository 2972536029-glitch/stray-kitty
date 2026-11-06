import type {GlassLabel} from '../../ui/GlassLabels';
import geometry from '../../../../level_design/chapter5/source/v07/warehouse_geometry_v07.json' with {type: 'json'};
import {fixedPoints, names, type MarkerState} from './eventMarkers';
import {propScale} from './eventProps';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function warehouseExplorationLabels(state: MarkerState): GlassLabel[] {
  const {floor, position, flags, drawn, near} = state;
  const victory = flags.has('finale_boss_victory');
  const labels: GlassLabel[] = fixedPoints.filter(point => point.floor === floor).map(point => {
    const completed = point.kind === 'fixed_event' ? drawn.has('node:' + point.id) : point.id === 'finale_boss' && victory;
    const locked = point.id === 'bunker_exit' && !victory;
    const objective = point.id === 'finale_boss' && !victory || point.id === 'bunker_exit' && victory;
    const active = !completed && !locked && near?.key === 'E' && near.id === point.id;
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    const suffix = completed ? ' · 已完成' : locked ? ' · 战后解锁' : point.kind === 'light' ? flags.has(point.id) ? ' · 已亮' : ' · 未亮' : '';
    return {
      id: point.id,
      text: active ? near.label.replace(/ · E$/, '') : names[point.id] + suffix,
      key: active ? 'e' : undefined,
      x: point.x, y: point.y - 38 * propScale - 16,
      alpha: (objective ? 1 : clamp01((160 - distance) / 60)) * (completed || locked ? .42 : 1),
      objective
    };
  });
  const climbs = geometry.climbs.map(point => ({point, distance: Math.hypot(position.x - point.x, position.y - point.y)})).sort((a, b) => a.distance - b.distance);
  for (const {point, distance} of climbs) {
    labels.push({
      id: `climb:${point.id}`, text: floor === 'L0' ? '攀上货架' : '回到地面',
      key: near?.key === 'C' && distance <= 44 && point === climbs[0].point ? 'c' : undefined,
      x: point.x, y: point.y - 32, alpha: clamp01((76 - distance) / 30)
    });
  }
  return labels;
}
