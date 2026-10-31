# Stray Kitty 发布检查清单

每次发布（`pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1`）前后逐项勾选。
命令里的集群参数：`-n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments`。

## 一、发布前

- [ ] 本机 Docker Desktop 已启动、kubectl 可用、git 凭据助手存有 school-gitlab 凭据
- [ ] 没有其他终端/CI 在向同一个集群命名空间发布（新版临时 worktree 已随机隔离，但线上资源仍会相互覆盖）
- [ ] 确认发布目标：默认为最新 `origin/main`；先刷新远端引用并记录发布 commit
  ```powershell
  git fetch origin; git log -1 --oneline origin/main
  ```
  （用全量 `git fetch origin` 而非 `git fetch origin main`：后者在 Git ≥1.8.4 也会顺带更新 `origin/main`，但全量 fetch 按配置 refspec 刷新、语义无歧义）
- [ ] 该 commit 在 GitLab 上流水线为 **success**（web_checks / server_checks / server_build 全绿）
- [ ] 已查看线上当前版本，并 diff 了「线上 → 本次发布」的变更，重点过一遍 `server/internal/domain`（存档格式）与 `server/internal/transport`（API）：
  ```powershell
  $online = kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments get deployment stray-kitty-game -o jsonpath='{.metadata.annotations.stray-kitty/source-commit}'
  git log --oneline $online..origin/main
  git diff --stat $online..origin/main -- server
  ```
- [ ] 存档/账本兼容性确认：`GameState` 新增字段（如 `homeLayout`、`homeRepairs`）或 `payments.json` 结构变化时，评估「新代码写过的数据能否被旧代码读」——**回滚会丢新字段**（见文末回滚注意事项）
- [ ] 目标 commit 的只读预检通过（只需 Git，本地无网络、镜像或集群操作）：`pwsh -NoProfile -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -ValidateOnly`
- [ ] 若改过本目录模板/脚本：离线校验已通过
  ```powershell
  pwsh -NoProfile -File deploy/team-preview-haozhe/Test-PreviewConfig.ps1 -AllowPlaceholder
  pwsh -NoProfile -File deploy/team-preview-haozhe/Test-Offline.ps1
  ```

## 二、构建阶段（由部署脚本自动执行，结束时人工核对输出）

- [ ] 脚本开头打印的「发布提交」== 发布前记录的 commit（40 位）
- [ ] 三个镜像均出现「构建镜像 …」+「推送镜像 …」且各自打印了 `@sha256:<64 位>` digest
- [ ] 三个镜像 tag 中的 commit 完全一致（同一 worktree 构建，正常必然一致；出现不一致立即停止）
- [ ] 出现「渲染部署清单」且无报错（内含 Test-PreviewConfig 校验，失败会 throw）
- [ ] 任何一步 throw（镜像构建失败 / 推送失败或未取得 digest）→ 终止发布，不带病继续

## 三、部署阶段

- [ ] `kubectl apply` 输出中两个 PVC 的状态**与部署类型匹配**：
  - **日常更新**：两个 PVC 应为 `unchanged`（若出现 `configured` 需立即停手排查——PVC 规格不应被改动）；
  - **首次部署（`-Init`）**：两个 PVC 应为 `created`（属预期；若已存在则为 `unchanged`，也正常）；
  - 任何情况下 PVC 都不应出现 `configured` / `conflict`。
- [ ] 三个 Deployment 为 `configured`，三个 Service 状态符合预期
- [ ] 依次出现三次滚动等待；**必须看到三条 `successfully rolled out`**（payment → game → frontend）。
  ⚠️ 新版脚本若 rollout 超时应立即返回非零退出码，并将发布归档状态写为 `failed`。禁止将 `kubectl apply` 成功当成部署成功。
- [ ] 确认目标是 `cn-haozhe-wang` 命名空间、`haozhe-wang@gcp-k8s-xsolla-school-experiments` context（脚本取自 release-settings.json，输出里可见）

## 四、部署后

- [ ] `kubectl get pods`：三个 Pod 全部 `1/1 Running`，无 Pending/ImagePullBackOff/CrashLoopBackOff
- [ ] source-commit 注解 == 本次发布 commit，且三个 Deployment 一致：
  ```powershell
  kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments get deployments -o jsonpath='{range .items[*]}{.metadata.name}{"  "}{.metadata.annotations.stray-kitty/source-commit}{"\n"}{end}'
  ```
- [ ] 镜像 digest 与脚本结尾打印的三个 digest 一致（防串版本）：
  ```powershell
  kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments get deployments -o jsonpath='{range .items[*]}{.metadata.name}{"  "}{.spec.template.spec.containers[0].image}{"\n"}{end}'
  ```
