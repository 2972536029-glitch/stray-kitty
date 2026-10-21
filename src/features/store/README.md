# 猫国商店 · Xsolla 接入预留

当前是使用猫爪邮票的本地沙盒商店，不产生真实支付。

- 商品配置：`StoreModal.jsx` 中的 `storeItems`
- 购买状态：`gameStore.js` 中的 `ownedFurniture`
- 购买入口：开局页与游戏 HUD

后续接入 Xsolla Web Shop 时，可把 `onBuy(item)` 替换为创建订单 / 打开支付 UI 的适配器；商品展示组件不需要重写。主线猫咪、基础猫窝和救援能力不得放入付费商品。
