export interface ParcelPool {
  id: string; name: string; theme: string; description: string;
  cost: number; currency: 'stamp' | 'tuna'; requiredFlag: string;
  pityEvery: number; duplicateMaterial: number;
  entries: {furnitureId: string; weight: number}[];
}
export interface ParcelDraw {
  id: string; poolId: string; furnitureId: string; currency: string; cost: number;
  number: number; duplicate: boolean; guaranteed: boolean; material: number; createdAt: string;
}
export interface LotteryState {
  progress: Record<string, {draws: number; misses: number}>;
  history: ParcelDraw[]; day: string; dailyClaims: string[]; milestones: string[];
}
export interface ParcelReward {
  id: string; name: string; description: string; kind: 'daily' | 'milestone';
  condition: 'home' | 'furnished' | 'flag'; requiredFlag?: string; stamp: number; tuna: number;
}
