# 团队试玩部署配置（haozhe-wang 实例 · 三服务形态）

本目录是 stray-kitty 团队试玩实例的**发布工程唯一入口**：镜像构建、清单渲染、离线校验、集群部署脚本都在这里。

## 0. 快速开始

```powershell
# 常规更新：部署最新 origin/main（要求代码已通过 MR 合入）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1
# 部署指定提交（完整 40 位 sha）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Commit <完整sha>
# 首次部署（额外创建拉取镜像 Secret）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Init
# kubeconfig 不在默认位置时
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -KubeConfig <路径>

# 预检已提交版本（默认使用本地 HEAD，不读未提交修改；无网络、镜像或集群操作）
pwsh -NoProfile -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -ValidateOnly
# 改动部署配置后先跑本地离线校验（不碰集群、不碰镜像）
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-PreviewConfig.ps1 -AllowPlaceholder
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-Offline.ps1
```

发布前请配合 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 逐项核对。

## 1. 当前部署架构

```
                       ┌──────────────────────────────┐
  公网 ──▶ LB Service ─▶│ frontend (nginx :8080)        │  唯一公网入口
        34.94.113.80*   │  静态文件 + /api 反代         │
                       └──────────┬───────────────────┘
                                  │ 集群内 DNS
                       ┌──────────▼───────────────────┐
                       │ game (Go API :8080) ClusterIP │  游戏进程 + 存档
                       │  PVC: stray-kitty-preview-data│  (/data/game.json)
                       └──────────┬───────────────────┘
                                  │ PAYMENT_URL=http://stray-kitty-payment:8082
                       ┌──────────▼───────────────────┐
                       │ payment (Go :8082) ClusterIP  │  支付判定 + 权威账本
                       │  PVC: stray-kitty-payment-data│  (/data/payments.json)
                       └──────────────────────────────┘
```

\* 公网 IP 由 LB 动态分配，以 `kubectl get svc stray-kitty-preview` 输出为准，不固定写在任何配置里。

三个 Deployment 均为**单副本 + Recreate 策略**：更新时先杀旧 Pod 再建新 Pod（短暂停机），换来的是「同一时刻只有一个进程读写各自的 PVC」。游戏存档与支付账本的数据所有权彻底分离：游戏只写 `game.json`，支付只写 `payments.json`，充值入账由游戏编排（`Game.ApplyCharge`），互不越界。

## 2. 三服务职责与关系

| 服务 | Deployment | 职责 | 数据 |
| --- | --- | --- | --- |
| frontend | `stray-kitty-frontend` | nginx 托管 Vite 构建产物，`/api` 反代到 game | 无状态 |
| game | `stray-kitty-game` | 游戏 API（会话、剧情、家居、战斗、充值编排） | 存档 PVC（`game.json`） |
| payment | `stray-kitty-payment` | 支付判定（4242 必成功 / 0000 必失败 / 其余温和拒绝）与权威账本 | 账本 PVC（`payments.json`） |

充值数据流：

```
浏览器 → nginx(/api) → 游戏 /api/payment/charge
                        └→ 支付 /internal/charge（判定 + 记权威账本 payments.json）
                        └→ Game.ApplyCharge（游戏事务：入账金枪鱼 + 展示流水落 game.json）
浏览器 ← {status, tunaBalance, healingMsg...}（对外契约与单体时代完全一致，前端零改动）
```

支付服务不可达时游戏返回 503 `PAYMENT_UNAVAILABLE`，余额不动——支付故障不拖垮游戏进程，反之亦然。

## 3. Docker 镜像构建与推送流程

| 镜像 | Dockerfile | 构建上下文 | 说明 |
| --- | --- | --- | --- |
| `…/{game}` | `Dockerfile.game` | 仓库根 | golang:1.26-alpine 编译 `cmd/api` → alpine:3.23 运行 |
| `…/{payment}` | `Dockerfile.payment` | 仓库根 | 编译 `cmd/paymentd` → alpine:3.23 运行 |
| `…/{frontend}` | `Dockerfile.frontend` | 仓库根 | node:24 Vite 构建 → nginx-unprivileged 托管 |