- [ ] 公网 healthz 返回 `ok`（IP 以 LB 实际输出为准）：
  ```powershell
  $ip = kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments get svc stray-kitty-preview -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
  Invoke-RestMethod "http://$ip/healthz"
  ```
- [ ] **payment 三层可用性检查**（公网 healthz 只穿透 nginx→game，覆盖不到 payment）：
  - **第 1 层 · 就绪**（Pod 已含 `/readyz` readinessProbe，`1/1` 即代表探针通过）：
    ```powershell
    kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments rollout status deployment/stray-kitty-payment --timeout=30s
    ```
  - **第 2 层 · 独立健康（无副作用，推荐）**：
    ```powershell
    kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments exec deployment/stray-kitty-payment -- wget -qO- http://127.0.0.1:8082/readyz
    # 期望 {"status":"ready","storage":"payment-ledger"}；/healthz、/metrics 同样只读可用
    ```
  - **第 3 层 · 端到端（有业务副作用，酌情执行）**：公网 `POST /api/payment/charge`，用 `0000` 开头必失败演示卡 + 固定探针玩家 ID（如 `deploy-probe`）——期望 HTTP 200 且 `status:"declined"`（全链路通）；503 `PAYMENT_UNAVAILABLE` = payment 不可达。⚠️ 只要 payment 可达，declined 也会在权威账本与游戏流水各落一条记录（服务不可达时才零写入）。注意：`GET /api/payment/config` **不能**当探针——payment 不可达时游戏静默降级返回 mock，响应无区分度。
- [ ] 记录本次发布结果（复制留存或贴到群/MR）：

  ```
  发布时间（本地）：
  操作人：
  commit：<40 位 sha>（一句话说明主要内容）
  镜像 digest：game @sha256:… / payment @sha256:… / frontend @sha256:…
  结果：成功 / 部分成功（注明）/ 失败（注明现象与处理）
  备注：（如 payment Pending 等已知集群容量问题的现场记录）
  ```
- [ ] **核对自动归档**：查看 `deploy/team-preview-haozhe/releases/<commit>/<UTC时间>/preview.json` 和 `release.json`，确认 manifest SHA256、三镜像 digest、部署状态与时间；本地归档默认被 Git 忽略，需按团队保留策略转存。

## 回滚注意事项（当前无一键回滚，手工操作要点）

三种途径的**真实能力边界**（已核对脚本与模板，勿高估）：

1. **`kubectl rollout undo deployment/<名>`**：回退到上一版 Pod 模板（digest 随之回退）。⚠️ 受 `revisionHistoryLimit: 3` 限制，**只能回退最近 3 版**，更早版本 RS 已被清理。
2. **`Deploy-Preview.ps1 -Commit <旧sha>`**：按旧 commit **重新构建**镜像再发布。⚠️ 这**不是精确恢复**——重建产物的 digest 不保证与当年一致，且同名 tag 会被新 digest 覆盖（等于"复刻"而非"复原"，内容等价但不可_bitwise_对齐）。
3. **按历史 digest 精确恢复**：`Deploy-Preview.ps1` **不支持**（它总是先构建推送）。可行手工路径：取得历史三个 digest（来源：发布归档的 release.json，或集群 `kubectl get rs -o jsonpath='{.items[*].spec.template.spec.containers[0].image}'` 反查）→ 手工调 `Prepare-Preview.ps1 -GameImage <repo@sha256:…> -PaymentImage … -FrontendImage … -SourceCommit <旧sha>` 渲染 → `kubectl apply -f rendered/preview.json`。

- **数据不回滚**：PVC 里的 `game.json` / `payments.json` 不会被任何回滚途径恢复。若新版已写入新增字段（如 `homeLayout`），旧版代码加载时会**静默丢弃这些字段并在下次落盘时抹掉**——回滚前先评估数据损失。
- **前后端必须同 commit 一起回退**：API 命令校验是严格白名单（旧后端会拒绝新前端的多余字段/新命令，如 `REPAIR_HOME` 的 `repairId`、`SAVE_HOME_LAYOUT`）。
- payment 与 game 可独立回退（支付 HTTP 契约近版本未变时）；跨大版本回退前先 diff `server/internal/integrations/payment`。
- **现在已自动归档**：发布 commit、三镜像 digest、渲染 manifest、release.json 与状态。本地归档目录已被 Git 忽略，仍建议将审核通过的发布记录转存到团队可访问的位置，避免仅保存在一个人的电脑上。
