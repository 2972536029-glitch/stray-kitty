# 团队试玩部署配置（haozhe-wang 实例 · 三服务形态）

本目录把试玩实例拆成三个独立 Deployment：**前端（nginx 托管静态文件并反代 /api）→ 游戏（Go API + 存档 PVC）→ 支付（独立进程 + 自有账本 PVC）**。公网 LoadBalancer 只指向前端；游戏与支付服务均为 ClusterIP，仅集群内可达。数据所有权彻底分离：游戏写 `game.json`，支付写权威账本 `payments.json`，充值入账由游戏编排（`Game.ApplyCharge`），互不越界。

## 一键部署

```powershell
# 常规更新：部署最新 main（要求代码已通过 MR 合入）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1
# 部署指定提交
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Commit <完整sha>
# 首次部署（额外创建拉取镜像 Secret）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Init
```

脚本流程：临时 worktree 取干净源码 → 依次构建三个镜像（game/payment/frontend）→ 推送 GitLab Registry 取 digest → `Prepare-Preview.ps1` 渲染清单 → kubectl 应用全部资源并清理单体时代遗留 Deployment → 依次等待三个服务滚动完成 → 验证公网 healthz。kubeconfig 默认取 `$env:KUBECONFIG`，否则 `%USERPROFILE%\Desktop\xsolla\cn-haozhe-wang.kubeconfig`，可用 `-KubeConfig` 覆盖。registry 凭据取自 git 凭据助手，不落盘。

## 目标与资源

| 项目 | 配置 |
| --- | --- |
| Kubernetes context | `haozhe-wang@gcp-k8s-xsolla-school-experiments` |
| 命名空间 | `cn-haozhe-wang` |
| 前端 | Deployment `stray-kitty-frontend`（nginx unprivileged :8080）+ LB Service `stray-kitty-preview`（公网唯一入口） |
| 游戏 | Deployment `stray-kitty-game`（:8080，ClusterIP）+ 存档 PVC `stray-kitty-preview-data`（沿用单体时代卷，进度保留） |
| 支付 | Deployment `stray-kitty-payment`（:8082，ClusterIP）+ 账本 PVC `stray-kitty-payment-data` |
| 镜像仓库 | `school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/{game,payment,frontend}` |
| 拉取镜像 Secret | `stray-kitty-preview-registry` |
| 阿策 Secret | `stray-kitty-preview-advisor`（可选，字段 `api-key`；未创建时本地回退） |
| 服务间调用 | 游戏 → 支付：`PAYMENT_URL=http://stray-kitty-payment:8082`（集群内 DNS） |

## 充值数据流（拆分后）

```
浏览器 → nginx(/api) → 游戏 /api/payment/charge
                        └→ 支付 /internal/charge（判定 + 记权威账本 payments.json）
                        └→ Game.ApplyCharge（游戏事务：入账金枪鱼 + 展示流水落 game.json）
浏览器 ← {status, tunaBalance, healingMsg...}（对外契约与单体时代完全一致，前端零改动）
```

支付服务不可达时游戏返回 503 `PAYMENT_UNAVAILABLE`，余额不动——支付故障不拖垮游戏进程，反之亦然。

## 与 `deploy/team-preview/`（单体形态）的关系

单体 Dockerfile 与流程保留给 cn-qiwen-yan 实例参考；本目录是三服务演进版。本地开发（`npm run dev`）仍为单体形态：`PAYMENT_URL` 未设置时支付网关进程内运行，CI 与既有测试不受影响。

## 本地校验

```powershell
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-PreviewConfig.ps1 -AllowPlaceholder
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-Offline.ps1
```
