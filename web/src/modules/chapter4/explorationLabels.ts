import type {GlassLabel, GlassLabelKey} from '../../ui/GlassLabels';
import {lockedTunnelEvent, tunnelEventObjective, tunnelFixedEvents, tunnelMovementChoices, type TunnelMarkerState} from './eventMarkers';
import {tunnelEventCompleted} from './navigation';
import {propScale} from './eventProps';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** World anchors only; the shared glass overlay owns appearance and input. */
export function tunnelExplorationLabels(state: TunnelMarkerState): GlassLabel[] {
  const {floor, surface, position, flags, drawnEvents, nearTarget} = state;
  const objective = tunnelEventObjective(flags);
  const labels: GlassLabel[] = tunnelFixedEvents.filter(event => surface === 'ground' && event.layer === floor).map(event => {
    const completed = tunnelEventCompleted(event, flags, drawnEvents);
    const locked = lockedTunnelEvent(event, flags);
    const distance = Math.hypot(position.x - event.x, position.y - event.y);
    const suffix = completed ? ' · 已完成' : locked ? event.id === 'tunnel_valve_three' ? ' · 先调查诱饵' : ' · 先调查诱饵与第三泄洪阀' : event.type === 'battle_exit' ? ' · 走入战斗区域' : '';
    return {
      id: event.id, text: event.label + suffix,
      key: !completed && !locked && nearTarget?.id === event.id ? 'e' : undefined,
      x: event.x, y: event.y - 38 * propScale - 16,
      alpha: (event.id === objective ? 1 : clamp01((160 - distance) / 60)) * (completed || locked ? .42 : 1),
      objective: event.id === objective
    };
  });
  const choices = tunnelMovementChoices(state);
  for (const {connection, display} of choices.entries) {
    const {portal, from} = connection;
    // Match the first reachable connection used by traverse for this key.
    const selected = !choices.eventFocus && choices.entries.find(entry => entry.connection.portal.key === portal.key && entry.display.active)?.connection === connection;
    labels.push({
      id: `portal:${portal.id}:${from === portal.a ? 'a' : 'b'}`,
      text: display.label.replace(/^(?:F|C|Space) · /, ''),
      key: selected && !display.locked ? portal.key === 'Space' ? ' ' : portal.key.toLowerCase() as GlassLabelKey : undefined,
      x: from.x, y: from.y - 25,
      alpha: clamp01((portal.reach + 32 - connection.distance) / 30) * (display.locked ? .42 : 1)
    });
  }
  return labels;
}
