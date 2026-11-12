# MySQL 数据库与 JSON 存档迁移

游戏存档和独立支付账本支持 MySQL 8.4。`GAME_MYSQL_DSN` 控制游戏存储，`PAYMENT_MYSQL_DSN` 控制独立 `paymentd` 账本；未设置时继续使用 `GAME_DATA_FILE` / `PAYMENT_DATA_FILE`。配置了 DSN 后数据库不可用会使启动失败，不会自动回退并创建另一份文件存档。账号、主会话及登录别名、完整游戏状态、QA 恢复快照、命令幂等记录和支付账本均需要迁移。

应用启动负责创建所需表，**不会自动导入 JSON**。显式工具 `db-migrate -source game|payments -file <path>` 使用对应服务的 DSN，只导入空目标；发现已有目标数据即拒绝，不合并、不覆盖。`game` 与 `payments` 是独立的数据集，迁移需分别执行。导入前必须停止全部旧存储写入者。

如果历史环境接过 Xsolla 沙盒 webhook，切换前先核对尚未完成的支付回调。旧游戏状态仅保留最近 50 条展示流水，无法证明更早的权威支付记录是否已完成游戏侧入账；导入不会依据支付账本批量重新充值。新版本持久化 `AppliedPayments`，并从仍保留的游戏流水初始化已处理 ID，之后即使展示流水被裁剪也保留去重依据。

## 本地使用

普通文件模式保持原来的启动方式，不需要 `.env` 或数据库密码：

```powershell
docker compose -f deploy/compose.yaml up -d --build game
```

