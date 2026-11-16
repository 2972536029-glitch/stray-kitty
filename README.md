# 🐱 小猫回家记:流浪猫王国 · Stray Kitty

> 「咪想回家。后来才发现,不是所有猫都有家。那就和伙伴们一起,为彼此找到一个家。」

2D 像素风猫咪冒险:操控走失的家猫喵喵,探索城市、掷骰闯事件、分路塔防营救伙伴,把废弃花房一点一点建成属于大家的流浪猫王国。

**在线玩:https://starry-kitty.duckdns.org**(浏览器打开即玩,手机竖屏也可)

React 19 + TypeScript + **原生 Canvas 2D**(不使用游戏引擎)| Go API | MySQL 8.4 / 单进程 JSON 双存储 | Datadog 全链路可观测 | Xsolla PayStation 沙盒支付链路

---

## 玩什么

| 玩法 | 说明 |
|------|------|
| 📖 六章剧情 | 序章「金枪鱼事件」→ 陌生小巷 → 午夜集市 → 废弃花房 → 消失的猫咪们 → 终章「点亮流浪猫王国」;全程猫咪视角,黑影怕光,靠点亮路线完成救援 |
| 🗺️ 探索地图 | 俯视移动、边界碰撞、接近交互;区域随剧情解锁,只预载当前章节,空闲时段按大小单并发预取静态资源 |
| 🎲 随机事件 | **服务端权威 2d6 四档掷骰**:12 大成功(2.78%)/ 9–11 成功(25%)/ 6–8 有代价(44.44%)/ 2–5 失败推进(27.78%);结果落库,刷新不可重掷;事件内容表 ajv 校验进 CI |
| 🛡️ 分路塔防 | 布阵、能量、波次、Boss 与动作预警技能,六名临时援军;失败可重试不发奖,零漏通关额外补给;永久奖励一律服务端结算 |
| 🏠 家园建设 | 花房随剧情成长:救回猫咪、解锁家具,从破纸箱到猫爬架、灯饰与庭院 |
| 🎁 家具抽卡 | 猫爪邮票抽取「猫国神秘包裹」;雨夜纸箱 / 午夜集市 / 地下月光 / 花房庭院四主题卡池;三抽保底;主线猫咪确定性获得,不进随机池 |
| 🛍️ 商城与支付 | 模拟充值走 mock 演示卡(4242 必成 / 0000 必败);配好 Xsolla 凭据即切换沙盒真实链路(PayStation 收银台 + webhook 验签回账,详见下文) |
| 🐈 战斗军师「阿策」 | 接入 DeepSeek 的只读战斗问答:给定可见战况给出建议,服务端场次校验 + 限时限流,密钥只存服务端 |
| 🎵 音频 | 场景 BGM(雨巷 / 月光 / 织梦 / 钢琴等多版原创配乐)+ 战斗与 UI 音效(脚本合成),标题页静音开关 |
| 📱 移动端 | 手机浏览器竖屏呈现、触摸控制与 safe-area 适配 |

## 架构

```
浏览器 (React 19 + TS + Vite)
   │  原生 Canvas 2D:移动/碰撞/逐帧战斗在前端
   ▼
模块层(地图 / 事件 / 战斗 / 家园 …) ── GameController 流程与命令
   │  长期操作意图走 HTTP(事件判定/抽取/结算/购买/摆放)
   ▼
Go API:transport(认证与校验)→ service(判定·抽取·结算)→ repository
   │  状态与收据同一事务提交
   ├─ 配置 GAME_MYSQL_DSN ──► MySQL 8.4(玩家/会话/账号/完整状态)
   └─ 未配置 DSN ──────────► 单进程 JSON 文件(零依赖本地跑通)
paymentd(独立支付账本):Xsolla 沙盒 token → PayStation 收银台
   └─ webhook 验签(sha1)→ 幂等落账 RecordIfNew → /internal/credit 同号去重
advisor:POST /api/v1/advisor(只读场次校验,DeepSeek 密钥隔离)
```

