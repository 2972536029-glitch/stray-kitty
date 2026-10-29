<#
.SYNOPSIS
  haozhe-wang 试玩实例一键部署/更新(三服务:前端/游戏/支付)。

.DESCRIPTION
  从指定提交(默认最新 origin/main)构建三个镜像(前端 nginx、游戏 API、支付服务)、
  推送 GitLab Registry、渲染清单并更新集群。常规更新对三个 Deployment 原地滚动
  (Recreate 短暂停机;游戏存档与支付账本分别在各自 PVC 上,不受影响,公网 IP 不变)。
  首次部署加 -Init,额外创建拉取镜像 Secret。本脚本不改代码、不建 MR——代码合入 main 仍是前置条件。

.EXAMPLE
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1                 # 部署最新 main
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Commit <sha>   # 部署指定提交
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Init           # 首次部署(含拉取 Secret)
#>
[CmdletBinding()]
param(
  [string]$Commit,
  [switch]$Init,
  [string]$KubeConfig
)
$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $bundle '../..')).Path
$settings = Get-Content -LiteralPath (Join-Path $bundle 'release-settings.json') -Raw | ConvertFrom-Json
$context = $settings.context
$namespace = $settings.namespace
if (-not $KubeConfig) {
  if ($env:KUBECONFIG) { $KubeConfig = ($env:KUBECONFIG -split ';')[0] }
  else { $KubeConfig = Join-Path $env:USERPROFILE 'Desktop/xsolla/cn-haozhe-wang.kubeconfig' }
}
if (-not (Test-Path -LiteralPath $KubeConfig)) { throw "找不到 kubeconfig: $KubeConfig（用 -KubeConfig 指定）" }
$env:KUBECONFIG = $KubeConfig
$kube = @('-n', $namespace, '--context', $context)

function Step([string]$m) { Write-Host ("==> " + $m) -ForegroundColor Cyan }
function GitCredential() {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'git'; $psi.Arguments = 'credential fill'
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.Write("protocol=https`nhost=school-gitlab.xsolla.dev`n`n")
  $p.StandardInput.Close(); $out = $p.StandardOutput.ReadToEnd(); $p.WaitForExit()
  $u = $null; $pw = $null
  foreach ($line in ($out -split "`n")) {
    $l = $line.TrimEnd("`r")
    if ($l -like 'username=*') { $u = $l.Substring(9) }
    if ($l -like 'password=*') { $pw = $l.Substring(9) }
  }
  if (-not $u -or -not $pw) { throw '无法从 git 凭据助手取得 registry 凭据' }
  [pscustomobject]@{User = $u; Password = $pw}
}

Step '获取发布提交'
git -C $repoRoot fetch origin main | Out-Null
if (-not $Commit) { $Commit = (git -C $repoRoot rev-parse origin/main).Trim() }
$short = $Commit.Substring(0, 7)
Write-Host "发布提交: $Commit"

