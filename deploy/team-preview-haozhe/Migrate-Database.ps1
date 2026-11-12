<#
.SYNOPSIS
  Explicit CI-only database preparation, stopped-writer migration and final traffic restore.
  CI artifacts contain only public metadata and RSA/AES encrypted snapshots.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Prepare','Migrate','Finalize')][string]$Phase,
    [string]$SourceCommit = $env:CI_COMMIT_SHA,
    [string]$PipelineId = $env:CI_PIPELINE_ID
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Release.Common.ps1')
. (Join-Path $PSScriptRoot 'Database.Common.ps1')

if ($env:CI -ne 'true') { throw 'This migration runner is intended for the protected GitLab CI environment.' }
if ($SourceCommit -cnotmatch '^[a-f0-9]{40}$' -or $PipelineId -notmatch '^[0-9]{1,16}$') { throw 'A full CI commit and numeric pipeline ID are required.' }
if (-not $env:KUBECONFIG_FILE -or -not (Test-Path -LiteralPath $env:KUBECONFIG_FILE -PathType Leaf)) { throw 'The protected KUBECONFIG_FILE is unavailable.' }
$namespace = 'cn-haozhe-wang'
$context = 'haozhe-wang@gcp-k8s-xsolla-school-experiments'
$runId = "db-$PipelineId"
$stateName = "stray-kitty-db-migration-$PipelineId"
$smokeName = "stray-kitty-db-smoke-$PipelineId"
$lockName = 'stray-kitty-db-migration-lock'
$kubeArguments = @('--kubeconfig', $env:KUBECONFIG_FILE, '--context', $context, '--namespace', $namespace)
$artifactDirectory = Join-Path $PSScriptRoot "database-artifacts/$runId"
$scratchDirectory = Join-Path ([IO.Path]::GetTempPath()) ('kitty-db-' + [Guid]::NewGuid().ToString('N'))
$state = $null
$currentStep = 'preflight'
$maintenanceStarted = $false
$lastReportedStep = ''
$null = New-Item -ItemType Directory -Path $scratchDirectory

