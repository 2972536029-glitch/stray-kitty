# 业务观测迭代 · 总入口文档(另一个开发者从这里开始)

> 本文是业务观测三模块(MR①主线/MR②经营底座/MR③前端 RUM)的自包含总入口:
> 全局约定、环境信息、工作流程、代码落点、验证方法全部在此,配合各模块 plan 文档使用。
> 模块详细规格:`docs/biz-obs-module{1,2,3}-plan.md`。

## 1. 环境

- 仓库本地:`C:\Users\asus\.zcode\workspace\draft-77bf19d0-e626-4548-b57d-49a707907805\stray-kitty`
- 服务端:Go(纯标准库,`server/`),测试 `go -C server test -race ./...`;构建与格式检查:`gofmt -l ./server`、`go -C server vet ./...`
- 前端:React 19 + Vite(`web/`),`npm run typecheck`、`npm test`
- GitLab: school-gitlab.xsolla.dev/haozhe_wang/stray-kitty(个人令牌在 ZCode secrets,不进仓库)
- Datadog:**组织在 us5.datadoghq.com(US5,不是 US1!)**,线上数据(preview)在 US5;
  监控 as-code 定义在 `monitors/monitors.json`,重放脚本 `monitors/apply-monitors.py` 与
  `monitors/apply-synthetics.py`(DD_SITE=us5.datadoghq.com 即可)
- 本地开发**无 Datadog 时一切照常**:obs 包自动 no-op(这是铁律,不要破坏)

## 2. 全局约定(#18 冻结,全文)

1. 指标统一命名 `kitty.<系统>.<对象>`
2. result 四分类:success / replayed / rejected / error;业务结果可扩展(win / lose / retreat)
3. replayed 不计入业务统计的分子和分母
4. 标签取值从配置表枚举;player_id 和 session_id 不能当指标标签
5. 每个模块各建自己的看板,不要多人同时改同一个看板
6. 监控名加模块前缀:`[小猫回家记][业务-主线] xxx`(模块一)、`[业务-经营]`(模块三)、`[业务-前端]`(模块二)
7. obs 包(`server/internal/obs`)只由模块三修改;其他模块只调用现有接口

## 3. 现有代码参考样例(照葫芦画瓢的"葫芦")

### 服务端埋点样例(现有,已上线)
```go
// server/internal/transport/http.go commands 处理器内(现有代码):
commandKind := "unknown"
emit := func(result string) {
    obs.Incr("kitty.command", "type:"+commandKind, "result:"+result)
    obs.Histogram("kitty.command.duration_ms", ms, "type:"+commandKind)
}
// ...校验失败: emit("rejected"); 成功: emit("success"); 幂等命中: emit("replayed")
```

### 指标命名与四分类(冻结)
- 一律 `kitty.` 前缀;tags 全部有限枚举;请求体/用户输入的字符串必须过白名单,枚举外记 `unknown`
- result 分类:success / replayed / rejected / error;业务可扩展 win/lose/retreat
- QA_SIMULATE_* 命令产生的数据打 `qa:true` tag(业务统计排除)

### 已知 API 坑(勿重踩)
- `as_count()` 查询必须配 `sum` 时间聚合(`avg` 会 400:"must use the 'sum' time aggregator")
- monitor query 里不支持多值 tag 括号语法(`env:(a OR b)` 400)
- 指标子指标名是 `.95percentile`,不是 `.p95`

## 4. 前端业务埋点(模块二)

统一封装 `web/src/observability/actions.ts`(已就位):`trackXxx()` 系列函数,
RUM 未初始化时全部 no-op。action 清单(冻结)与接线落点见 `docs/biz-obs-module2-plan.md` §1。
接线时在对应组件调用 `trackXxx()` 即可,不要直接调 SDK。

## 5. 会话底座(模块三独占)

目标:日志携带 `player_id` 与 `session_id`(字段名固定,验收要求告知)。设计要点:
- token 解析处已知 playerID;放入 request context,obs 日志自动提取注入;
- **player_id 是服务端生成 hash,数量随玩家增长,绝不能进 metric tag**(低基数纪律),只进日志;
- obs 包改动仅限"从 ctx 提取并注入日志字段",不动其他逻辑。

## 6. 验证方法(每个 MR 的自验流程)

| 层 | 本地(CI 对等) | 上线后(真实数据) |
|---|---|---|
| 代码 | gofmt/vet/test -race 全绿;前端 typecheck+npm test | — |
| 埋点 | 单测覆盖触发分支;本地 no-op 无异常 | 合并发布后 Datadog Metrics Explorer 查 `kitty.*` 新指标 |
| 看板/监控 | 定义文件就位 | UI 打开确认数据/状态 |

**本地看不到 Datadog 数据是正常的**(no-op)。真实数据验证 = 合并发布后走流程 + Datadog 查询,这是交付验收第 2 条。

## 7. MR 流程

- 分支名:`feat/biz-module1` / `feat/biz-module3` / `feat/biz-module2`
- commit:`feat(obs): ...` 前缀 + 英文短标题 + 中文 body(要点)
- MR:title 同 commit;description 写改动范围/验证结果/边界;正文关联 #18(不写 Closes)
- CI 必须全绿才能合并;合并前确认 main 未漂移(团队节奏快,先 fetch 看一眼)
- 合并后删源分支、本地 main 同步、做内容指纹验证

## 8. 验收(整合人余尧,6 条硬标准)

见对话纪要/#18:①部署上线(preview)②真实数据上报 ③命名符合约定 ④每个新指标一句话说明
⑤前端:RUM 应用名+action 清单告知 ⑥会话底座:日志字段名告知。

## 9. 模块文档索引

- 模块一:`docs/biz-obs-module1-plan.md`(主线与玩法)
- 模块三:`docs/biz-obs-module3-plan.md`(经营与底座)
- 模块二:`docs/biz-obs-module2-plan.md`(前端 RUM;RUM 应用创建规格见该文档 §0——建好后把 applicationId/clientToken 填入 `web/index.html` 的 KITTY_RUM 注入块)
