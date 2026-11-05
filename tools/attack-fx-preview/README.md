# 战斗视觉与拖动预览

所有命令均在仓库根目录运行，先安装项目依赖（`npm ci --ignore-scripts`）。下面的本地预览和验证命令只启动本地 Vite 页面，直接使用正式 painter、战斗组件和引擎，不连接游戏后端、不打开线上会话、不读写玩家存档。

## 浏览器与端口

浏览器验证优先使用环境变量 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定的 Chromium 可执行文件。未指定时，Windows 使用标准安装路径下的 Microsoft Edge；其他平台使用 Playwright 的 Chromium，可先运行 `npx playwright install chromium`。Windows 未安装标准路径下的 Edge 时也请设置该变量。

手动预览使用 8184（普攻）或 8187（拖动）。下表中的验证命令会自行启动、关闭临时服务与浏览器；请串行执行，并先关闭占用相应端口的手动预览。证据默认或按示例写入被 Git 忽略的 `test-results/`，验证失败时进程返回非零退出码。

## 手动查看

```sh
node tools/attack-fx-preview/server.mjs
```

打开终端显示的地址（默认 `http://127.0.0.1:8184/tools/attack-fx-preview/`）。页面支持切换五章、出手角色、暂停、重播和逐帧查看，一次只回放一个攻击。第五章包含铃铃和桃桃的援军普攻；音音没有普攻，不制造新的攻击效果。

首领的“近距离 / 射程边缘”目标来自当前章节初始在场主力猫，按正式 `footprintDistance` 与 `RULES.bossRange` 筛选。猫咪目标按正式 `createBattleGeometry.attackCells` 筛选：斑斑、栗栗为朝右的 T 形四格，团子保留自身爪击范围。若演示目标格已有另一只猫，只在这个独立演示画面隐藏该猫，避免挡住目标；不改变正式战斗配置。页面诊断中的 `targetInAttackRange` 可核对选点。

```sh
node tools/attack-fx-preview/drag-server.mjs
```

打开 `http://127.0.0.1:8187/__drag-fixture?controls=1`。此页挂载序章及五章正式战斗组件，可切换章节、开始战斗、拖动和交换猫咪；每次切换或重试仅重建本地测试状态。

## 可重复验证

| 命令 | 端口 | 覆盖范围 |
| --- | --- | --- |
| `node tools/attack-fx-preview/verify.mjs test-results/attack-fx-preview` | 8185 | 五章角色普攻、画面与演示状态不变性、窄屏，输出截图及动画 |
| `node tools/attack-fx-preview/verify-boundaries.mjs test-results/attack-fx-boundaries` | 8186 | 通道黑暗中的目标隐藏、序章弹道生命周期等特殊绘制边界 |
| `node tools/attack-fx-preview/cat-preview-ranges.mjs test-results/cat-preview-ranges` | 8186 | 演示目标在真实普攻范围内，包含近战与各章主力猫 |
| `node tools/attack-fx-preview/greenhouse-arm.mjs test-results/greenhouse-whip greenhouse-whip` | 8186 | 温室首领近距离及射程边缘的起手、甩鞭、回收关键帧与动画 |
| `node tools/attack-fx-preview/drag-verify.mjs test-results/cat-drag` | 8187 | 六关实际鼠标/触摸拖动、抓取偏移、合法落位、交换、非法落点、暂停及窄屏 |
| `node tools/attack-fx-preview/drag-cancel-verify.mjs test-results/cat-drag-cancel` | 8187 | 取消、次要触点与低 RAF 下源猫/预览的即时隐藏和恢复 |
| `node tools/attack-fx-preview/drag-lifecycle-verify.mjs test-results/drag-lifecycle` | 8187 | 序章预览锚点、拖动中退场或终局后的清理、重新开始 |
| `node tools/attack-fx-preview/drag-range-verify.mjs test-results/drag-range` | 8188 | 六关拖动范围的 Canvas/DOM 逐格一致、真实坐标保持、板外/非法清空及取消/落位恢复 |

温室专项请使用表中显式的 `greenhouse-whip` 模式，或用 `greenhouse-only` 获取较少关键帧。两种 focused 模式都不需要像素基线，均验证手臂方向、有限绘制坐标、状态不变和实际近/远目标。脚本保留的 `baseline` / 默认 `verify` 仅供有意建立并比较特定版本像素基线时使用，`verify` 需要同一输出目录中的 `baseline.json`；它们不属于上面的最终版本验收命令，也不能套用早期迭代的基线。

## 验证边界

视觉页面使用固定攻击快照；首领方向探针会构造额外方向，仅验证绘制数学，不代表实际引擎会选择那些目标。拖动验证使用真实组件与指针事件；序章生命周期和范围专项会在独立测试内存中设置阶段、退场或终局，便于重复覆盖边界。它们不更改生产数值，也不代替完整关卡通关、线上部署或存档验收。

输出中的 `verification.json` 记录通过项、失败和错误，截图及视频用于人工核对视觉结果。涉及本次功能的测试通过后，再按团队发布流程进行线上验收。

## 独立线上验收

`online-acceptance.mjs`（调用 `online-gameplay.mjs`）是部署后的独立验收入口，不在上述本地命令中运行。它要求显式设置 `KITTY_ONLINE_ATTACK_FX_ALLOW_NEW_SESSION=1` 和完整的 `KITTY_EXPECTED_RELEASE_COMMIT`，并从 `KITTY_ACCEPTANCE_WORK_DIR`（默认仓库父目录）读取 `KITTY_MAP_ART_CLUSTER_SNAPSHOT` 指定的集群资产指纹文件。未提供必要前置数据时会退出。

线上验收会在全新浏览器上下文创建一个匿名 QA 会话，核对实际部署资源、五章普攻与拖动范围，通过原有 QA 入口切换章节，最后恢复该测试会话首次 QA 前的状态；不读取既有浏览器登录或玩家存档。执行前应已获得目标环境的发布验收授权。短时战斗与交互检查不等于完整关卡通关。
