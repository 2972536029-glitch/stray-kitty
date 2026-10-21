# 闫琦雯 · 塔防逻辑接入口

当前可玩原型通过本目录的 `index.js` 导出。你可以把 Canvas 或 React 塔防代码放进本目录，再修改 `index.js` 指向新组件。

唯一必须遵守的 UI 契约：

```jsx
export default function TowerDefense({ onComplete }) {
  // 关卡胜利并完成撤离时调用：
  onComplete()
}
```

首周地图为 3×5；纸箱负责阻挡，星光罐头负责远程照明。对手是象征恐惧的黑影幽灵，玩法措辞统一使用“点亮、驱散、保护撤离路线”，不能替换成任何真实动物敌人。