（`…/` = `school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty`，见 `release-settings.json`。）

版本规则：

- **tag = 发布 commit 的完整 40 位 SHA**（`--build-arg BUILD_REVISION=<sha>` 同时写入镜像 LABEL）；
- 三个镜像**必须出自同一 commit**（脚本在同一个临时 worktree 里依次构建，天然保证）；
- K8s 清单里按 `仓库@sha256:<digest>` **钉死 digest**，且 `Test-PreviewConfig.ps1` 会拒绝任何不以合法 digest 引用项目仓库镜像的清单；
- Deployment 带 `stray-kitty/source-commit` 注解（Deployment 与 Pod 模板两层），线上版本可随时用 kubectl 回查。

推送目标为 GitLab 项目 Container Registry；凭据由 `git credential fill` 获取，`docker login --password-stdin` 接收密码，不创建明文密码临时文件。仅首次部署 `-Init` 且拉取镜像 Secret 不存在时，临时创建 `.dockerconfigjson` 文件供 `kubectl create secret` 读取，结束后删除。

## 4. Kubernetes 资源结构

清单来源：`k8s/preview.template.json`（v1 List，共 8 个对象）→ `Prepare-Preview.ps1` 渲染为 `rendered/preview.json`。

| 对象 | 名称 | 要点 |
| --- | --- | --- |
| PVC ×2 | `stray-kitty-preview-data` / `stray-kitty-payment-data` | 各 1Gi RWO，默认 StorageClass（`standard-rwo`，GCE 单分区盘 → 有分区亲和） |
| Deployment ×3 | `stray-kitty-{game,payment,frontend}` | 单副本 Recreate、`revisionHistoryLimit: 3`（**滚动历史仅保留 3 版**，影响回滚深度）；非 root、只读根文件系统、禁特权提升、不挂 SA 令牌；game/payment 引用拉镜像 Secret |
| Service ×3 | `stray-kitty-game` / `stray-kitty-payment`（ClusterIP）+ `stray-kitty-preview`（LoadBalancer，唯一公网口，指向 frontend） | 前端经 `PAYMENT_URL` 集群内 DNS 调支付 |

game 容器关键环境变量：`GAME_ADDR=0.0.0.0:8080`、`GAME_DATA_FILE=/data/game.json`、`PAYMENT_URL=http://stray-kitty-payment:8082`、`ADVISOR_API_KEY`（可选 Secret `stray-kitty-preview-advisor` 注入，未创建时本地回退）。payment 容器另有 Xsolla 沙盒接入（可选 Secret `stray-kitty-preview-xsolla`：merchant-id / project-id / api-key / webhook-secret / return-url / internal-token）：**存在 `XSOLLA_API_KEY` 时 paymentd 以 Xsolla 形态启动（跳转支付 + webhook），否则 mock 演示卡形态**；当前集群未创建该 Secret，运行于 mock 形态。

三个容器均定义了 K8s 探针（这就是「READY 1/1」的真实含义）：

| 服务 | startupProbe | readinessProbe | livenessProbe |
| --- | --- | --- | --- |
| game | `/healthz` | **`/readyz`** | `/healthz` |
| payment | `/healthz` | **`/readyz`** | `/healthz` |
| frontend | — | `/healthz` | `/healthz` |

即 game/payment 的 Pod 显示 `1/1 Ready` 时，kubelet 已持续通过其 `/readyz` 端点——部署后验证（第 8 节）可以此为基础分层展开。

以上结构约束全部由 `Test-PreviewConfig.ps1` 离线断言（单副本 Recreate、ClusterIP 拓扑、PVC 归属、非 root、digest 镜像、清单中不得出现凭据样式字符串等），`Test-Offline.ps1` 另做负向用例（篡改清单必须被拒绝）。

## 5. 部署所需环境与工具

