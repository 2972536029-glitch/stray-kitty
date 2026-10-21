# 轩扬 · UI 与前端缝合区

- 全局流程：`../../store/gameStore.js`
- 主入口：`../../App.jsx`
- 视觉主题：`../../styles.css`
- 可复用组件：`../../components/`
- 地图窗口：`../map/WorldMap.jsx`

四个阶段：`STORY / ROLL_DICE / TOWER_DEFENSE / END`。

Datadog 接入点在 `App.jsx` 的 `phase_entered` 日志处。后端骰子接好后，只需把 `DiceEvent.jsx` 内本地随机数替换为 `/api/roll-dice` 请求。