function Invoke-Kube {
    param([Parameter(Mandatory)][string[]]$Arguments, [AllowNull()][string]$InputText)
    # Native stdout/stderr can contain credentials or private smoke state. Never echo it.
    if ($script:lastReportedStep -cne $currentStep) {
        Write-Host "Database operation: $currentStep"
        $script:lastReportedStep = $currentStep
    }
    return Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments + $Arguments) -StandardInput $InputText -Step $currentStep -Quiet
}
function Get-KubeObject {
    param([string]$Kind, [string]$Name)
    $result = Invoke-Kube -Arguments @('get',$Kind,$Name,'--ignore-not-found','-o','json')
    if ([string]::IsNullOrWhiteSpace($result.StdOut)) { return $null }
    return ($result.StdOut | ConvertFrom-Json -AsHashtable)
}
function Write-KubeObject {
    param([Parameter(Mandatory)][hashtable]$Object, [switch]$Replace)
    $verb = if ($Replace) { 'replace' } else { 'create' }
    $null = Invoke-Kube -Arguments @($verb,'-f','-') -InputText ($Object | ConvertTo-Json -Depth 40 -Compress)
}
function Set-PrivateSecret {
    param([string]$Name,[hashtable]$Data,[switch]$Update)
    $existing = Get-KubeObject 'secret' $Name
    $secret = @{apiVersion='v1';kind='Secret';type='Opaque';metadata=@{name=$Name;namespace=$namespace};data=$Data}
    if ($null -ne $existing) {
        if (-not $Update) {
            foreach ($key in $Data.Keys) {
                if (-not $existing.data.ContainsKey($key) -or $existing.data[$key] -cne $Data[$key]) { throw 'Existing database Secret does not match the expected configuration.' }
            }
            return
        }
        $secret.metadata.resourceVersion = $existing.metadata.resourceVersion
        Write-KubeObject $secret -Replace
    } else { Write-KubeObject $secret }
}
function Encode-PrivateText([string]$Value) { return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value)) }
function Get-SmokeState {
    $secret = Get-KubeObject 'secret' $smokeName
    if ($null -eq $secret -or -not $secret.data.ContainsKey('state.json')) { throw 'The prepared private smoke state is missing.' }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($secret.data['state.json']))
}
function Save-State {
    $existing = Get-KubeObject 'configmap' $stateName
    $object = @{apiVersion='v1';kind='ConfigMap';metadata=@{name=$stateName;namespace=$namespace};data=@{'state.json'=($state | ConvertTo-Json -Depth 30 -Compress)}}
    if ($null -ne $existing) {
        $object.metadata.resourceVersion=$existing.metadata.resourceVersion
        Write-KubeObject $object -Replace
    } else { Write-KubeObject $object }
    $null = New-Item -ItemType Directory -Path $artifactDirectory -Force
    Write-JsonAtomically -Path (Join-Path $artifactDirectory 'manifest.json') -Value $state
}
function Get-DeployedEvidence {
    $evidence = @{}
    foreach ($service in @('game','payment','frontend')) {
        $deployment = Get-KubeObject 'deployment' "stray-kitty-$service"
        if ($null -eq $deployment) { throw 'A required application deployment is missing.' }
        $image = [string]$deployment.spec.template.spec.containers[0].image
        $expectedRepo = "school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/$service"
        if ($image -cnotmatch ('^' + [regex]::Escape($expectedRepo) + '@sha256:[a-f0-9]{64}$')) { throw 'The deployed application image is not a verified project digest.' }
        if ($deployment.metadata.annotations['stray-kitty/source-commit'] -cne $SourceCommit -or
            $deployment.spec.template.metadata.annotations['stray-kitty/source-commit'] -cne $SourceCommit) { throw 'Deploy this exact CI commit before preparing or migrating its database.' }
        $evidence[$service] = @{image=$image;replicas=[int]$deployment.spec.replicas}
    }
    return $evidence
}
function Assert-SameImages([hashtable]$Expected) {
    $actual = Get-DeployedEvidence
    foreach ($service in @('game','payment','frontend')) {
        if ($actual[$service].image -cne $Expected[$service].image) { throw 'Application images changed during the migration operation.' }
    }
}
function Assert-BackendReady {
    foreach ($service in @('game','payment')) {
        $port = if ($service -eq 'game') { '8080' } else { '8082' }
        $result = Invoke-Kube -Arguments @('exec',"deployment/stray-kitty-$service",'--','wget','-qO-',"http://127.0.0.1:$port/readyz")
        $ready = $result.StdOut | ConvertFrom-Json
        if ($ready.status -cne 'ready' -or $ready.storage -cne 'mysql') { throw 'An application has not confirmed MySQL readiness.' }
    }
}
function Wait-AppRollout([string]$Service) {
    $null = Invoke-Kube -Arguments @('rollout','status',"deployment/stray-kitty-$Service",'--timeout=360s')
}
function Write-DatabaseDiagnostics {
    # Only Kubernetes identifiers, phases, reason codes and counts are printable.
    # Never print pod specs, environment variables, events' free text or native stderr.
    try {
        $result=Invoke-Kube -Arguments @('get','pods','-l','app.kubernetes.io/name=stray-kitty','-o','json')
        $document=$result.StdOut | ConvertFrom-Json -AsHashtable
        foreach($pod in $document.items){
            if($pod.metadata.name -cnotmatch '^[a-z0-9.-]+$'){continue}
            $podPhase=if($pod.status.ContainsKey('phase')){[string]$pod.status.phase}else{'Unknown'}
            if($podPhase -cnotmatch '^[A-Za-z]+$'){$podPhase='Unknown'}
            $readyCount=0;$reasons=[Collections.Generic.List[string]]::new()
            if($pod.status.ContainsKey('containerStatuses')){
                foreach($container in $pod.status.containerStatuses){
                    if($container.ready){$readyCount++}
                    foreach($type in @('waiting','terminated')){
                        if($container.state.ContainsKey($type) -and $container.state[$type].ContainsKey('reason')){
                            $reason=[string]$container.state[$type].reason
                            if($reason -cmatch '^[A-Za-z0-9_-]{1,100}$'){$reasons.Add($reason)}
                        }
                    }
                }
            }
            Write-Host ("Pod {0}: phase={1} ready={2}/{3} reasons={4}" -f $pod.metadata.name,$podPhase,$readyCount,@($pod.spec.containers).Count,($reasons -join ','))
        }
    }catch{Write-Host 'Pod status diagnostics unavailable.'}
    try{
        foreach($service in @('game','payment','frontend')){
            $deployment=Get-KubeObject 'deployment' "stray-kitty-$service"
            if($null -eq $deployment){continue}
            $desired=[int]$deployment.spec.replicas
            $ready=if($deployment.status.ContainsKey('readyReplicas')){[int]$deployment.status.readyReplicas}else{0}
            $updated=if($deployment.status.ContainsKey('updatedReplicas')){[int]$deployment.status.updatedReplicas}else{0}
            Write-Host "Deployment stray-kitty-${service}: desired=$desired ready=$ready updated=$updated"
        }
        foreach($claim in @('stray-kitty-preview-data','stray-kitty-payment-data','stray-kitty-game-db-backup','stray-kitty-payment-db-backup','database-stray-kitty-mysql-0')){
            $pvc=Get-KubeObject 'pvc' $claim
            if($null -eq $pvc){Write-Host "PVC ${claim}: absent";continue}
            $pvcPhase=if($pvc.status.ContainsKey('phase')){[string]$pvc.status.phase}else{'Unknown'}
            if($pvcPhase -cnotmatch '^[A-Za-z]+$'){$pvcPhase='Unknown'}
            Write-Host "PVC ${claim}: phase=$pvcPhase"
        }
    }catch{Write-Host 'Deployment/PVC status diagnostics unavailable.'}
}