| 工具 | 用途 | 说明 |
| --- | --- | --- |
| PowerShell 7（`pwsh`） | 运行部署/渲染/校验脚本 | Windows 自带的 5.1 不保证兼容 |
| Docker Desktop | `docker build` / `docker push` | 需登录态可用；构建使用 `--platform linux/amd64` |
| kubectl | 应用清单、等滚动、验证 | 版本建议与集群 v1.34 对齐（±1） |
| git | worktree、fetch、凭据助手 | 凭据助手需已存有 school-gitlab 的账号令牌 |
| kubeconfig | 集群访问 | 默认取 `$env:KUBECONFIG`（取分号分隔的第一段），否则 `%USERPROFILE%\Desktop\xsolla\cn-haozhe-wang.kubeconfig`，可用 `-KubeConfig` 覆盖 |

## 6. 凭据与权限要求

本文件与仓库**不得出现任何真实凭据**（`Test-PreviewConfig.ps1` 也会扫描清单中的凭据样式字符串）。所需凭据只存在于：

1. **GitLab Registry**：本机 git 凭据助手（`git credential fill` 现取现用）；集群侧拉镜像 Secret `stray-kitty-preview-registry`（首次部署 `-Init` 创建）。
2. **集群 kubeconfig**：命名空间级 ServiceAccount（`cn-haozhe-wang` 内全资源 CRUD；无 nodes/PV/StorageClass/namespace 等集群级权限）。
3. **阿策模型 key（可选）**：集群 Secret `stray-kitty-preview-advisor`（字段 `api-key`），不存在时游戏回退本地逻辑。
4. **Xsolla 沙盒（可选）**：集群 Secret `stray-kitty-preview-xsolla`（merchant-id / project-id / api-key / webhook-secret / return-url / internal-token），不存在时 payment 以 mock 演示卡形态运行。

## 7. 完整部署操作步骤

脚本流程（`Deploy-Preview.ps1`）：

1. `git fetch origin main` 取发布提交（默认 `rev-parse origin/main`，或 `-Commit` 指定）。
   **fetch 语义说明**：Git ≥ 1.8.4 时 `git fetch origin main` 除了写 `FETCH_HEAD`，也会顺带更新远程跟踪引用 `refs/remotes/origin/main`（本机已实测：fetch 输出出现 `eb08934..704b111  main -> origin/main`）；更早版本只更新 FETCH_HEAD。**人工预检查建议一律用 `git fetch origin`**（按配置 refspec 全量刷新，语义无歧义）——发布清单里已按此执行。若要绝对保险，可在跑脚本前自行 `git fetch origin` 一次，脚本内的 fetch 只会得到相同结果（幂等）；
2. 在 `%TEMP%` 下使用带随机 ID 的临时 worktree，**源码、三个 Dockerfile、`.dockerignore`、渲染与校验脚本、K8s 模板和发布设置全部来自指定 commit**；各次执行的临时目录相互隔离，但仍禁止两个发布同时操作同一个集群环境；
3. 凭据助手登录 Registry；
4. 依次构建 game → payment → frontend 三个镜像（tag=commit SHA）并推送，记录各自的 sha256 digest；
5. 使用指定 commit 内的 `Prepare-Preview.ps1` 渲染并离线校验，产物暂存于随机临时目录；随后将 `preview.json` 和 `release.json` 归档到当前仓库 `deploy/team-preview-haozhe/releases/<commit>/<UTC时间>/`，归档默认被 Git 忽略；
6. `kubectl apply`（namespace `cn-haozhe-wang`，context `haozhe-wang@gcp-k8s-xsolla-school-experiments`，来自 `release-settings.json`）；
7. 删除单体时代遗留 Deployment `stray-kitty-preview`（`--ignore-not-found`，仅此固定名称）；
8. 依次等待 payment → game → frontend rollout（各 300s 超时）。任何原生命令退出码非零都会立即停止、返回失败状态，不再继续误报部署成功；
9. 先通过集群内 `/readyz` 独立校验 Payment（此端点当前只表示进程就绪，未执行账本读写测试），再查询 LoadBalancer IP 并请求公网 `/healthz`；所有验证成功后将发布归档状态标记为 `deployed`。

