# 《小猫回家记：流浪猫王国》1.0

Xsolla Garage Sprint 1 可玩 Demo。项目采用 React 19，实现一段可以完整演示的 Thin Slice：

**品牌开场 → 剧情对话 → D6 随机事件 → 3×5 塔防救援 → 寻猫启事 → 章节结算**

> 核心主题：“咪想回家。原来不是所有猫都有家。那就帮它们找到家。”

## 一、项目定位

玩家扮演意外走失的家猫“喵喵”。它最初只想回到熟悉的蓝色饭碗旁，却在寻找回家线索的过程中遇见了没有家的流浪猫。玩家需要探索地图、处理随机事件、布置防线、营救伙伴，并逐步把废弃花房建设成大家共同的家。

本项目坚持以下原则：

- 全程采用猫咪主视角，猫咪是救援和建设家园的行动主体。
- 人类不接管主线行动，只通过寻猫启事和物资等线索间接出现。
- 老鼠、狗、乌鸦等真实动物不是邪恶反派。
- 塔防对手是象征未知危险和恐惧的“黑影幽灵”。
- 塔防目标是点亮道路、驱散黑影、保护猫咪撤离，不是消灭动物。
- 主线猫咪和通关能力不能放进随机卡池或付费商店。

## 二、当前可以演示的内容

1. 进入 `XSOLLA × 小猫回家记` 品牌开场页。
2. 点击“开始冒险”，观看序章打字机剧情。
3. 遇见奶牛猫点点，选择行动并进行 D6 信任判定。
4. 进入 3×5 塔防关卡：
   - 星光罐头：发射光点，让黑影退散。
   - 纸箱路障：拖延黑影，为点点争取撤离时间。
5. 守住路线后发现寻猫启事，完成第一章剧情。
6. 进入章节结算页，可以重新试玩。
7. 从开场页或游戏 HUD 打开“猫国商店”，使用猫爪邮票购买花房家具。
8. 点击“猫爪地图”，查看蓝碗之家、小巷、午夜集市和废弃花房的剧情路线。

猫国商店目前是本地 Sandbox，只使用游戏内猫爪邮票，不产生真实支付。

## 三、运行项目

### 环境要求

- Node.js 18 或更高版本
- pnpm

### 安装与启动

```bash
pnpm install
pnpm dev
```

开发服务器默认地址：

```text
http://localhost:5173/
```

生产构建：

```bash
pnpm build
```

预览生产构建：

```bash
pnpm preview
```

如果修改后页面仍显示旧样式，请在浏览器按 `Ctrl + F5` 强制刷新。

## 四、技术栈

- React 19：界面与组件
- Zustand：游戏状态机与玩家数据
- Framer Motion：骰子、页面切换和弹窗动画
- Vite：开发与生产构建
- CSS Canvas：像素拼豆角色和二维动画式界面

游戏阶段由 `src/store/gameStore.js` 管理：

```text
START → STORY → ROLL_DICE → TOWER_DEFENSE → STORY → END
```

## 五、目录结构

```text
src/
├─ App.jsx                         # 游戏总入口与阶段切换
├─ main.jsx                        # React 挂载入口
├─ store/
│  └─ gameStore.js                 # Zustand 状态、资源、商店购买
├─ data/
│  ├─ story.json                   # 剧情节点
│  └─ events.json                  # D6 随机事件配置
├─ components/
│  ├─ PixelCat.jsx                 # 不同品种的像素猫
│  ├─ Scene.jsx                    # 小巷剧情场景
│  ├─ StoryPanel.jsx               # 打字机对话框
│  ├─ DiceEvent.jsx                # D6 判定界面
│  ├─ TowerDefense.jsx             # 当前塔防原型
│  ├─ Hud.jsx                      # 资源、地图和商店入口
│  └─ EndScreen.jsx                # 章节结算
├─ features/
│  ├─ brand/                       # Xsolla 品牌开场
│  ├─ story/                       # 剧情组说明和接口
│  ├─ events/                      # 随机事件组说明和接口
│  ├─ map/                         # 地图窗口、美术资源接入口
│  ├─ tower-defense/               # 塔防替换入口
│  ├─ store/                       # 猫国商店和 Web Shop 预留
│  ├─ ui/                          # UI 缝合说明
│  └─ TEAM_CONTRACTS.md            # 并行开发边界
├─ styles.css                      # 基础场景和组件样式
├─ theme-primary.css               # 红蓝黄主视觉系统
└─ theme-features.css              # 开场、商店和响应式布局
```

## 六、小组分工与交付位置

| 成员 | 负责内容 | 主要文件或目录 | 交付要求 |
|---|---|---|---|
| 王浩哲 | 剧情与流程 | `src/data/story.json`、`src/features/story/` | 交付 JSON 节点，不修改 UI 和塔防组件 |
| 余尧 | 随机事件 | `src/data/events.json`、`src/features/events/` | 交付选项、阈值、奖励和失败代价 |
| Jenny | 地图与场景美术 | `src/features/map/` | 图片放进 `map/assets/`，通过 `MapArtSlot.jsx` 接入 |
| 闫琦雯 | 塔防逻辑 | `src/features/tower-defense/` | 保留 `onComplete()` 回调，可以整体替换当前塔防 |
| 轩扬 | UI、前端与缝合 | `src/App.jsx`、`src/components/`、主题 CSS | 维护状态机、品牌页、商店、响应式界面和模块整合 |

