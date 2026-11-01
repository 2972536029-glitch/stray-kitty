import map from '../../../../level_design/chapter4/data/chapter4.map.json' with { type: 'json' };

export type TunnelLayer = 'L0' | 'Lm1';
export type TunnelPoint = {x: number; y: number};
const distance = (a: TunnelPoint, b: TunnelPoint) => Math.hypot(a.x - b.x, a.y - b.y);

// Use the closest end on this floor, including reversible same-floor jumps.
export function tunnelConnections(floor: TunnelLayer, position: TunnelPoint) {
  return map.portals.flatMap(portal => [
    {portal, from: portal.a, to: portal.b},
    ...(portal.bidirectional ? [{portal, from: portal.b, to: portal.a}] : []),
  ]).filter(connection => connection.from.layer === floor)
    .map(connection => ({...connection, distance: distance(position, connection.from)}))
    .sort((a, b) => a.distance - b.distance);
}

export function tunnelPortalDisplay(connection: ReturnType<typeof tunnelConnections>[number], flags: readonly string[]) {
  const {portal, from, to, distance} = connection;
  const locked = portal.key === 'F' && !flags.includes('tunnel_false_kitten_trap_found');
  const active = distance <= portal.reach;
  const stairs = portal.key === 'F';
  const description = stairs ? (to.layer === 'Lm1' ? '下至 L−1 排水道' : '返回 L0 主暗渠')
    : portal.key === 'Space' ? '跳过水沟' : from === portal.a ? '攀上平台' : '返回下方通道';
  return {
    visible: stairs || distance <= portal.reach + 32,
    active, locked, alpha: active ? 1 : stairs ? .22 : .72,
    label: `${portal.key} · ${description}${locked ? '（先调查假猫叫诱饵）' : ''}`,
  };
}

export function tunnelEventCompleted(event: (typeof map.events)[number], flags: readonly string[], drawnEvents: readonly string[]) {
  if (event.id === 'tunnel_false_kitten_trap') return flags.includes('tunnel_false_kitten_trap_found');
  if (event.id === 'tunnel_exit_boss') return flags.includes('tunnel_explored');
  return !!event.eventId && drawnEvents.includes(`node:${event.eventId}`);
}