操作约定：

- **常规更新**直接跑不带参数（代码必须已 MR 合入 main）；
- **部署指定提交**用 `-Commit <完整sha>`（如回滚验证）；
- 改过本目录任何模板/脚本后，先跑第 0 节的两条离线校验再碰集群；
- **不要同时向同一个命名空间执行两次发布**（虽然新版 worktree 路径随机隔离，但 K8s Deployment 仍会相互覆盖）。

## 8. 部署成功的判断标准

新版脚本在任一 rollout、Payment `/readyz` 或公网 `/healthz` 失败时立即返回非零退出码，只有全部验证通过才标记 `deployed`。但探针无法替代业务级验收；可按以下四条人工复核：

```powershell
$k = "-n","cn-haozhe-wang","--context","haozhe-wang@gcp-k8s-xsolla-school-experiments"
# ① 三个 Deployment 均 1/1 可用、Pod Running
kubectl @k get deployments,pods
# ② source-commit 注解 == 本次发布 commit（40 位）
kubectl @k get deployments -o jsonpath='{range .items[*]}{.metadata.name}{"  "}{.metadata.annotations.stray-kitty/source-commit}{"\n"}{end}'
# ③ 公网 healthz 返回 ok
$ip = kubectl @k get svc stray-kitty-preview -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
Invoke-RestMethod "http://$ip/healthz"
# ④ 支付可用性——三层检查（见下方「支付健康检查」一节）
kubectl @k rollout status deployment/stray-kitty-payment --timeout=30s
kubectl @k exec deployment/stray-kitty-payment -- wget -qO- http://127.0.0.1:8082/healthz
```

### 支付健康检查（三层，按序执行）

公网 `/healthz` 只穿透 nginx→game，**覆盖不到 payment**（payment 是 ClusterIP，不经公网暴露）。payment 服务自身提供三个只读无副作用端点（代码确认：`server/internal/integrations/payment/httpapi.go`）：

| 端点 | 响应 | 副作用 |
| --- | --- | --- |
| `GET /healthz` | `200 {"status":"ok"}` | 无 |
| `GET /readyz` | `200 {"status":"ready","storage":"payment-ledger"}` | 无 |
| `GET /metrics` | Prometheus 文本（请求/错误计数） | 无 |

**第 1 层 · Pod/Deployment 就绪**：`kubectl get pods` 中 payment `1/1 Running` + `rollout status` 成功。由于模板为 payment 定义了 readinessProbe（`/readyz`），这一层已经隐含一次由 kubelet 持续执行的真实 HTTP 健康检查。

**第 2 层 · payment 独立健康检查（无副作用，推荐）**：在集群内直接打健康端点，任选其一：

```powershell
# 方式 A：exec 进容器用 busybox wget（payment 镜像基于 alpine，自带 wget）
kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments exec deployment/stray-kitty-payment -- wget -qO- http://127.0.0.1:8082/readyz
# 方式 B：port-forward 到本地再 curl（当前 ServiceAccount 具备 pods/exec 与 portforward 权限）
kubectl -n cn-haozhe-wang --context haozhe-wang@gcp-k8s-xsolla-school-experiments port-forward svc/stray-kitty-payment 18082:8082
# 另开终端：Invoke-RestMethod http://127.0.0.1:18082/readyz
```

**第 3 层 · 游戏→支付端到端**：**当前不存在无业务副作用的公网端到端探针**（如实说明，不虚构）：