更详细的边界见：`src/features/TEAM_CONTRACTS.md`。

### 剧情节点契约

```json
{
  "id": "唯一节点号",
  "speaker": "说话者",
  "text": "剧情文本",
  "next_id": "下一节点号或 null",
  "type": "story | choice | tower_defense | end",
  "scene": "alley | box | poster"
}
```

### 塔防组件契约

```jsx
export default function TowerDefense({ onComplete }) {
  // 救援完成后调用
  onComplete()
}
```

只要保留 `onComplete()`，塔防同学可以把当前 React 原型整体替换为 Canvas 或其他实现。

### 地图美术契约

地图或场景图片统一放在：

```text
src/features/map/assets/
```

在 `MapArtSlot.jsx` 中引入。背景层不应包含 HUD、剧情按钮和状态逻辑，避免合并时互相覆盖。

## 七、美术与 UI 规范

### 色彩

主视觉参考经典日系二维动画的鲜明色彩语言，但角色保持原创：

- 红：`#E31B23`
- 蓝：`#0878C9`
- 黄：`#FFD21F`
- 白：`#FFFEF8`
- 描边：`#25252B`

### 造型

- 拼豆像素风，大头短肢，使用有限色板。
- 使用粗描边、右下硬暗面和固定方向投影制造二维中的体积感。
- 不使用大量粉色、柔雾和写实渐变。
- 猫咪需要通过耳型、毛色、花纹和配饰清晰区分。
- 当前角色：英短喵喵、奶牛猫点点、橘猫团子、孟买猫墨墨。

### 响应式

- 不要重新添加固定的全局 `min-width` 或 `min-height`。
- 开场主内容必须保持在视口中央。
- 窄屏时允许按钮换行、HUD 隐藏次要文字。
- 矮屏时压缩角色和标题尺寸，必要时只让中间内容区域滚动。
- 商店、地图和事件窗口必须设置视口最大高度，保证关闭按钮和操作按钮可访问。

## 八、猫国商店与 Xsolla 接入

当前商店位于 `src/features/store/StoreModal.jsx`，包含：

- 商品展示
- 猫爪邮票余额
- 余额不足提示
- 已购买状态
- 家具送达花房提示

后续接入 Xsolla Web Shop 时，可以将 `onBuy(item)` 替换为创建订单或打开支付 UI 的适配器。商品卡和整体视觉不需要重写。

商店规则：

- 可以出售家具、装饰和主题外观。
- 不出售主线猫咪。
- 不出售必要物资或通关能力。
- 基础猫窝必须通过剧情确定性获得。
- 演示环境必须明确区分 Sandbox 与真实支付。

## 九、日志与 Datadog 预留

阶段切换会在控制台输出：

```text
[Kittych demo] phase_entered
```

接入 Datadog 时，可以在 `src/App.jsx` 中把这条日志替换为正式 logger。建议记录：

- 进入剧情、骰子、塔防和结算阶段
- 骰子选择和判定结果
- 塔防开始、胜利和失败
- 打开商店和商品购买结果
- 打开地图和章节节点

日志中不要写入姓名、账号、支付凭证或其他个人信息。

## 十、协作规则

1. 开始开发前先拉取最新代码。
2. 只修改自己负责的目录和接口文件。
3. 不要直接重命名其他成员的入口文件。
4. 新增公共字段前，先在 `TEAM_CONTRACTS.md` 记录。
5. 提交前至少运行一次：

```bash
pnpm build
```

6. 提交信息建议使用：

```text
feat(story): add poster dialogue
feat(map): add alley background
feat(tower): add shadow ghost wave
feat(store): add furniture item
fix(ui): keep start screen centered on small windows
```

7. 不提交 `node_modules/`、临时文件、账号凭证或真实支付信息。

## 十一、Sprint 1 演示检查表

- [ ] 开局页可以看到 Xsolla 品牌标志。
- [ ] “开始冒险”和“猫国商店”按钮可以点击。
- [ ] 调整窗口大小后主要内容仍然居中，按钮没有被裁掉。
- [ ] 剧情可以从序章连续播放到点点事件。
- [ ] 两个选项都能触发 D6 判定。
- [ ] 塔防可以放置星光罐头和纸箱。
- [ ] 塔防对手显示为黑影幽灵，不是真实动物。
- [ ] 胜利后能够进入寻猫启事剧情。
- [ ] 商店购买不会产生真实支付。
- [ ] 控制台没有阻止游戏运行的错误。
- [ ] `pnpm build` 可以成功完成。

---

我们的目标不是在第一周做完全部内容，而是让玩家完整感受到：

**一只猫寻找自己的家，最后决定帮助更多猫一起拥有家。**
