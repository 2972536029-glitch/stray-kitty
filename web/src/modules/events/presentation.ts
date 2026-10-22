import type {EventTier} from '../../contracts';
// 展示映射；判定由 Go 执行。设计来源：余尧 random-events-design v0.3。
export const eventTiers: {id: EventTier; label: string; range: string; probability: string}[] = [
  {id: 'crit', label: '大成功', range: '12', probability: '2.78%'},
  {id: 'success', label: '成功', range: '9–11', probability: '25%'},
  {id: 'partial', label: '成功但有代价', range: '6–8', probability: '44.44%'},
  {id: 'fail', label: '失败，局势推进', range: '2–5', probability: '27.78%'}
];
