# 团队试玩部署配置

为 `cn-qiwen-yan` 准备独立的猫猫游戏与阿策 AI 试玩实例。目录中的 PowerShell 脚本只做本地校验和生成文件，不连接 Kubernetes、不构建或推送镜像，也不发布服务。现有 CI 没有自动部署步骤。

**本分支只准备配置，尚未选定发布版本。** 基线 `575aa3fa3ad9a84dc4219e4c67c4ce4ff5767794` 的 main 尚未包含远程阿策实现。必须等美术、阿策以及本目录的配置进入同一个经过验收的发布提交，再构建镜像。这里的阿策环境变量依据 `feat/battle-advisor-model` 的 `c9dee6bcde81447e4f87d9b4bc200cde6473f8a4` 核对；发布时以最终实现为准。

## 目标与资源

| 项目 | 配置 |
| --- | --- |
| Kubernetes context | `qiwen-yan@gcp-k8s-xsolla-school-experiments` |
| 已有命名空间 | `cn-qiwen-yan` |
| Deployment / Service | `stray-kitty-preview` |
| 存档 PVC | `stray-kitty-preview-data`，1 Gi，ReadWriteOnce |
| 镜像仓库 | `school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game` |
| 拉取镜像 Secret | `stray-kitty-preview-registry`，类型 `kubernetes.io/dockerconfigjson` |
| 阿策 Secret | `stray-kitty-preview-advisor`，字段 `api-key` |
| 阿策设置 | `ADVISOR_BASE_URL=https://api.deepseek.com`，`ADVISOR_MODEL=deepseek-flash` |
| 阿策配额 | 同时 4 个请求；单进程每天最多尝试 200 次，按最终服务端实现解释 |
| 入口 | LoadBalancer 的 80 端口转发到游戏 8080 端口 |

清单只有 PVC、Deployment、Service 三个独立资源，不创建 Namespace。游戏不需要 Kubernetes API 凭据。模型密钥和镜像拉取凭据由部署时的 Secret 提供，不写入 Git、镜像或浏览器。

Service 创建后，云平台才会尝试分配公网地址；清单不预填其他项目的 IP、nodePort 或云资源注解。最终地址须以 Service 实际分配结果为准。默认入口是 `http://<EXTERNAL-IP>`；域名、HTTPS 和成员访问控制需要另行配置。云端配额和资源供应情况需在部署时确认。

## 文件与本地检查

- `k8s/preview.template.json`：未选择镜像的 Kubernetes 模板。
- `release-settings.json`：非秘密目标配置；`sourceCommit`、`imageDigest` 留空。
- `Dockerfile` 与 `Dockerfile.dockerignore`：前端、Go 服务和带 CA 证书的非 root 运行镜像；构建输入限制在源码范围。
- `Test-PreviewConfig.ps1`：检查命名空间、资源关系、持久化、Secret 引用和镜像 digest。
- `Prepare-Preview.ps1`：用最终镜像 digest、源码提交生成 `rendered/preview.json` 与 `rendered/release.json`，记录清单 SHA-256。
- `Test-Offline.ps1`：运行模板、错误配置拒绝、生成结果与哈希的离线回归检查。测试使用的假 digest 和假提交号只写入被忽略的 `test-output/`。

从仓库根目录使用 PowerShell 7 执行：

```powershell
pwsh -NoProfile -File deploy/team-preview/Test-PreviewConfig.ps1 -AllowPlaceholder
pwsh -NoProfile -File deploy/team-preview/Test-Offline.ps1
```

`-AllowPlaceholder` 仅供模板校验；不加该参数时，未选镜像会被拒绝。**不要直接把模板交给 kubectl apply**：占位镜像不会阻止 Kubernetes 创建其中的 PVC 和公网 Service。本地校验也不能替代部署时的 API 校验与业务验收。

## 发布前的准备

以下步骤供正式部署时执行，当前没有发布镜像或公网网址。

