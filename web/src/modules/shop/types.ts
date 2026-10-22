// 仅预留接口。本次没有实现购买或真实支付。
export type ProductGrant = {kind: 'furniture' | 'item' | 'currency'; id: string; amount: number};
export interface ShopProduct {
  id: string;
  name: string;
  grants: readonly ProductGrant[];
  price: {kind: 'game_currency'; currencyId: string; amount: number} | {kind: 'real_money'; currency: string; amountMinor: number};
  status: 'planned' | 'available' | 'disabled';
}
export interface PurchaseIntent {productId: string; quantity: number}
export interface PaymentOrderSummary {orderId: string; status: 'pending' | 'paid' | 'fulfilled' | 'closed' | 'failed'}
