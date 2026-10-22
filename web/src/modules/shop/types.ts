// 单件家具购买已接入；这里只保留未来多商品与真实支付的扩展接口。
export type {FurnitureProduct} from '../../contracts';
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