try {
    # Explicit context/namespace for every call; never read or export kubeconfig content.
    foreach ($permission in @(@('create','secrets'),@('create','configmaps'),@('create','persistentvolumeclaims'),@('create','pods'),@('patch','deployments'),@('create','statefulsets'),@('create','services'))) {
        $can = Invoke-Kube -Arguments (@('auth','can-i') + $permission)
        if ($can.StdOut.Trim() -cne 'yes') { throw 'The target namespace does not grant a required migration permission.' }
    }
    $saved = Get-KubeObject 'configmap' $stateName
    if ($null -ne $saved) { $state = $saved.data['state.json'] | ConvertFrom-Json -AsHashtable }

    if ($Phase -eq 'Prepare') {
        if ($null -ne (Get-KubeObject 'configmap' $lockName)) { throw 'Another migration is pending; inspect its operation state before preparing again.' }
        if ($null -ne (Get-KubeObject 'secret' 'stray-kitty-preview-database')) { throw 'The application database connection is already enabled; do not start a new import.' }
        $deployments = Get-DeployedEvidence
        foreach ($service in @('game','payment','frontend')) {
            if ($deployments[$service].replicas -ne 1) { throw 'Preparation requires the normal single-replica application deployment.' }
        }
        foreach ($service in @('game','payment')) {
            foreach ($binary in @('db-migrate','db-verify','db-smoke')) {
                $null = Invoke-Kube -Arguments @('exec',"deployment/stray-kitty-$service",'--',"/app/$binary",'-h')
            }
        }
        $currentStep='server-side database and backup PVC preflight'
        $quotaResult = Invoke-Kube -Arguments @('get','resourcequota','-o','json')
        $quotas = $quotaResult.StdOut | ConvertFrom-Json -AsHashtable
        foreach ($quota in $quotas.items) {
            foreach ($resource in @('requests.storage','persistentvolumeclaims','pods','requests.cpu','requests.memory','limits.cpu','limits.memory')) {
                if ($quota.status.hard.ContainsKey($resource)) {
                    Write-Host ("Quota {0}: {1} used={2} hard={3}" -f $quota.metadata.name,$resource,$quota.status.used[$resource],$quota.status.hard[$resource])
                }
            }
        }
        $databaseManifest = Join-Path $PSScriptRoot 'k8s/database.yaml'
        $null = Invoke-Kube -Arguments @('apply','--dry-run=server','-f',$databaseManifest)
        foreach ($service in @('game','payment')) {
            $pvc = New-DatabaseBackupPvc -Service $service
            $null = Invoke-Kube -Arguments @('apply','--dry-run=server','-f','-') -InputText ($pvc | ConvertTo-Json -Depth 10)
        }
        $currentStep='provision private database credentials'
        $credentials = Get-KubeObject 'secret' 'stray-kitty-mysql'
        if ($null -eq $credentials) {
            $data = @{}
            foreach ($name in @('root-password','app-password')) {
                $value = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
                $data[$name]=Encode-PrivateText $value
            }
            Set-PrivateSecret -Name 'stray-kitty-mysql' -Data $data
            $credentials=Get-KubeObject 'secret' 'stray-kitty-mysql'
        }
        foreach ($name in @('root-password','app-password')) {
            if (-not $credentials.data.ContainsKey($name) -or [Convert]::FromBase64String($credentials.data[$name]).Length -lt 32) { throw 'Existing database credentials are incomplete or too short.' }
        }
        $password=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($credentials.data['app-password']))
        # Passwords created here are random hexadecimal. Reject ambiguous existing DSNs.
        if ($password -cnotmatch '^[a-f0-9]{64}$') { throw 'Existing application password needs an explicitly verified DSN; automatic preparation stopped.' }
        $dsn=Encode-PrivateText "stray_kitty:${password}@tcp(stray-kitty-mysql:3306)/stray_kitty?parseTime=true"
        Set-PrivateSecret -Name 'stray-kitty-database-migration' -Data @{'game-dsn'=$dsn;'payment-dsn'=$dsn}
        $password=$null;$dsn=$null;$credentials=$null
        $currentStep='provision MySQL and durable backup volumes'
        $null = Invoke-Kube -Arguments @('apply','-f',$databaseManifest)
        foreach ($service in @('game','payment')) {
            $null = Invoke-Kube -Arguments @('apply','-f','-') -InputText ((New-DatabaseBackupPvc -Service $service) | ConvertTo-Json -Depth 10)
        }
        $null = Invoke-Kube -Arguments @('rollout','status','statefulset/stray-kitty-mysql','--timeout=600s')
        $currentStep='prepare isolated login and save smoke state'
        if ($null -eq (Get-KubeObject 'secret' $smokeName)) {
            $smoke = Invoke-Kube -Arguments @('exec','deployment/stray-kitty-game','--','/app/db-smoke','-phase','prepare','-base-url','http://127.0.0.1:8080')
            $null=$smoke.StdOut | ConvertFrom-Json
            Set-PrivateSecret -Name $smokeName -Data @{'state.json'=(Encode-PrivateText $smoke.StdOut)}
            $smoke=$null
        }
        $state=@{version=1;runId=$runId;pipelineId=$PipelineId;sourceCommit=$SourceCommit;namespace=$namespace;context=$context;phase='prepared';preparedAtUtc=[DateTime]::UtcNow.ToString('o');deployments=$deployments;smokeSecret=$smokeName;backups=@{}}
        Save-State
        Write-Output 'Database and backup volumes prepared; application traffic remains on file storage.'
        exit 0
    }

    if ($null -eq $state -or $state.sourceCommit -cne $SourceCommit -or $state.runId -cne $runId) { throw 'The matching prepared migration state is required.' }
    Assert-SameImages $state.deployments

    if ($Phase -eq 'Migrate') {
        if ($state.phase -cne 'prepared') { throw 'Migration is not in prepared state; inspect the recorded operation instead of re-importing.' }
        if (-not $env:BACKUP_PUBLIC_KEY_BASE64) { throw 'BACKUP_PUBLIC_KEY_BASE64 is required before entering maintenance.' }
        [StrayKittyDatabaseBackup]::ValidatePublicKey([Convert]::FromBase64String($env:BACKUP_PUBLIC_KEY_BASE64))
        if ($null -ne (Get-KubeObject 'secret' 'stray-kitty-preview-database')) { throw 'Application DSN already exists; refusing a second migration.' }
        $null=Get-SmokeState
        Write-KubeObject @{apiVersion='v1';kind='ConfigMap';metadata=@{name=$lockName;namespace=$namespace};data=@{runId=$runId;state=$stateName}}
        $state.phase='stopping-writers';Save-State
        $currentStep='stop all external traffic and legacy writers'
        $maintenanceStarted=$true
        $null=Invoke-Kube -Arguments @('scale','deployment','stray-kitty-frontend','stray-kitty-payment','stray-kitty-game','--replicas=0')
        $null=Invoke-Kube -Arguments @('wait','--for=delete','pod','-l','app.kubernetes.io/instance=haozhe-preview,app.kubernetes.io/component in (game,payment,frontend)','--timeout=240s')
        $state.phase='backing-up';Save-State
        $currentStep='create isolated read-only source and durable backup Pods'
        $pods=@{}
        foreach ($service in @('game','payment')) {
            $pod=New-DatabaseMigrationPod -Service $service -RunId $runId -Image $state.deployments[$service].image
            $pods[$service]=$pod.metadata.name
            Write-KubeObject $pod
            $null=Invoke-Kube -Arguments @('wait','--for=condition=Ready',"pod/$($pods[$service])",'--timeout=360s')
        }
        foreach ($service in @('game','payment')) {
            $currentStep="create and encrypt durable $service snapshot"
            $file=if($service -eq 'game'){'game.json'}else{'payments.json'}
            $snapshot="/backup/$runId/$file"
            $copyCommand="set -eu; umask 077; mkdir -p /backup/$runId; test ! -e $snapshot; cp /legacy/$file $snapshot; chmod 600 $snapshot; cmp /legacy/$file $snapshot; sync; sha256sum /legacy/$file $snapshot"
            $copied=Invoke-Kube -Arguments @('exec',$pods[$service],'--','sh','-ec',$copyCommand)
            $hashes=@($copied.StdOut -split "`r?`n" | Where-Object { $_ -match '^[a-f0-9]{64}  ' } | ForEach-Object { $_.Substring(0,64) })
            if($hashes.Count -ne 2 -or $hashes[0] -cne $hashes[1]){throw 'Source and durable backup hashes do not match.'}
            $local=Join-Path $scratchDirectory $file
            $null=Invoke-Kube -Arguments @('cp',"$($pods[$service]):$snapshot",$local)
            $null=New-Item -ItemType Directory -Path $artifactDirectory -Force
            $encryptedName="$service.snapshot.encrypted.json"
            $null=Write-EncryptedDatabaseBackup -SourcePath $local -DestinationPath (Join-Path $artifactDirectory $encryptedName) -PublicKeyBase64 $env:BACKUP_PUBLIC_KEY_BASE64 -ExpectedSha256 $hashes[0]
            $state.backups[$service]=@{pvc="stray-kitty-$service-db-backup";path=$snapshot;sha256=$hashes[0];encryptedArtifact=$encryptedName;bytes=(Get-Item -LiteralPath $local).Length}
            Save-State
        }
        if($state.backups.Count -ne 2){throw 'Both durable and encrypted backups are required before import.'}
        $currentStep='audit historical payment replay safety'
        $paymentText=[IO.File]::ReadAllText((Join-Path $scratchDirectory 'payments.json'))
        $null=Invoke-Kube -Arguments @('exec','-i',$pods.game,'--','sh','-ec','umask 077; cat > /tmp/payments-audit.json') -InputText $paymentText
        $paymentText=$null
        $audit=Invoke-Kube -Arguments @('exec',$pods.game,'--','/app/db-smoke','-phase','audit','-game-file',$state.backups.game.path,'-payments-file','/tmp/payments-audit.json')
        $state.audit=($audit.StdOut | ConvertFrom-Json -AsHashtable)
        $state.phase='importing';Save-State
        foreach($service in @('game','payment')){
            $source=if($service -eq 'game'){'game'}else{'payments'}
            $currentStep="import and verify $service snapshot"
            $null=Invoke-Kube -Arguments @('exec',$pods[$service],'--','/app/db-migrate','-source',$source,'-file',$state.backups[$service].path)
            $verified=Invoke-Kube -Arguments @('exec',$pods[$service],'--','/app/db-verify','-source',$source,'-file',$state.backups[$service].path)
            $state.backups[$service].verification=$verified.StdOut.Trim()
            Save-State
        }
        $currentStep='activate verified application database connections'
        $migrationSecret=Get-KubeObject 'secret' 'stray-kitty-database-migration'
        Set-PrivateSecret -Name 'stray-kitty-preview-database' -Data @{'game-dsn'=$migrationSecret.data['game-dsn'];'payment-dsn'=$migrationSecret.data['payment-dsn']}
        $migrationSecret=$null
        # Releasing old-source RWO volumes before application Pods prevents multi-attach.
        foreach($service in @('game','payment')){
            $null=Invoke-Kube -Arguments @('delete','pod',$pods[$service],'--wait=true','--timeout=180s')
        }
        foreach($service in @('payment','game')){
            $null=Invoke-Kube -Arguments @('scale','deployment',"stray-kitty-$service","--replicas=$($state.deployments[$service].replicas)")
            Wait-AppRollout $service
        }
        Assert-BackendReady
        $currentStep='verify migrated login save and sandbox payment behavior'
        $privateState=Get-SmokeState
        $smoke=Invoke-Kube -Arguments @('exec','-i','deployment/stray-kitty-game','--','/app/db-smoke','-phase','verify','-state-file','-','-base-url','http://127.0.0.1:8080') -InputText $privateState
        $null=$smoke.StdOut | ConvertFrom-Json
        Set-PrivateSecret -Name $smokeName -Data @{'state.json'=(Encode-PrivateText $smoke.StdOut)} -Update
        $privateState=$null;$smoke=$null
        $currentStep='restart database-backed applications and verify persistence'
        $null=Invoke-Kube -Arguments @('rollout','restart','deployment/stray-kitty-game','deployment/stray-kitty-payment')
        Wait-AppRollout 'payment';Wait-AppRollout 'game'
        Assert-BackendReady
        $privateState=Get-SmokeState
        $recheck=Invoke-Kube -Arguments @('exec','-i','deployment/stray-kitty-game','--','/app/db-smoke','-phase','recheck','-state-file','-','-base-url','http://127.0.0.1:8080') -InputText $privateState
        $privateState=$null
        $state.smoke=($recheck.StdOut | ConvertFrom-Json -AsHashtable)
        $state.phase='awaiting-finalize';$state.migratedAtUtc=[DateTime]::UtcNow.ToString('o');Save-State
        Write-Output 'Snapshots backed up and encrypted; imports and private restart checks passed. Frontend remains stopped pending Finalize.'
        exit 0
    }

    if($Phase -eq 'Finalize'){
        if($state.phase -cne 'awaiting-finalize'){throw 'Finalize requires successful migration and private restart checks.'}
        $lock=Get-KubeObject 'configmap' $lockName
        if($null -eq $lock -or $lock.data.runId -cne $runId){throw 'The matching active migration lock is required.'}
        $maintenanceStarted=$true
        $currentStep='final private readiness and persistence checks'
        Assert-BackendReady
        $recheck=Invoke-Kube -Arguments @('exec','-i','deployment/stray-kitty-game','--','/app/db-smoke','-phase','recheck','-state-file','-','-base-url','http://127.0.0.1:8080') -InputText (Get-SmokeState)
        $state.smoke=($recheck.StdOut | ConvertFrom-Json -AsHashtable)
        $currentStep='restore frontend traffic'
        $null=Invoke-Kube -Arguments @('scale','deployment','stray-kitty-frontend',"--replicas=$($state.deployments.frontend.replicas)")
        Wait-AppRollout 'frontend'
        $null=Wait-PublicHealth -Uri 'https://starry-kitty.duckdns.org/healthz'
        $state.phase='complete';$state.completedAtUtc=[DateTime]::UtcNow.ToString('o');Save-State
        $null=Invoke-Kube -Arguments @('delete','configmap',$lockName)
        Write-Output 'Database migration finalized; frontend traffic restored and public health passed.'
    }
} catch {
    # Never restore JSON or reopen traffic after a failed migration step.
    if($maintenanceStarted){
        try{$null=Invoke-Kube -Arguments @('scale','deployment','stray-kitty-frontend','--replicas=0')}catch{}
        if($null -ne $state){
            $state.phase='maintenance-failed';$state.failureStep=$currentStep;$state.failedAtUtc=[DateTime]::UtcNow.ToString('o')
            try{Save-State}catch{}
        }
    }
    Write-Host "Database failure stage: $currentStep"
    Write-DatabaseDiagnostics
    Write-Error "Database $Phase failed during '$currentStep'. No automatic file fallback or traffic restore was performed. Inspect the operation ConfigMap and retained backup PVCs."
    exit 1
} finally {
    $resolvedScratch=[IO.Path]::GetFullPath($scratchDirectory)
    $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if($resolvedScratch.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedScratch) -like 'kitty-db-*'){
        Remove-Item -LiteralPath $resolvedScratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}
