# 王浩哲 · 剧情与流程接入口

正式剧情数据放在 `../../data/story.json`。可以直接修改或追加节点，无需改 UI。

节点契约：

```json
{
  "id": "唯一节点号",
  "speaker": "说话者",
  "text": "猫咪主视角台词",
  "next_id": "下一节点号或 null",
  "type": "story | choice | tower_defense | end",
  "scene": "alley | box | poster"
}
```

剧情原则：玩家的动作目标应使用“守护、拖延、引路、救援”，不使用“消灭动物”。
