export function hasAllFlags(flags: readonly string[], required: readonly string[]): boolean {
  return required.every(flag => flags.includes(flag));
}
export function canAfford(balance: number, cost: number): boolean {
  return Number.isSafeInteger(balance) && Number.isSafeInteger(cost) && cost >= 0 && balance >= cost;
}
