<#
.SYNOPSIS
  Build and deploy the three-service team preview from one immutable Git commit.

.DESCRIPTION
  All build inputs and Kubernetes release files (Dockerfiles, dockerignore files,
  release settings, renderer, validator and manifest template) are read from the
  detached worktree for the selected commit. The invoking checkout is used only
  for this deployment runner and for storing the local release archive.

.EXAMPLE
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Commit <full-sha>
  pwsh -File deploy/team-preview-haozhe/Deploy-Preview.ps1 -Init
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Commit,
    [switch]$Init,
    [switch]$ValidateOnly,
    [switch]$CiMode,
    [string]$KubeConfig
)

# CiMode:在 GitLab CI 的 deploy_apply job 里运行。与本地模式的差异——
#   源码:直接用 checkout(不再建 worktree,commit 由 $CI_COMMIT_SHA 指定)
#   镜像:跳过构建/推送,直接采用 deploy_images job 经 dotenv 传入的三个 digest
#   登录:不需要 git 凭据助手(dind 侧已登录,本 job 不碰 docker)
#   kubeconfig:读取受保护变量 KUBECONFIG_FILE 指向的文件路径

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bundle = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $bundle '../..')).Path
$commonPath = Join-Path $bundle 'Release.Common.ps1'
if (-not (Test-Path -LiteralPath $commonPath)) {
    throw "Missing release helper: $commonPath"
}
. $commonPath

$worktree = $null
$worktreeCreated = $false
# Linux CI 容器无 TEMP 环境变量,统一走可写临时目录。
if (-not $env:TEMP) { $env:TEMP = '/tmp' }
$renderedDirectory = $null
$archiveDirectory = $null
$releaseRecord = $null
$releaseArchivePath = $null
$releaseRenderedPath = $null
$currentPhase = 'preflight'
$exitCode = 0
$credential = $null
$registryAuth = $null
$loginInput = $null

function Step([string]$Message) {
    Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Get-RegistryCredential {
    $request = "protocol=https" + [Environment]::NewLine + "host=school-gitlab.xsolla.dev" + [Environment]::NewLine + [Environment]::NewLine
    $result = Invoke-NativeChecked -FilePath 'git' -Arguments @('credential', 'fill') -Step 'Read Git registry credentials' -StandardInput $request -Quiet
    $username = $null
    $password = $null
    foreach ($line in ($result.StdOut -split "\r?\n")) {
        if ($line -like 'username=*') { $username = $line.Substring(9) }
        if ($line -like 'password=*') { $password = $line.Substring(9) }
    }
    if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
        throw 'Git credential helper did not return a registry username and password.'
    }
    return [pscustomobject]@{ User = $username; Password = $password }
}

function Save-ReleaseRecord {
    if ($null -eq $script:releaseRecord) { return }
    if ($script:releaseArchivePath) {
        Write-JsonAtomically -Path $script:releaseArchivePath -Value $script:releaseRecord
    }
    if ($script:releaseRenderedPath) {
        Write-JsonAtomically -Path $script:releaseRenderedPath -Value $script:releaseRecord
    }
}