Step '准备干净构建目录(worktree)'
$wt = Join-Path $env:TEMP 'stray-kitty-deploy-wt'
git -C $repoRoot worktree remove $wt --force 2>$null
git -C $repoRoot worktree add --detach $wt $Commit | Out-Null
try {
  Step '登录 GitLab Registry'
  $cred = GitCredential
  $pwFile = Join-Path $env:TEMP ('.reg-pw-' + [Guid]::NewGuid().ToString('N'))
  [IO.File]::WriteAllText($pwFile, $cred.Password + "`n", [Text.UTF8Encoding]::new($false))
  try { Get-Content -LiteralPath $pwFile | docker login school-gitlab.xsolla.dev:5050 -u $cred.User --password-stdin | Out-Null }
  finally { Remove-Item -LiteralPath $pwFile -Force }

  # 三个服务:名称 → (镜像仓库, Dockerfile)。构建上下文都是仓库根。
  $services = [ordered]@{
    game     = @{ Repo = $settings.images.game;     Dockerfile = 'Dockerfile.game' }
    payment  = @{ Repo = $settings.images.payment;  Dockerfile = 'Dockerfile.payment' }
    frontend = @{ Repo = $settings.images.frontend; Dockerfile = 'Dockerfile.frontend' }
  }
  $digests = @{}
  foreach ($name in $services.Keys) {
    $svc = $services[$name]
    Step ("构建镜像 " + $name)
    $tag = "$($svc.Repo):$Commit"
    docker build --platform linux/amd64 --build-arg "BUILD_REVISION=$Commit" -f (Join-Path $bundle $svc.Dockerfile) -t $tag $wt 2>&1 | Select-Object -Last 3 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw ("镜像构建失败: " + $name) }
    Step ("推送镜像 " + $name)
    $digest = $null
    docker push $tag 2>&1 | ForEach-Object { if ($_ -match 'digest: (sha256:[a-f0-9]{64})') { $digest = $Matches[1] } }
    if (-not $digest) { throw ("推送失败或未取得 digest: " + $name) }
    $digests[$name] = "$($svc.Repo)@$digest"
    Write-Host ("镜像 " + $name + ": " + $digests[$name])
  }

  Step '渲染部署清单'
  $rendered = Join-Path $bundle 'rendered'
  & (Join-Path $bundle 'Prepare-Preview.ps1') -GameImage $digests.game -PaymentImage $digests.payment -FrontendImage $digests.frontend -SourceCommit $Commit -OutputDirectory $rendered | Out-Null

  if ($Init) {
    Step '创建拉取镜像 Secret'
    $secretName = $settings.registrySecret
    $existing = kubectl @kube get secret $secretName --ignore-not-found -o name 2>$null
    if ($existing) { Write-Host "Secret $secretName 已存在，跳过" }
    else {
      $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cred.User + ':' + $cred.Password))
      $cfg = @{auths = @{'school-gitlab.xsolla.dev:5050' = @{auth = $auth}}} | ConvertTo-Json -Compress
      $cfgFile = Join-Path $env:TEMP ('.dockercfg-' + [Guid]::NewGuid().ToString('N'))
      [IO.File]::WriteAllText($cfgFile, $cfg, [Text.UTF8Encoding]::new($false))
      try { kubectl @kube create secret generic $secretName --from-file=".dockerconfigjson=$cfgFile" --type=kubernetes.io/dockerconfigjson | Out-Host }
      finally { Remove-Item -LiteralPath $cfgFile -Force }
    }
  }

  Step '应用清单(2 PVC + 3 Deployment + 3 Service)'
  $manifestPath = Join-Path $rendered 'preview.json'
  kubectl @kube apply -f $manifestPath | Out-Host

  Step '清理单体时代遗留 Deployment(若存在)'
  kubectl @kube delete deployment stray-kitty-preview --ignore-not-found | Out-Host

  foreach ($name in @('stray-kitty-payment', 'stray-kitty-game', 'stray-kitty-frontend')) {
    Step ("等待滚动完成 " + $name)
    kubectl @kube rollout status deployment/$name --timeout=300s | Out-Host
  }

  Step '验证'
  $ip = (kubectl @kube get service stray-kitty-preview -o jsonpath='{.status.loadBalancer.ingress[0].ip}').Trim()
  if (-not $ip) { Write-Host 'Service 尚无公网 IP(首次部署需等待分配,稍后 kubectl get svc 查看)'; }
  else {
    $health = Invoke-RestMethod -Uri "http://$ip/healthz" -TimeoutSec 20
    Write-Host ("healthz: " + ($health | ConvertTo-Json -Compress))
    Write-Host "线上地址: http://$ip" -ForegroundColor Green
  }
  Write-Host "`n部署完成：commit $short"
  Write-Host ("  game     -> " + $digests.game)
  Write-Host ("  payment  -> " + $digests.payment)
  Write-Host ("  frontend -> " + $digests.frontend)
} finally {
  git -C $repoRoot worktree remove $wt --force 2>$null
}