关键取舍:

- **不用 Phaser 等游戏引擎**:2D 俯视 + 站位塔防,原生 Canvas 足够,换来更细的渲染与加载控制。
- **双存储模式**:不配 MySQL 时单进程 JSON 文件即可完整运行;配置 DSN 自动切事务化 MySQL,本地/CI 与部署共用一套代码。
- **支付只走服务端发货**:前端返回页只读轮询流水;发货链路 `webhook → paymentd 落账 → 游戏侧 /internal/credit`,同号流水去重不双发;退款通知留痕。单进程形态不支持 Xsolla(拆分部署限定),沙盒默认开启、代码级闸门,不发生真实扣款。
- **资源加载策略**:标题页空闲时段预取;无损 WebP 优先、PNG 回退;Service Worker 按构建产物内容哈希生成清单,只缓存同源静态资源,HTML 与 API 永远走网络;离线 / 慢网 / 剩余空间不足自动暂停预取。

## 可观测(Datadog)

主线:`RUM → Trace → Logs → Metrics → Monitor → Slack`。16 条 Monitor 覆盖 p95 / 5xx / 前端 JS 错误 / 支付失败率等,Datadog RUM 注入 traceparent 与后端 APM 关联。

两条铁律(与姊妹项目「旅行牛牛」互相验证的团队纪律):

1. **观测旁路绝不影响业务**:指标 UDP fire-and-forget,日志队列满即丢,无 Agent / 无密钥时全部静默 no-op——没有任何 Datadog 配置,游戏照常运行与测试。
2. **观测不制造新风险**:业务拒绝(rejected)不进故障告警,只有系统错误(error)才告警。

详见 [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)。

## 测试与质量

- 前端/逻辑:`npm test` —— node:test 单测与集成 75 个文件(core / audio / 内容表 / 各章关卡 / 战斗 / 家园 / UI)
- 服务端:`npm run test:server` —— `go test ./...`
- E2E:`npm run test:e2e` —— Playwright 全套(章节导航、事件、战斗结算、音频控制、军师问答、资源加载等),另有 `test:player-flow` 玩家流程验收
- 契约与内容:`api:check`(OpenAPI)、`content:check`(事件表 ajv)、`architecture:check`([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 由源码自动生成,漂移即报)

## 快速开始

要求 Node.js ≥ 22.12(Go 1.25+ 用于服务端测试)。

```bash
npm install
npm run dev        # 前端 http://127.0.0.1:5017 + API 8017(Windows 可双击 启动开发.cmd)
```

Docker 一键(含可选 MySQL 与 Datadog Agent profile):

```bash
cd deploy && docker compose up --build
```

发布走 GitLab MR → pipeline(`web_checks`/`server_checks`/`server_build`/`deploy_images`)→ 手动 `deploy_apply` → 线上健康检查 `https://starry-kitty.duckdns.org/healthz`。细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 文档索引

- [PRD.md](docs/PRD.md) — 产品需求与分工 · [《小猫回家记:流浪猫王国》.md](《小猫回家记:流浪猫王国》.md) — 剧情设定稿
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与目录(源码生成)· [DATABASE.md](docs/DATABASE.md) — 存储设计
- [OBSERVABILITY.md](docs/OBSERVABILITY.md) — 可观测手册 · [PAYMENT-XSOLLA-SANDBOX.md](docs/PAYMENT-XSOLLA-SANDBOX.md) — 支付链路
- [GAME-FLOWCHART.md](docs/GAME-FLOWCHART.md) · L00–L05 关卡集成文档 · [AUDIO-CREDITS.md](docs/AUDIO-CREDITS.md)

## 团队

Xsolla School Beijing 工程师培养计划结课项目,7 人团队按模块协作(剧情与公共框架 / 地图 / 随机事件 / 塔防 / UI / 家园与经济),全程 GitLab MR + Code Review 交付;姊妹项目为同期的治愈系放置游戏「旅行牛牛」。
