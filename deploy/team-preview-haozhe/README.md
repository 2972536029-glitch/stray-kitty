# 团队试玩部署配置（haozhe-wang 实例）

本目录由 `deploy/team-preview/`（cn-qiwen-yan 实例配置）适配而来，目标改为本人的命名空间，其余结构与约束保持一致。脚本同样只做本地校验和生成文件，不连接 Kubernetes、不构建或推送镜像。

与原目录的差异：

- Kubernetes context：`haozhe-wang@gcp-k8s-xsolla-school-experiments`
- 命名空间：`cn-haozhe-wang`
- 实例标签：`app.kubernetes.io/instance: haozhe-preview`
- `ADVISOR_API_KEY` 的 Secret 引用改为 `optional: true`：未创建 `stray-kitty-preview-advisor` 时可先以本地回退部署，后续补建 Secret 并重启 Pod 即可启用模型问答

构建、渲染与部署流程照 `deploy/team-preview/README.md` 执行：镜像构建上下文必须是仓库根目录；`Prepare-Preview.ps1` 以镜像 digest 渲染清单；先部署 PVC 与 Deployment 验证，再创建 LoadBalancer Service。

## 目标与资源

| 项目 | 配置 |
| --- | --- |
| Kubernetes context | `haozhe-wang@gcp-k8s-xsolla-school-experiments` |
| 命名空间 | `cn-haozhe-wang` |
| Deployment / Service | `stray-kitty-preview` |
| 存档 PVC | `stray-kitty-preview-data`，1 Gi，ReadWriteOnce |
| 镜像仓库 | `school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game` |
| 拉取镜像 Secret | `stray-kitty-preview-registry` |
| 阿策 Secret | `stray-kitty-preview-advisor`（可选，字段 `api-key`） |
| 入口 | LoadBalancer 80 → 游戏 8080 |
