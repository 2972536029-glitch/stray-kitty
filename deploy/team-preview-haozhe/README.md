# 团队试玩部署配置（haozhe-wang 实例）

本目录由 `deploy/team-preview/`（cn-qiwen-yan 实例配置）适配而来，目标改为本人的命名空间，其余结构与约束保持一致。校验脚本只做本地校验和生成文件；`Deploy-Preview.ps1` 在此之上提供一键部署/更新。

## 一键部署

```powershell
# 常规更新：部署最新 main（要求代码已通过 MR 合入）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1
# 部署指定提交
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Commit <完整sha>
# 首次部署（额外创建拉取镜像 Secret，并应用 PVC 与 LoadBalancer Service）
pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Init
```

脚本流程：临时 worktree 取干净源码 → docker build(linux/amd64) → push GitLab Registry 取 digest → `Prepare-Preview.ps1` 渲染 → kubectl 更新 Deployment → 等待滚动完成 → 验证 healthz 并输出线上地址。kubeconfig 默认取 `$env:KUBECONFIG`，否则 `%USERPROFILE%\Desktop\xsolla\cn-haozhe-wang.kubeconfig`，可用 `-KubeConfig` 覆盖。常规更新只替换 Deployment：Recreate 短暂停机、存档在 PVC 不受影响、Service 不动公网 IP 不变。registry 凭据取自 git 凭据助手，不落盘。

与原目录的差异：

- Kubernetes context：`haozhe-wang@gcp-k8s-xsolla-school-experiments`
- 命名空间：`cn-haozhe-wang`
- 实例标签：`app.kubernetes.io/instance: haozhe-preview`
- `ADVISOR_API_KEY` 的 Secret 引用改为 `optional: true`：未创建 `stray-kitty-preview-advisor` 时可先以本地回退部署，后续补建 Secret 并重启 Pod 即可启用模型问答
- 新增 `Deploy-Preview.ps1` 一键部署脚本（原目录流程仍可照 `deploy/team-preview/README.md` 手工执行）

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
