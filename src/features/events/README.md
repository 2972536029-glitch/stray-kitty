# 余尧 · 随机事件接入口

事件配置位于 `../../data/events.json`。UI 会读取选项文字、骰点加成、奖励和代价。

新增事件时请保留：`title / prompt / threshold / options`。每个选项保留：
`id / label / icon / modifier / successReward / failureCost / hint`。

后续可在本目录新增独立事件组件，再从 `App.jsx` 接入。