- `GET /api/payment/config` 虽会端到端调用 payment 的 `/internal/provider`（只读），但**失败时游戏静默降级返回 `{"provider":"mock"}`**（`payment_remote.go` 的 `Provider()`），payment 正常（mock 形态）与不可达的响应无法区分，不能作探针；
- 唯一可靠的公网端到端信号是演示卡充值：用 `0000` 开头必失败卡号打 `POST /api/payment/charge`，**HTTP 200 + `status:"declined"` = 全链路通；503 `PAYMENT_UNAVAILABLE` = payment 不可达**。⚠️ 有业务副作用：只要 payment 可达，**即使 declined 也会在权威账本 `payments.json` 和游戏展示流水中各落一条记录**（代码路径 `Decide → ledger.Record` 无条件执行）；服务不可达时（503）才零写入。建议用固定的探针玩家 ID（如 `deploy-probe`）把痕迹限制在可识别范围；
- 若需要真正的无副作用端到端检查，**需要新增能力**（本轮未实施）：例如让游戏侧把 payment 不可达暴露成可观测信号（`/api/payment/config` 返回降级标记或 503），或在 nginx 增加一条只读反代路径指向 payment 的 `/readyz`。

## 9. 常见故障与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Pod `Pending`，事件 `didn't match PersistentVolume's node affinity` + `Too many pods` + `max node group size reached` | 账本/存档 PVC 是 GCE 单分区盘，只能调度到该分区的节点；该分区节点 Pod 数被占满（共享集群，占位的多为其他命名空间负载） | 只能等容量释放（调度器会自动重试）或联系集群管理员扩节点组；不要删 PVC 重建——会丢存档/账本。参考实例：2026-10-31 payment 因此 Pending 数小时 |
| 充值返回 503 `PAYMENT_UNAVAILABLE` | payment Pod 未就绪（如上）或滚动中 | 按设计降级，游戏不受影响；先查 payment Pod 状态 |
| `FailedScheduling: Insufficient cpu/memory` | 节点资源不足 | 与上面区分开：这条才是资源问题，可等或找管理员 |
| `ImagePullBackOff` | 拉镜像 Secret 缺失/过期，或 digest 不存在 | 确认首次部署带过 `-Init`；确认推送成功 |
| 构建阶段报「无法从 git 凭据助手取得 registry 凭据」 | 本机没存 school-gitlab 凭据 | 先对仓库做一次需要鉴权的 git 操作让凭据助手存上 |
| 脚本开头 worktree 相关报错 | 上次部署异常中断残留 worktree | 脚本会自动 `--force` 清理；若仍失败手动 `git worktree prune` |
| healthz 超时/IP 为空 | LB 尚未分配 IP（首次部署）或 frontend 未就绪 | 稍后 `kubectl get svc` 重查；确认 frontend rollout 完成 |
| 同时两处跑部署互相报错 | 临时 worktree 路径固定 | 避免并发；确认没有别的终端/CI 在跑 |

## 10. 当前部署方式的局限性

1. **依赖个人电脑**：Docker、kubeconfig、GitLab 凭据都在本机，换机器无法发布，也无发布审计；
2. **尚未完成端到端故障注入测试**：`Invoke-NativeChecked` 已检测原生命令非零退出码；但完整镜像构建、Registry、K8s 依赖的多阶段发布尚未经过实际演练；
3. **healthz 不覆盖 payment**：公网探活只证明 nginx+game 存活；
4. **回滚尚无一键入口**（详见 RELEASE_CHECKLIST.md「回滚注意事项」）：`-Commit <旧sha>` 会重建镜像，并非恢复原 digest；`rollout undo` 依赖保留的 ReplicaSet；现在已按 commit/时间归档当次 manifest 和 digest，日后可用于精确恢复，但恢复动作仍需人工审查执行；
5. **发布记录仍存于操作者本机**：`releases/<commit>/<UTC时间>/` 自动保留 manifest、digest、状态和时间（已被 Git 忽略）；没有统一的 GitLab Release / CI Artifact 审计与跨机器归档，迁移时需要设计留存策略；
6. **Recreate 停机窗口**：单副本策略每次更新三个服务各有数秒到数十秒不可用（换 PVC 数据安全，属有意取舍）。

---

与 `deploy/team-preview/`（单体形态）的关系：单体 Dockerfile 与流程保留给 cn-qiwen-yan 实例参考；本目录是三服务演进版。本地开发（`npm run dev`）仍为单体形态：`PAYMENT_URL` 未设置时支付网关进程内运行，CI 与既有测试不受影响。