try {
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        throw 'PowerShell 7 or later is required.'
    }

    # CiMode 的 pwsh 容器不带 git/docker;源码与镜像均由 CI 前置 job 提供,只需 kubectl。
    $requiredTools = if ($CiMode) { @('kubectl') }
                     elseif ($ValidateOnly) { @('git') }
                     else { @('git', 'docker', 'kubectl') }
    foreach ($tool in $requiredTools) {
        $null = Get-Command -Name $tool -CommandType Application -ErrorAction Stop
    }

    if (-not $Commit -and $ValidateOnly) {
        $currentPhase = 'resolve current checkout HEAD for offline validation'
        $resolved = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'rev-parse', '--verify', 'HEAD^{commit}') -Step 'Resolve HEAD' -Quiet
        $Commit = $resolved.StdOut.Trim()
    } elseif ($CiMode) {
        $currentPhase = 'resolve CI commit'
        if ([string]::IsNullOrWhiteSpace($env:CI_COMMIT_SHA)) {
            throw 'CiMode requires CI_COMMIT_SHA to identify the release commit.'
        }
        $Commit = $env:CI_COMMIT_SHA
    } elseif (-not $Commit) {
        $currentPhase = 'fetch origin/main'
        Step 'Refresh origin/main'
        $null = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'fetch', 'origin', 'main') -Step 'git fetch origin main'
        $resolved = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'rev-parse', '--verify', 'origin/main^{commit}') -Step 'Resolve origin/main' -Quiet
        $Commit = $resolved.StdOut.Trim()
    } else {
        $currentPhase = 'resolve requested commit'
        $resolved = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'rev-parse', '--verify', "$Commit^{commit}") -Step 'Resolve requested commit' -Quiet
        $Commit = $resolved.StdOut.Trim()
    }

    if ($Commit -notmatch '^[a-f0-9]{40}$') {
        throw "Resolved commit is not a full 40-character SHA: $Commit"
    }
    $shortCommit = $Commit.Substring(0, 7)
    Write-Host "Release commit: $Commit"

    $runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
    if ($CiMode) {
        # CI 已检出正确提交,直接把仓库根当"worktree"用,免建免删。
        $worktree = $repoRoot
    } else {
        $worktree = Join-Path $env:TEMP ("stray-kitty-deploy-" + $Commit.Substring(0, 12) + "-" + [Guid]::NewGuid().ToString('N'))
        $currentPhase = 'create detached worktree'
        Step 'Create isolated source worktree'
        $null = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'worktree', 'add', '--detach', $worktree, $Commit) -Step 'git worktree add'
        $worktreeCreated = $true
    }

    $worktreeBundle = Join-Path $worktree 'deploy/team-preview-haozhe'
    $requiredFiles = @(
        'release-settings.json',
        'Prepare-Preview.ps1',
        'Test-PreviewConfig.ps1',
        'k8s/preview.template.json',
        'Dockerfile.game',
        'Dockerfile.game.dockerignore',
        'Dockerfile.payment',
        'Dockerfile.payment.dockerignore',
        'Dockerfile.frontend',
        'Dockerfile.frontend.dockerignore'
    )
    foreach ($relativePath in $requiredFiles) {
        $candidate = Join-Path $worktreeBundle $relativePath
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "Selected commit is missing required release input: $relativePath"
        }
    }

    # CiMode:CI 已按 CI_COMMIT_SHA 检出且容器无 git,跳过 HEAD 复核。
    if (-not $CiMode) {
        $worktreeHead = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $worktree, 'rev-parse', 'HEAD') -Step 'Verify worktree commit' -Quiet
        if ($worktreeHead.StdOut.Trim() -ne $Commit) {
            throw 'Detached worktree HEAD does not match the selected release commit.'
        }
    }

    if ($ValidateOnly) {
        $currentPhase = 'offline validation'
        Step 'Validate selected commit release template without Docker, registry, or Kubernetes'
        $validation = & (Join-Path $worktreeBundle 'Test-PreviewConfig.ps1') -AllowPlaceholder
        if ($validation.Validation -ne 'passed-offline') { throw 'Template validation did not pass.' }
        $offlineReport = & (Join-Path $worktreeBundle 'Test-Offline.ps1') | ConvertFrom-Json
        if ($offlineReport.status -ne 'passed') { throw 'Release offline negative tests did not pass.' }
        Write-Host "Validation complete: commit $Commit; $($offlineReport.count) offline cases passed. No registry or cluster access."
        return
    }

    $settings = Get-Content -LiteralPath (Join-Path $worktreeBundle 'release-settings.json') -Raw | ConvertFrom-Json
    $context = [string]$settings.context
    $namespace = [string]$settings.namespace
    if ([string]::IsNullOrWhiteSpace($context) -or [string]::IsNullOrWhiteSpace($namespace)) {
        throw 'release-settings.json must define both context and namespace.'
    }
    foreach ($name in @('game', 'payment', 'frontend')) {
        if ([string]::IsNullOrWhiteSpace([string]$settings.images.$name)) {
            throw "release-settings.json is missing images.$name."
        }
    }
    if ($Init -and [string]::IsNullOrWhiteSpace([string]$settings.registrySecret)) {
        throw 'release-settings.json is missing registrySecret required by -Init.'
    }

    if (-not $KubeConfig) {
        if ($CiMode -and $env:KUBECONFIG_FILE) {
            $KubeConfig = $env:KUBECONFIG_FILE
        } elseif ($env:KUBECONFIG) {
            $KubeConfig = ($env:KUBECONFIG -split ';')[0]
        } else {
            $KubeConfig = Join-Path $env:USERPROFILE 'Desktop/xsolla/cn-haozhe-wang.kubeconfig'
        }
    }
    if (-not (Test-Path -LiteralPath $KubeConfig -PathType Leaf)) {
        throw "Kubeconfig not found: $KubeConfig (use -KubeConfig to specify it)."
    }
    $env:KUBECONFIG = $KubeConfig
    $kubeArguments = @('-n', $namespace, '--context', $context)

    $services = [ordered]@{
        game = @{ Repository = [string]$settings.images.game; Dockerfile = 'Dockerfile.game' }
        payment = @{ Repository = [string]$settings.images.payment; Dockerfile = 'Dockerfile.payment' }
        frontend = @{ Repository = [string]$settings.images.frontend; Dockerfile = 'Dockerfile.frontend' }
    }
    $digests = @{}

    if ($CiMode) {
        # deploy_images job 已用 dind 构建推送完毕,digest 经 dotenv artifact 传入:
        # game_digest / payment_digest / frontend_digest(受保护变量同 job 可见)。
        $currentPhase = 'consume CI-built image digests'
        Step 'Use image digests built by deploy_images job'
        foreach ($name in $services.Keys) {
            # dotenv artifact 个别版本会保留字面引号,统一剥掉再校验。
            $value = ([Environment]::GetEnvironmentVariable($name + '_digest') -as [string]).Trim().Trim('"').Trim("'")
            $expected = '^' + [regex]::Escape($services[$name].Repository) + '@sha256:[a-f0-9]{64}$'
            if ([string]::IsNullOrWhiteSpace($value) -or $value -cnotmatch $expected) {
                throw "CiMode: env var ${name}_digest missing or not the verified project image (got: $value)."
            }
            $digests[$name] = $value
            Write-Host ("$name -> " + $digests[$name])
        }
    } else {
        $currentPhase = 'registry authentication'
        Step 'Read GitLab registry credentials and log in'
        $credential = Get-RegistryCredential
        if ($Init) {
            $registryAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credential.User + ':' + $credential.Password))
        }
        $loginInput = $credential.Password + [Environment]::NewLine
        $null = Invoke-NativeChecked -FilePath 'docker' -Arguments @('login', 'school-gitlab.xsolla.dev:5050', '-u', $credential.User, '--password-stdin') -Step 'docker login' -StandardInput $loginInput -Quiet
        $loginInput = $null
        $credential.Password = $null
        $credential = $null
        Write-Host 'GitLab Registry login succeeded.'

        foreach ($name in $services.Keys) {
            $service = $services[$name]
            $dockerfile = Join-Path $worktreeBundle $service.Dockerfile
            $tag = "$($service.Repository):$Commit"

            $currentPhase = "build $name image"
            Step "Build $name image from commit $shortCommit"
            $null = Invoke-NativeChecked -FilePath 'docker' -Arguments @(
                'build', '--platform', 'linux/amd64',
                '--build-arg', "BUILD_REVISION=$Commit",
                '-f', $dockerfile, '-t', $tag, $worktree
            ) -Step "docker build ($name)" -TailLines 12

            $currentPhase = "push $name image"
            Step "Push $name image"
            $push = Invoke-NativeChecked -FilePath 'docker' -Arguments @('push', $tag) -Step "docker push ($name)" -TailLines 12
            $pushText = $push.StdOut + [Environment]::NewLine + $push.StdErr
            $digestMatch = [regex]::Match($pushText, 'digest: (sha256:[a-f0-9]{64})')
            if (-not $digestMatch.Success) {
                throw "docker push ($name) succeeded but did not report a SHA-256 digest."
            }
            $digests[$name] = "$($service.Repository)@$($digestMatch.Groups[1].Value)"
            Write-Host ("$name -> " + $digests[$name])
        }
    }

    $currentPhase = 'render and validate release manifest'
    Step 'Render manifest using files from the selected commit'
    $renderedDirectory = Join-Path $env:TEMP ("stray-kitty-render-" + [Guid]::NewGuid().ToString('N'))
    $prepareScript = Join-Path $worktreeBundle 'Prepare-Preview.ps1'
    $prepareArguments = @{
        GameImage = $digests.game
        PaymentImage = $digests.payment
        FrontendImage = $digests.frontend
        SourceCommit = $Commit
        OutputDirectory = $renderedDirectory
    }
    $prepareOutput = & $prepareScript @prepareArguments
    if (-not $?) {
        throw 'Prepare-Preview.ps1 failed.'
    }
    $prepareOutput | ForEach-Object { Write-Host $_ }

    $manifestPath = Join-Path $renderedDirectory 'preview.json'
    $preparedReleasePath = Join-Path $renderedDirectory 'release.json'
    foreach ($path in @($manifestPath, $preparedReleasePath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Release renderer did not produce required file: $path"
        }
    }
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()

    $archiveDirectory = Join-Path $bundle ("releases/" + $Commit + "/" + $runId)
    $null = New-Item -ItemType Directory -Path $archiveDirectory -Force
    $releaseArchivePath = Join-Path $archiveDirectory 'release.json'
    $releaseRenderedPath = $preparedReleasePath
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $archiveDirectory 'preview.json') -Force
    Copy-Item -LiteralPath $preparedReleasePath -Destination $releaseArchivePath -Force

    $releaseRecord = Get-Content -LiteralPath $releaseArchivePath -Raw | ConvertFrom-Json
    if ($releaseRecord.sourceCommit -ne $Commit -or $releaseRecord.manifestSha256 -ne $manifestHash) {
        throw 'Release record does not match the rendered commit or manifest hash.'
    }
    $releaseRecord.status = 'deploying'
    $releaseRecord.clusterContacted = $false
    $releaseRecord.credentialsRead = $true
    $archiveRelativePath = 'releases/' + $Commit + '/' + $runId
    $releaseRecord | Add-Member -NotePropertyName archiveDirectory -NotePropertyValue $archiveRelativePath -Force
    $releaseRecord | Add-Member -NotePropertyName deployment -NotePropertyValue ([pscustomobject]@{
        status = 'deploying'
        startedAtUtc = [DateTime]::UtcNow.ToString('o')
        finishedAtUtc = $null
        context = $context
        namespace = $namespace
        failurePhase = $null
    }) -Force
    Save-ReleaseRecord
    Write-Host "Local release archive: $archiveDirectory"

    $currentPhase = 'apply Kubernetes resources'
    $releaseRecord.clusterContacted = $true
    Save-ReleaseRecord
    if ($Init) {
        Step 'Ensure registry image-pull Secret exists'
        $secretName = [string]$settings.registrySecret
        $existingSecret = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('get', 'secret', $secretName, '--ignore-not-found', '-o', 'name')) -Step 'kubectl get registry Secret' -TailLines 5
        if ([string]::IsNullOrWhiteSpace($existingSecret.StdOut)) {
            $dockerConfig = @{ auths = @{ 'school-gitlab.xsolla.dev:5050' = @{ auth = $registryAuth } } } | ConvertTo-Json -Compress
            $configPath = Join-Path $env:TEMP ('.dockercfg-' + [Guid]::NewGuid().ToString('N'))
            try {
                [IO.File]::WriteAllText($configPath, $dockerConfig, [Text.UTF8Encoding]::new($false))
                $null = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('create', 'secret', 'generic', $secretName, "--from-file=.dockerconfigjson=$configPath", '--type=kubernetes.io/dockerconfigjson')) -Step 'kubectl create registry Secret'
            } finally {
                if (Test-Path -LiteralPath $configPath) { Remove-Item -LiteralPath $configPath -Force }
                $dockerConfig = $null
            }
        } else {
            Write-Host "Registry Secret $secretName already exists; skipping creation."
        }
        $registryAuth = $null
    }

    Step 'Apply the two PVCs, three Deployments and three Services'
    $null = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('apply', '-f', $manifestPath)) -Step 'kubectl apply'

    $currentPhase = 'remove legacy single-service Deployment'
    Step 'Remove legacy single-service Deployment if present'
    $null = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('delete', 'deployment', 'stray-kitty-preview', '--ignore-not-found')) -Step 'kubectl delete legacy Deployment'

    foreach ($name in @('stray-kitty-payment', 'stray-kitty-game', 'stray-kitty-frontend')) {
        $currentPhase = "rollout $name"
        Step "Wait for $name rollout"
        $null = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('rollout', 'status', "deployment/$name", '--timeout=300s')) -Step "kubectl rollout status ($name)"
    }

    $currentPhase = 'verify payment readiness'
    Step 'Verify payment service readiness endpoint'
    $paymentReadyResult = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('exec', 'deployment/stray-kitty-payment', '--', 'wget', '-qO-', 'http://127.0.0.1:8082/readyz')) -Step 'Payment /readyz' -TailLines 5
    $paymentReady = $paymentReadyResult.StdOut | ConvertFrom-Json
    if ($paymentReady.status -ne 'ready' -or $paymentReady.storage -ne 'payment-ledger') {
        throw 'Payment /readyz did not confirm ready payment-ledger storage.'
    }

    $currentPhase = 'wait for frontend LoadBalancer IP'
    Step 'Wait for frontend public IP'
    $ip = $null
    for ($attempt = 1; $attempt -le 24; $attempt++) {
        $serviceResult = Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + @('get', 'service', 'stray-kitty-preview', '-o', 'jsonpath={.status.loadBalancer.ingress[0].ip}')) -Step 'Read frontend LoadBalancer IP' -TailLines 3
        $ip = $serviceResult.StdOut.Trim()
        if ($ip) { break }
        if ($attempt -lt 24) {
            Write-Host "LoadBalancer IP is not assigned yet ($attempt/24); retrying in 5 seconds."
            Start-Sleep -Seconds 5
        }
    }
    if (-not $ip) {
        throw 'Frontend LoadBalancer did not receive a public IP within 120 seconds.'
    }

    $currentPhase = 'verify public health endpoint'
    Step 'Verify public /healthz'
    # 公网 /healthz 由前端 nginx 直接应答纯文本 "ok"（Content-Type 非 JSON），
    # 直连游戏端口才是 {"status":"ok"}；两种形态都接受，字节响应先解码。
    # Pod readiness can precede LoadBalancer routing after Recreate.
    $health = Wait-PublicHealth -Uri "http://$ip/healthz"
    $healthText = $health.Content

    $releaseRecord.status = 'deployed'
    $releaseRecord.deployment.status = 'deployed'
    $releaseRecord.deployment.finishedAtUtc = [DateTime]::UtcNow.ToString('o')
    $releaseRecord | Add-Member -NotePropertyName publicAddress -NotePropertyValue "http://$ip" -Force
    $releaseRecord | Add-Member -NotePropertyName paymentReadiness -NotePropertyValue $paymentReady -Force
    $releaseRecord | Add-Member -NotePropertyName healthCheck -NotePropertyValue $healthText -Force
    Save-ReleaseRecord

    Step 'Deployment verified'
    Write-Host "Commit: $Commit"
    Write-Host "Public URL: http://$ip" -ForegroundColor Green
    Write-Host "Release archive: $archiveDirectory"
    Write-Host 'All three rollouts, payment readiness and public health checks passed.'
} catch {
    $exitCode = 1
    $failureMessage = $_.Exception.Message
    Write-Host "ERROR during '$currentPhase': $failureMessage" -ForegroundColor Red
    if ($null -ne $releaseRecord) {
        try {
            $releaseRecord.status = 'failed'
            if ($null -eq $releaseRecord.PSObject.Properties['deployment'] -or $null -eq $releaseRecord.deployment) {
                $releaseRecord | Add-Member -NotePropertyName deployment -NotePropertyValue ([pscustomobject]@{
                    status = 'failed'
                    startedAtUtc = $null
                    finishedAtUtc = $null
                    context = $null
                    namespace = $null
                    failurePhase = $currentPhase
                }) -Force
            }
            $releaseRecord.deployment.status = 'failed'
            $releaseRecord.deployment.failurePhase = $currentPhase
            $releaseRecord.deployment.finishedAtUtc = [DateTime]::UtcNow.ToString('o')
            Save-ReleaseRecord
        } catch {
            Write-Warning 'Could not update the local release record after failure.'
        }
    }
} finally {
    $loginInput = $null
    if ($null -ne $credential) {
        $credential.Password = $null
        $credential = $null
    }
    $registryAuth = $null
    if ($worktreeCreated -and $worktree -and (Test-Path -LiteralPath $worktree)) {
        try {
            $null = Invoke-NativeChecked -FilePath 'git' -Arguments @('-C', $repoRoot, 'worktree', 'remove', '--force', $worktree) -Step 'Clean up detached worktree' -Quiet
            Write-Host 'Temporary worktree removed.'
        } catch {
            Write-Warning "Could not remove temporary worktree: $worktree"
        }
    }
    if ($renderedDirectory -and (Test-Path -LiteralPath $renderedDirectory)) {
        try { Remove-Item -LiteralPath $renderedDirectory -Recurse -Force } catch {
            Write-Warning "Could not remove temporary render directory: $renderedDirectory"
        }
    }
}

if ($exitCode -ne 0) {
    exit $exitCode
}