1. 确认美术和阿策已在最终发布提交中，运行项目规定的检查与浏览器验收。记录完整提交 SHA、contentVersion 和存档版本。核对阿策 API、环境变量、模型名称和启动路径，不能仅凭构建成功或探针 200 判断 AI 可用。
2. 从该提交取得干净源码，使用本目录 Dockerfile 构建镜像。**构建上下文必须是仓库根目录**，不能是 `deploy/team-preview/`；`Dockerfile.dockerignore` 保持与 Dockerfile 相邻。先确认节点架构。下面示例适用于 `linux/amd64`：

   ```powershell
   # 在最终发布提交的干净仓库根目录中；这一步在正式发布时才执行。
   $releaseCommit = (git rev-parse HEAD).Trim()
   $releaseTag = "school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game:$releaseCommit"
   docker build --platform linux/amd64 --build-arg "BUILD_REVISION=$releaseCommit" -f deploy/team-preview/Dockerfile -t $releaseTag .
   # 成功后按团队认证方式推送，记录 Registry 返回的真实 digest。
   ```

3. 将镜像推送后核实 digest 和 OCI `org.opencontainers.image.revision`。再在 PowerShell 中执行以下离线生成步骤；先将 `$releaseImage` 设置为该仓库真实的 `.../game@sha256:<64 位摘要>`：

   ```powershell
   ./deploy/team-preview/Prepare-Preview.ps1 -Image $releaseImage -SourceCommit $releaseCommit
   ./deploy/team-preview/Test-PreviewConfig.ps1 -ManifestPath ./deploy/team-preview/rendered/preview.json
   ```

   生成脚本检查格式并记录输入，不能离线证明某个镜像确实由该提交构建；两者关系需通过构建记录和镜像元数据核实。生成文件被 Git 忽略，保留作发布记录。

## 正式部署和验收顺序

1. 每条 kubectl 命令显式指定上述 context 和 namespace。核对同名资源是否属于本试玩，确认默认 StorageClass、PVC 供应能力、资源配额和两个 Secret。清单未指定 StorageClass；没有默认类时，应先确定可用类。
2. 对生成清单做服务端 dry-run 与 diff。先从 `items` 中取出 PVC 和 Deployment 进行部署，暂不创建 Service。等待 PVC Bound、Deployment Ready，再通过临时端口转发验证。
3. 在测试会话中验证网页、游戏存档和真正的阿策模型调用。阿策响应必须有 `source=model`，页面显示“阿策 · 模型建议”；`source=local` 或 HTTP 200 不能作为模型联通证据。`/healthz`、`/readyz` 也不验证模型或完整业务。
4. 首次发布时验证重建 Pod 后，同一浏览器会话仍能恢复进度。确认完成后再创建 LoadBalancer Service，等待实际 EXTERNAL-IP，并从公网重复验证首页、API 和阿策。记录真实网址、镜像 digest、清单哈希及验收结果。

Secret 内容与会话令牌不写入日志、提交或公开验收记录。此配置没有成员登录门槛；得到链接的人可以访问试玩。阿策的请求限制不等于整个游戏接口的通用访问限流。

## 后续更新与存档

游戏目前把状态保存在 `/data/game.json`，因此使用单副本和 `Recreate` 更新，整个 `/data` 挂载 PVC 以支持原子写入。更新会短暂停机，应避开试玩中的战斗结算与阿策请求。镜像引用使用固定 digest；不要改成 `latest`。

每次更新前备份存档并记录对应源码和镜像。若 schemaVersion 或 contentVersion 改变，先确认迁移或新档方案；不能保证新旧镜像自动兼容同一份存档。回滚也要检查存档兼容性。

更新时保留 Service、PVC 名称和标签，只调整需要变更的配置。保留 Service 通常可以保持现有入口，删除重建可能更换 IP；浏览器会话凭据按 origin 保存，更换 IP、域名或协议后不会自动沿用旧入口的会话。停止试玩时默认保留 PVC 与备份，存档清理应单独决定。
