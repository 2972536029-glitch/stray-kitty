# Sprint 1 并行开发边界

| 成员 | 独立目录 | 不需要修改 | 合并接口 |
|---|---|---|---|
| 王浩哲 | `story/` + `data/story.json` | UI、塔防 | JSON 节点契约 |
| 余尧 | `events/` + `data/events.json` | 场景、塔防 | 事件配置契约 |
| Jenny | `map/` + `map/assets/` | HUD、剧情状态 | `MapArtSlot` 或背景图片 |
| 闫琦雯 | `tower-defense/` | 剧情、地图 | `onComplete()` |
| 轩扬 | `ui/`、`components/`、`App.jsx` | 队友内部逻辑 | 状态机与视觉整合 |

扩展模块：`brand/` 为 Xsolla 开场品牌位；`store/` 为猫国商店及未来 Web Shop 接入位。

不要跨目录重命名他人的入口文件。需要新增公共字段时，先在本文件记录，再同步修改调用方。