数据库模式需要 Docker Compose 2.20+。MySQL 仅在 `database` profile 中启动，持久卷为 `kitty-mysql-data`，没有宿主机端口；应用通过 `mysql:3306` 访问。应用使用专用 `stray_kitty` 用户，root 密码只交给 MySQL 容器。[官方 MySQL 镜像](https://hub.docker.com/_/mysql) 支持从文件读取初始化密码。

在仓库根目录执行以下 PowerShell 7 命令，生成不入库的密码文件。已有文件不被覆盖；首次初始化后的密码变更需要先在 MySQL 内执行密码轮换，不能只修改文件。

```powershell
$secretDir = Join-Path (Get-Location) 'deploy/private'
New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
foreach ($name in @('mysql-password', 'mysql-root-password')) {
    $path = Join-Path $secretDir $name
    if (-not (Test-Path -LiteralPath $path)) {
        $password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
        [IO.File]::WriteAllText($path, $password)
    }
    if ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($path))) { throw "Empty password file: $path" }
}
$appPassword = [IO.File]::ReadAllText((Join-Path $secretDir 'mysql-password')).Trim()
$env:GAME_MYSQL_DSN = "stray_kitty:${appPassword}@tcp(mysql:3306)/stray_kitty?parseTime=true"
```

**全新环境**可直接启动；已存在游戏进度时先按下一节迁移，不能先打开空库让玩家继续游戏：

```powershell
docker compose -f deploy/compose.yaml --profile database up -d --build --wait game mysql
docker compose -f deploy/compose.yaml exec game wget -qO- http://127.0.0.1:8080/readyz
```

以后在新的终端启动时也需要设置 `GAME_MYSQL_DSN`，或保存在已忽略的 `deploy/.env` 中。不要把 DSN 写入 `VITE_` 变量、提交、截图或日志。仅启用数据库 profile 并不会自动改变游戏的存储后端。

### 本地旧存档导入

保持上一节的 `GAME_MYSQL_DSN` 环境变量，停止现有应用后备份并导入。下面的临时容器沿用 `game` 的 `kitty-data` 卷，导入期间不会启动 HTTP 服务。目标非空会返回失败；不要清空目标强行重跑，应先查明是否已经完成迁移。

```powershell
docker compose -f deploy/compose.yaml stop game
New-Item -ItemType Directory -Path deploy/private/backups -Force | Out-Null
docker compose -f deploy/compose.yaml cp game:/data/game.json deploy/private/backups/game-before-mysql.json
docker compose -f deploy/compose.yaml --profile database up -d --wait mysql
docker compose -f deploy/compose.yaml build game
docker compose -f deploy/compose.yaml run --rm --no-deps --entrypoint /app/db-migrate game -source game -file /data/game.json
if ($LASTEXITCODE -ne 0) { throw 'Import failed; keep the application stopped.' }
docker compose -f deploy/compose.yaml --profile database up -d --wait game
```

需要迁移独立 `paymentd` 时，在其进程停止、`PAYMENT_MYSQL_DSN` 已设置且地址可达的环境中运行：

```powershell
go -C server run ./cmd/db-migrate -source payments -file /absolute/path/to/payments.json
```

Compose 单体的模拟支付保存在游戏状态中，随 `-source game` 导入；只有部署了独立 `paymentd` 才有单独的 `payments.json`。宿主机 Go 工具不能直接解析 Compose 的 `mysql` 主机名；通过容器执行，或使用已配置的私有数据库地址。

## 团队试玩部署与切换

### CI 分阶段迁移入口

保护分支上的 `Migrate-Database.ps1 -Phase Prepare|Migrate|Finalize` 使用 CI 的 `KUBECONFIG_FILE`，不把 kubeconfig 下载到操作者电脑。三个阶段与常规 `deploy_apply` 共享同一发布资源锁；常规部署还会检查集群中的 `stray-kitty-db-migration-lock`，迁移未完成时拒绝重建应用写入者。

1. 先部署同一 CI commit 的应用镜像，镜像内需有 `db-migrate`、`db-verify`、`db-smoke`。`Prepare` 验证镜像、目标权限、配额及服务端清单 dry-run；创建或复用 MySQL 凭据、数据库与独立备份 PVC，记录一个合成 QA 账号的登录和存档基线。该账号的私人状态仅存 Kubernetes Secret，不进入日志或 artifacts。此阶段不停止对外服务。
2. `Migrate` 必须提供 `BACKUP_PUBLIC_KEY_BASE64`，格式为至少 RSA-3072 的 SPKI 公钥 DER 的 Base64。私钥由恢复负责人离线持有，不能上传 CI。脚本停掉 frontend/payment/game，等旧 Pod 全部退出后，将游戏和支付 JSON 各自复制到独立持久备份 PVC；同时校验源与备份 SHA256。两份快照随后加密为可下载 artifacts，成功后才允许历史支付审计和导入。`db-verify` 对比迁移后的完整旧数据；激活 MySQL 后运行登录、存档、命令重放、沙盒支付及服务重启验证。
3. `Migrate` 成功仍保持 frontend 为 0 副本，状态为 `awaiting-finalize`。下载加密备份并用离线私钥验证可恢复，再运行 `Finalize`。它复核相同镜像与私有 readiness/持久化结果，恢复原 frontend 副本并验证公网健康。

加密备份位于 `deploy/team-preview-haozhe/database-artifacts/db-<pipeline-id>/`；只发布 `*.encrypted.json` 和不含私人数据的 `manifest.json`，CI artifacts 需设置 `when: always`。每份 envelope 使用随机 AES-256-GCM 密钥/nonce，并用 RSA-OAEP-SHA256 包装 AES 密钥，字段为 `version`、`algorithm`、`encryptedKey`、`nonce`、`tag`、`ciphertext`、原始 `sha256`。持久明文快照保留在 `stray-kitty-game-db-backup` / `stray-kitty-payment-db-backup` PVC 的 `/backup/db-<pipeline-id>/`，应用没有挂载这些卷。

迁移步骤失败会保留停机状态、操作 ConfigMap 与备份，绝不自动回退到已过期 JSON；失败操作也不会直接再次导入。先检查记录的 `failureStep` 和快照，再制定恢复或继续方案。`Finalize` 只接受成功完成私有验证的操作。以下手工命令用于理解及维护；实际 CI 迁移使用上述脚本统一记录状态。

目标固定为 `cn-haozhe-wang` 命名空间及 `haozhe-wang@gcp-k8s-xsolla-school-experiments` context。先按现有 MR / main / 手动 `deploy_apply` 流程发布支持数据库的新镜像，**此时不要创建应用连接 Secret**，现有游戏仍用 JSON。游戏、支付及本地单体镜像均包含 `/app/db-migrate`。

`k8s/database.yaml` 是独立基础设施清单，不由日常三服务发布自动创建或删除：MySQL StatefulSet、ClusterIP Service、5Gi 专用 PVC。旧游戏、支付和 TLS PVC 均保留。数据库单实例并不提供高可用；PVC 也不能替代独立备份。

应用模板仅可选引用 `stray-kitty-preview-database` 的 `game-dsn` / `payment-dsn`，Secret 缺失时保留文件模式。初始化/导入使用另一份 `stray-kitty-database-migration` Secret，避免提前切换线上进程。

### 1. 创建数据库与迁移凭据

在仓库根目录使用 PowerShell 7，显式给出已有 kubeconfig 路径；不要依赖本机当前 kubectl context。

```powershell
$kubeConfig = 'C:/path/to/cn-haozhe-wang.kubeconfig'
$k = @('--kubeconfig', $kubeConfig, '--context', 'haozhe-wang@gcp-k8s-xsolla-school-experiments', '-n', 'cn-haozhe-wang')
$bundle = 'deploy/team-preview-haozhe'
$private = Join-Path (Get-Location) "$bundle/private"
New-Item -ItemType Directory -Path $private -Force | Out-Null
foreach ($name in @('root-password', 'app-password')) {
    $path = Join-Path $private $name
    if (-not (Test-Path -LiteralPath $path)) {
        [IO.File]::WriteAllText($path, [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant())
    }
    if ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($path))) { throw "Empty password file: $path" }
}
$password = [IO.File]::ReadAllText((Join-Path $private 'app-password')).Trim()
$dsn = "stray_kitty:${password}@tcp(stray-kitty-mysql:3306)/stray_kitty?parseTime=true"
foreach ($name in @('game-dsn', 'payment-dsn')) { [IO.File]::WriteAllText((Join-Path $private $name), $dsn) }
kubectl @k create secret generic stray-kitty-mysql --from-file="root-password=$private/root-password" --from-file="app-password=$private/app-password"
if ($LASTEXITCODE -ne 0) { throw 'Secret already exists or creation failed; inspect the existing installation before continuing.' }
kubectl @k create secret generic stray-kitty-database-migration --from-file="game-dsn=$private/game-dsn" --from-file="payment-dsn=$private/payment-dsn"
if ($LASTEXITCODE -ne 0) { throw 'Migration Secret creation failed.' }
kubectl @k apply -f "$bundle/k8s/database.yaml"
if ($LASTEXITCODE -ne 0) { throw 'Database apply failed.' }
kubectl @k rollout status statefulset/stray-kitty-mysql --timeout=600s
if ($LASTEXITCODE -ne 0) { throw 'Database did not become ready.' }
```

这两种凭据只用于此数据库；应用不使用 root。MySQL 镜像的初始化变量只在空数据目录生效，后续调整 Secret 不会自动修改库中密码。发布前记录实际 MySQL 镜像 digest；长期环境应把 `mysql:8.4` 固定为验证过的 digest。

### 2. 停写、备份、导入

此阶段有维护停机。暂停其他发布，停止 frontend、payment、game 并等待 Pod 退出；不可在旧应用仍写 JSON 时导入。先记录当前已发布的镜像（必须包含迁移工具），分别渲染两个只读迁移 Pod。分别挂载旧 PVC 可避免两个卷处于不同可用区导致无法调度。

```powershell
$gameImage = kubectl @k get deployment stray-kitty-game -o jsonpath='{.spec.template.spec.containers[0].image}'
$paymentImage = kubectl @k get deployment stray-kitty-payment -o jsonpath='{.spec.template.spec.containers[0].image}'
foreach ($image in @($gameImage, $paymentImage)) {
    if ($image -notmatch '@sha256:[a-f0-9]{64}$') { throw 'A verified app image digest is required.' }
}
kubectl @k scale deployment stray-kitty-frontend stray-kitty-payment stray-kitty-game --replicas=0
if ($LASTEXITCODE -ne 0) { throw 'Stop failed.' }
kubectl @k wait --for=delete pod -l 'app.kubernetes.io/instance=haozhe-preview,app.kubernetes.io/component in (game,payment,frontend)' --timeout=180s
if ($LASTEXITCODE -ne 0) { throw 'Old writers are still running.' }
$template = [IO.File]::ReadAllText((Join-Path (Get-Location) "$bundle/k8s/database-import.template.json"))
$rendered = $template.Replace('RELEASE_GAME_IMAGE_NOT_SELECTED', $gameImage).Replace('RELEASE_PAYMENT_IMAGE_NOT_SELECTED', $paymentImage)
$importManifest = Join-Path $private 'database-import.json'
[IO.File]::WriteAllText($importManifest, $rendered)
kubectl @k apply -f $importManifest
if ($LASTEXITCODE -ne 0) { throw 'Migration Pod creation failed.' }
kubectl @k wait --for=condition=Ready pod/stray-kitty-import-game pod/stray-kitty-import-payment --timeout=300s
if ($LASTEXITCODE -ne 0) { throw 'Migration Pods not ready.' }
# Keep the local kubectl cp destination relative (Windows drive letters contain ':').
$backup = Join-Path "$bundle/private" ('backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $backup | Out-Null
kubectl @k cp stray-kitty-import-game:/legacy/game.json "$backup/game.json"
if ($LASTEXITCODE -ne 0) { throw 'Game backup failed.' }
kubectl @k cp stray-kitty-import-payment:/legacy/payments.json "$backup/payments.json"
if ($LASTEXITCODE -ne 0) { throw 'Payment backup failed.' }
Get-FileHash "$backup/game.json", "$backup/payments.json" -Algorithm SHA256
kubectl @k exec stray-kitty-import-game -- /app/db-migrate -source game -file /legacy/game.json
if ($LASTEXITCODE -ne 0) { throw 'Game import failed; do not activate the database.' }
kubectl @k exec stray-kitty-import-payment -- /app/db-migrate -source payments -file /legacy/payments.json
if ($LASTEXITCODE -ne 0) { throw 'Payment import failed; do not activate the database.' }
```

记录导入结果、备份哈希和镜像版本。工具成功时输出 `game import committed; source file preserved` 或对应的 `payments` 信息；异常以非零状态退出。迁移只读旧卷；原始 JSON 仍在。若历史部署从未创建某个源文件，应确认该服务确实无数据，再跳过对应导入，不能把无法读取文件当成空库。若仅一侧成功，保持服务停写并排查另一侧；不要重新导入已完成的一侧。

### 3. 激活与验收

两侧导入成功、备份可读后创建应用连接 Secret，再启动 game/payment；这一步才是存储切换。先验证私有 API readiness 和已有账号/存档，再恢复 frontend。

```powershell
kubectl @k create secret generic stray-kitty-preview-database --from-file="game-dsn=$private/game-dsn" --from-file="payment-dsn=$private/payment-dsn"
if ($LASTEXITCODE -ne 0) { throw 'Application connection Secret creation failed.' }
kubectl @k delete pod stray-kitty-import-game stray-kitty-import-payment
if ($LASTEXITCODE -ne 0) { throw 'Migration Pod cleanup failed.' }
kubectl @k scale deployment stray-kitty-payment stray-kitty-game --replicas=1
kubectl @k rollout status deployment/stray-kitty-payment --timeout=300s
if ($LASTEXITCODE -ne 0) { throw 'Payment rollout failed.' }
kubectl @k rollout status deployment/stray-kitty-game --timeout=300s
if ($LASTEXITCODE -ne 0) { throw 'Game rollout failed.' }
kubectl @k exec deployment/stray-kitty-game -- wget -qO- http://127.0.0.1:8080/readyz
kubectl @k exec deployment/stray-kitty-payment -- wget -qO- http://127.0.0.1:8082/readyz
# Confirm both responses identify MySQL and report ready before opening traffic.
kubectl @k scale deployment stray-kitty-frontend --replicas=1
kubectl @k rollout status deployment/stray-kitty-frontend --timeout=300s
```

验收：旧账号登录、原会话继续读档、一次命令写入后重启仍保留、重复命令无二次扣款、支付历史及一次沙盒支付重试不重复入账。公网 `/healthz` 只验证 frontend，不能替代数据库检查。应用通过 `/readyz` 查询数据库；不要把 MySQL 失联绑到应用 liveness 导致重启风暴。

**回退边界**：恢复对外访问前、尚无 MySQL 新写入时，可停止应用、删除应用连接 Secret，重新启动到原 JSON。MySQL 接受新写入后原 JSON 已过期；此时必须恢复数据库或另行导出迁移，不能直接退回旧 JSON 丢掉进度和账本。普通应用版本回滚也要保留 DSN，并确认旧版本支持当前数据库结构。

## 数据库备份与恢复演练

在数据库容器内部执行一致性 SQL 导出，密码从挂载文件读取。以下 `kubectl` 使用前面显式目标参数，备份目录必须限权且应另存到可靠存储，不入 Git。SQL dump 包含账号密码哈希与完整游戏数据。

```powershell
$dumpPath = Join-Path $private ('mysql-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '.sql')
kubectl @k exec stray-kitty-mysql-0 -- sh -ec 'MYSQL_PWD=$(cat /run/secrets/mysql/root-password) mysqldump -uroot --single-transaction --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF stray_kitty' > $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'Dump failed; do not treat the output as a backup.' }
Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256
```

恢复先演练到新建的空数据库，不覆盖运行中的库。下面名称固定为 `stray_kitty_restore`，已存在会拒绝创建；成功后再导入。大数据量可把 dump 交给受控的数据库恢复任务，避免 PowerShell 一次性读取大文件。

```powershell
kubectl @k exec stray-kitty-mysql-0 -- sh -ec 'MYSQL_PWD=$(cat /run/secrets/mysql/root-password) mysql -uroot -e "CREATE DATABASE stray_kitty_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"'
if ($LASTEXITCODE -ne 0) { throw 'Restore target must be newly created and empty.' }
Get-Content -LiteralPath $dumpPath -Raw | kubectl @k exec -i stray-kitty-mysql-0 -- sh -ec 'MYSQL_PWD=$(cat /run/secrets/mysql/root-password) mysql -uroot stray_kitty_restore'
if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
```

核对恢复库的表、数量、账号关联和关键存档内容，经过隔离应用读写验证才可把它作为恢复目标。切换恢复库前停止写入，为应用用户授予新库权限并更新对应 DSN，重建应用 Pod 后再开放流量。不要执行 `docker compose down -v` 或删除任何数据库/旧存档 PVC 来“重置”线上环境。

## 验证与维护

`mysql_checks` CI job 启动独立 MySQL 8.4 service，通过 `TEST_MYSQL_DSN` 执行真实数据库集成测试。测试账号有创建临时测试数据库的权限，只用于该一次性服务，不能指向开发共享库或线上库。普通 `go test ./...` 未提供该变量时不连接数据库；单元测试通过不代表 MySQL 集成已经验证。

部署配置修改后运行现有离线校验；它们会拒绝应用清单内的明文 DSN 或强制连接尚未初始化的数据库：

```powershell
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-PreviewConfig.ps1 -AllowPlaceholder
pwsh -NoProfile -File deploy/team-preview-haozhe/Test-Offline.ps1
docker compose -f deploy/compose.yaml config --quiet
```

单独的 MySQL StatefulSet 清单应在目标集群进行 server-side dry-run 和初始化验收，确认 StorageClass、配额及镜像拉取可用。密码轮换、MySQL 版本升级和备份保留周期属于数据库维护，不能通过删除持久卷完成。
