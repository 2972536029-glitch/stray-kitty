// 抽奖模块定义奖池展示与玩家意图，扣费和抽取结果以服务端为准。
export interface DrawIntent {poolId: string}
export interface PrizeEntry {itemId: string; itemType: 'furniture' | 'item'; weight: number}
export interface LotteryPool {id: string; name: string; costCurrencyId: string; costAmount: number; entries: readonly PrizeEntry[]}
