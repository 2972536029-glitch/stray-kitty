<#
.SYNOPSIS
  Explicit CI-only database preparation, stopped-writer migration and final traffic restore.
  CI artifacts contain only public metadata and RSA/AES encrypted snapshots.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Prepare','Migrate','Finalize')][string]$Phase,
    [string]$SourceCommit = $env:CI_COMMIT_SHA,
    [string]$PipelineId = $env:CI_PIPELINE_ID,
    [switch]$ResumeBeforeBackup,
    [switch]$ResumeFromBackups,
    [switch]$LegacyTestPayments,
    [string]$OperationToolsDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Release.Common.ps1')
. (Join-Path $PSScriptRoot 'Database.Common.ps1')
. (Join-Path $PSScriptRoot 'TestPaymentMigration.Common.ps1')

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
$privateFailureDetail = ''
$operationTools = $null
$auditToolPath = '/app/db-smoke'
$verifyToolPaths = @{game='/app/db-verify';payment='/app/db-verify'}
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
function Invoke-PrivateAuditCommand {
    param([string[]]$Arguments,[AllowNull()][string]$InputText)
    Write-Host "Database operation: $currentStep"
    $result=Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments+$Arguments) -StandardInput $InputText -Step $currentStep -Quiet -ReturnFailure
    Write-Host "Audit substep exit code: $($result.ExitCode)"
    if($result.ExitCode -ne 0){
        $script:privateFailureDetail="exitCode=$($result.ExitCode)`nstderr:`n$($result.StdErr)`nstdout:`n$($result.StdOut)"
        $safeError=Get-SafePaymentAuditError -Text $result.StdErr
        if($safeError){Write-Host "Audit diagnostic: $safeError"}else{Write-Host 'Additional audit diagnostics will be retained only in encrypted failure artifacts.'}
    }
    return $result
}
function Install-DatabaseOperationTool {
    param([string]$Pod,[ValidateSet('db-verify','db-smoke')][string]$Name)
    $tool=$operationTools.files[$Name]
    $path="/tmp/$Name-$($operationTools.sourceCommit)-$($tool.sha256)"
    $probe=Invoke-Kube -Arguments @('exec',$Pod,'--','sh','-ec',"test `$(uname -m) = x86_64; if [ -e $path ]; then test -x $path; sha256sum $path; else printf 'ABSENT'; fi")
    if($probe.StdOut.Trim() -ceq 'ABSENT'){
        $bytes=[IO.File]::ReadAllBytes($tool.path)
        $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        if($hash -cne $tool.sha256){throw 'Operation tool changed after artifact validation.'}
        $command="set -eu; umask 077; test ! -e $path; base64 -d > $path; chmod 500 $path; sha256sum $path"
        $probe=Invoke-Kube -Arguments @('exec','-i',$Pod,'--','sh','-ec',$command) -InputText ([Convert]::ToBase64String($bytes))
    }
    if($probe.StdOut.Trim() -cne "$($tool.sha256)  $path"){throw 'Installed operation tool hash differs from its pinned artifact.'}
    return $path
}
function Set-ApplicationReplicas {
    param([Parameter(Mandatory)][ValidateSet('game','payment','frontend')][string]$Service,[Parameter(Mandatory)][ValidateRange(0,1)][int]$Replicas,[switch]$DryRun)
    Write-Host "Deployment replica patch: stray-kitty-$Service -> $Replicas (server dry-run: $DryRun)"
    $arguments=Get-DeploymentReplicaPatchArguments -Service $Service -Replicas $Replicas
    if($DryRun){$arguments+=@('--dry-run=server')}
    # This request contains only a fixed deployment name and spec.replicas, never
    # Secret values or private request records. Other native errors remain hidden.
    $result=Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments+$arguments) -Step $currentStep -Quiet -ReturnFailure
    if($result.ExitCode -ne 0){
        $diagnostic=Get-SafeReplicaPatchError -Text $result.StdErr
        if($diagnostic){Write-Host "Replica patch error: $diagnostic"}
        throw 'Deployment replica patch failed.'
    }
}
function Assert-RunningStoresStillUseFiles {
    $result=Invoke-Kube -Arguments @('get','pods','-l','app.kubernetes.io/instance=haozhe-preview,app.kubernetes.io/component in (game,payment)','-o','json')
    $pods=$result.StdOut | ConvertFrom-Json -AsHashtable
    foreach($pod in $pods.items){
        if(-not $pod.status.ContainsKey('phase') -or $pod.status.phase -cne 'Running'){continue}
        $service=$pod.metadata.labels['app.kubernetes.io/component']
        if($service -cnotin @('game','payment')){throw 'Unexpected application pod in stop-retry preflight.'}
        $port=if($service -ceq 'game'){'8080'}else{'8082'}
        $backend=if($service -ceq 'game'){'single-process-file'}else{'payment-ledger'}
        $result=Invoke-Kube -Arguments @('exec',$pod.metadata.name,'--','wget','-qO-',"http://127.0.0.1:$port/readyz")
        $ready=$result.StdOut | ConvertFrom-Json
        if($ready.status -cne 'ready' -or $ready.storage -cne $backend){throw 'A running application is not ready on its original file backend.'}
    }
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
function Get-NeverImportedDatabaseProof {
    $mysqlCommand='MYSQL_PWD=$(cat /run/secrets/mysql/root-password) mysql --protocol=socket -uroot --batch --skip-column-names --database=stray_kitty'
    $result=Invoke-Kube -Arguments @('exec','-i','stray-kitty-mysql-0','--','sh','-ec',$mysqlCommand) -InputText "START TRANSACTION READ ONLY; SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='stray_kitty' ORDER BY TABLE_NAME; COMMIT;"
    $tables=@($result.StdOut -split "`r?`n" | Where-Object {$_ -ne ''})
    $allowed=@('game_players','game_sessions','game_accounts','payment_transactions','game_store_meta','payment_ledger_meta','schema_migrations')
    if($tables.Count -eq 0){return @{}}
    if($tables.Count -ne $allowed.Count -or @($tables | Where-Object {$_ -cnotin $allowed}).Count -ne 0){throw 'Unknown or partial target schema prevents an untouched-database proof.'}
    $statements=@('START TRANSACTION READ ONLY;')
    foreach($table in $allowed){
        $invalid=if($table -in @('game_store_meta','payment_ledger_meta')){'COALESCE(SUM(id <> 1 OR imported <> 0),0)'}elseif($table -eq 'schema_migrations'){"COALESCE(SUM(version <> '002_persistent_stores.sql'),0)"}else{'0'}
        $statements+="SELECT '$table', COUNT(*), $invalid FROM $table;"
    }
    $statements+='COMMIT;'
    $result=Invoke-Kube -Arguments @('exec','-i','stray-kitty-mysql-0','--','sh','-ec',$mysqlCommand) -InputText ($statements -join "`n")
    $metrics=@{}
    foreach($line in @($result.StdOut -split "`r?`n" | Where-Object {$_ -ne ''})){
        $fields=$line -split "`t"
        if($fields.Count -ne 3 -or $fields[0] -cnotin $allowed -or $fields[1] -notmatch '^\d+$' -or $fields[2] -notmatch '^\d+$' -or $metrics.ContainsKey($fields[0])){throw 'Invalid read-only database proof response.'}
        $metrics[$fields[0]]=@([long]$fields[1],[long]$fields[2])
    }
    Assert-NeverImportedDatabaseMetrics -Metrics $metrics
    return $metrics
}
function Get-VerifiedRetainedSnapshotPods {
    $deployed=Get-DeployedEvidence
    foreach($service in @('game','payment','frontend')){
        if($deployed[$service].replicas -ne 0){throw 'Backup recovery requires all application deployments stopped.'}
    }
    $writers=Invoke-Kube -Arguments @('get','pods','-l','app.kubernetes.io/instance=haozhe-preview,app.kubernetes.io/component in (game,payment,frontend)','-o','json')
    if(@(($writers.StdOut|ConvertFrom-Json -AsHashtable).items).Count -ne 0){throw 'Application writer Pods must be absent before backup recovery.'}
    $databaseProof=Get-NeverImportedDatabaseProof
    Assert-NeverImportedDatabaseMetrics -Metrics $databaseProof
    $pods=@{}
    foreach($service in @('game','payment')){
        $podName="stray-kitty-import-$service-$runId"
        $pod=Get-KubeObject 'pod' $podName
        $file=if($service -ceq 'game'){'game.json'}else{'payments.json'}
        $sourcePvc=if($service -ceq 'game'){'stray-kitty-preview-data'}else{'stray-kitty-payment-data'}
        if($null -eq $pod -or $pod.metadata.labels['stray-kitty/migration-run'] -cne $runId -or $pod.status.phase -cne 'Running' -or $pod.spec.containers[0].image -cne $state.deployments[$service].image){throw 'The matching original migration Pod is required for hash proof.'}
        $legacy=@($pod.spec.volumes|Where-Object name -eq 'legacy')[0]
        $backup=@($pod.spec.volumes|Where-Object name -eq 'backup')[0]
        $mount=@($pod.spec.containers[0].volumeMounts|Where-Object name -eq 'legacy')[0]
        $backupMount=@($pod.spec.containers[0].volumeMounts|Where-Object name -eq 'backup')[0]
        if($legacy.persistentVolumeClaim.claimName -cne $sourcePvc -or -not $legacy.persistentVolumeClaim.readOnly -or -not $mount.readOnly -or $mount.mountPath -cne '/legacy' -or $backup.persistentVolumeClaim.claimName -cne $state.backups[$service].pvc -or $backupMount.mountPath -cne '/backup'){throw 'Migration Pod source/backup volume bindings differ from the saved operation.'}
        $hashes=Invoke-Kube -Arguments @('exec',$podName,'--','sha256sum',"/legacy/$file",$state.backups[$service].path)
        Assert-OriginalSnapshotHashes -Output $hashes.StdOut -Expected $state.backups[$service].sha256
        $pods[$service]=$podName
    }
    return $pods
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
    if($OperationToolsDirectory){
        if($Phase -cne 'Migrate' -or -not $ResumeFromBackups -or -not $LegacyTestPayments){throw 'Operation tool artifacts are restricted to explicit retained-backup recovery.'}
        $operationTools=Read-DatabaseOperationTools -Directory $OperationToolsDirectory -ExpectedCommit $env:CI_COMMIT_SHA
    }
    # Explicit context/namespace for every call; never read or export kubeconfig content.
    foreach ($permission in @(@('create','secrets'),@('create','configmaps'),@('create','persistentvolumeclaims'),@('create','pods'),@('patch','deployments'),@('create','statefulsets'),@('create','services'))) {
        $can = Invoke-Kube -Arguments (@('auth','can-i') + $permission)
        if ($can.StdOut.Trim() -cne 'yes') { throw 'The target namespace does not grant a required migration permission.' }
    }
    foreach($verb in @('get','update','patch')){
        $scaleAccess=Invoke-NativeChecked -FilePath 'kubectl' -Arguments ($kubeArguments+@('auth','can-i',$verb,'deployments/scale')) -Step 'Check optional scale-subresource permission' -Quiet -ReturnFailure
        Write-Host ("Optional deployments/scale permission: {0}={1}; replica changes use patch deployments." -f $verb,($scaleAccess.StdOut.Trim() -ceq 'yes'))
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
        $lock=Get-KubeObject 'configmap' $lockName
        $appDatabaseConfigured=$null -ne (Get-KubeObject 'secret' 'stray-kitty-preview-database')
        if($ResumeFromBackups){
            if(-not $LegacyTestPayments -or $ResumeBeforeBackup){throw 'Backup recovery requires -LegacyTestPayments and cannot combine stop-retry mode.'}
            Assert-BackedUpAuditState -State $state -Lock $lock -RunId $runId -StateName $stateName -AppDatabaseConfigured $appDatabaseConfigured
            if(-not $env:BACKUP_PUBLIC_KEY_BASE64){throw 'The original backup public key is required for recovery artifacts.'}
            [StrayKittyDatabaseBackup]::ValidatePublicKey([Convert]::FromBase64String($env:BACKUP_PUBLIC_KEY_BASE64))
            $currentStep='verify stopped writers empty database and retained backup hashes'
            $pods=Get-VerifiedRetainedSnapshotPods
            if($null -ne $operationTools){
                $currentStep='stage checksum-pinned recovery operation tools'
                foreach($service in @('game','payment')){$verifyToolPaths[$service]=Install-DatabaseOperationTool -Pod $pods[$service] -Name 'db-verify'}
                $auditToolPath=Install-DatabaseOperationTool -Pod $pods.game -Name 'db-smoke'
                $state.operationTools=@{sourceCommit=$operationTools.sourceCommit;goos=$operationTools.goos;goarch=$operationTools.goarch;files=@{}}
                foreach($name in @('db-verify','db-smoke')){$state.operationTools.files[$name]=$operationTools.files[$name].sha256}
            }
            $maintenanceStarted=$true
            $null=New-Item -ItemType Directory -Path $artifactDirectory -Force
            foreach($service in @('game','payment')){
                $file=if($service -ceq 'game'){'game.json'}else{'payments.json'}
                $local=Join-Path $scratchDirectory $file
                $null=Invoke-Kube -Arguments @('cp',"$($pods[$service]):$($state.backups[$service].path)",$local)
                $null=Write-EncryptedDatabaseBackup -SourcePath $local -DestinationPath (Join-Path $artifactDirectory "$service.snapshot.encrypted.json") -PublicKeyBase64 $env:BACKUP_PUBLIC_KEY_BASE64 -ExpectedSha256 $state.backups[$service].sha256
            }
            $currentStep='prepare balance-preserving legacy test payment replay suppression'
            $gameSource=Join-Path $scratchDirectory 'game.json'
            $paymentSource=Join-Path $scratchDirectory 'payments.json'
            $gameImport=Join-Path $scratchDirectory 'game.import.json'
            $transform=New-LegacyTestPaymentImport -GamePath $gameSource -PaymentsPath $paymentSource -OutputPath $gameImport
            $null=Test-LegacyTestPaymentImport -GamePath $gameSource -PaymentsPath $paymentSource -OutputPath $gameImport
            $importSha=(Get-FileHash -LiteralPath $gameImport -Algorithm SHA256).Hash.ToLowerInvariant()
            $importPath="/backup/$runId/game.import.json"
            $existingImport=Invoke-Kube -Arguments @('exec',$pods.game,'--','sh','-ec',"if [ -e $importPath ]; then sha256sum $importPath; else printf 'ABSENT'; fi")
            $writeMode=Get-TestPaymentSnapshotWriteMode -State $state -RunId $runId -ExistingOutput $existingImport.StdOut -GeneratedSha256 $importSha
            if($writeMode -ceq 'create'){
                $writeImport="set -eu; umask 077; test ! -e $importPath; cat > $importPath; chmod 400 $importPath; sync; sha256sum $importPath"
                $written=Invoke-Kube -Arguments @('exec','-i',$pods.game,'--','sh','-ec',$writeImport) -InputText ([IO.File]::ReadAllText($gameImport))
                if($written.StdOut.Trim() -cne "$importSha  $importPath"){throw 'Durable transformed import snapshot hash does not match the verified local transform.'}
            }else{
                Write-Host 'Reusing the immutable transformed snapshot after matching recorded and regenerated SHA-256.'
            }
            $null=Write-EncryptedDatabaseBackup -SourcePath $gameImport -DestinationPath (Join-Path $artifactDirectory 'game.import.encrypted.json') -PublicKeyBase64 $env:BACKUP_PUBLIC_KEY_BASE64 -ExpectedSha256 $importSha
            $importPaths=@{game=$importPath;payment=$state.backups.payment.path}
            if(-not $state.ContainsKey('transformation')){
                $state.transformation=@{type='legacy-test-payment-replay-suppression';gameSourceSha256=$state.backups.game.sha256;paymentSourceSha256=$state.backups.payment.sha256;gameImportSha256=$importSha;gameImportPath=$importPath;encryptedArtifact='game.import.encrypted.json';summary=$transform;operationScriptCommit=$env:CI_COMMIT_SHA;balancesPreserved=$true;ledgerPreserved=$true}
            }else{$state.transformation.lastRecoveryScriptCommit=$env:CI_COMMIT_SHA}
            Save-State
        }else{
            if($LegacyTestPayments){throw '-LegacyTestPayments is only valid with an explicitly verified retained-backup recovery.'}
        $retryStop=Test-MigrationStopRetry -State $state -Lock $lock -RunId $runId -StateName $stateName -AppDatabaseConfigured $appDatabaseConfigured
        if($retryStop -and -not $ResumeBeforeBackup){throw 'Use -ResumeBeforeBackup only after reviewing this pre-backup stop failure.'}
        if($ResumeBeforeBackup -and -not $retryStop){throw '-ResumeBeforeBackup requires the exact recorded pre-backup stop failure.'}
        if (-not $env:BACKUP_PUBLIC_KEY_BASE64) { throw 'BACKUP_PUBLIC_KEY_BASE64 is required before entering maintenance.' }
        [StrayKittyDatabaseBackup]::ValidatePublicKey([Convert]::FromBase64String($env:BACKUP_PUBLIC_KEY_BASE64))
        $null=Get-SmokeState
        if($retryStop){
            $currentStep='verify unchanged file stores before retrying writer stop'
            Assert-RunningStoresStillUseFiles
            $existingPods=Invoke-Kube -Arguments @('get','pods','-l',"stray-kitty/migration-run=$runId",'-o','json')
            if(@(($existingPods.StdOut | ConvertFrom-Json -AsHashtable).items).Count -ne 0){throw 'A pre-backup stop retry cannot reuse existing migration Pods.'}
            Write-Host 'Resuming the same stop-writers failure; no prior backups or import exist.'
        }
        $currentStep='server-side replica patch preflight'
        foreach($service in @('frontend','payment','game')){Set-ApplicationReplicas -Service $service -Replicas 0 -DryRun}
        if(-not $retryStop){
            Write-KubeObject @{apiVersion='v1';kind='ConfigMap';metadata=@{name=$lockName;namespace=$namespace};data=@{runId=$runId;state=$stateName}}
        }
        $state.phase='stopping-writers';Save-State
        $currentStep='stop all external traffic and legacy writers'
        $maintenanceStarted=$true
        foreach($service in @('frontend','payment','game')){Set-ApplicationReplicas -Service $service -Replicas 0}
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
            $importPaths=@{game=$state.backups.game.path;payment=$state.backups.payment.path}
        }
        if($state.backups.Count -ne 2){throw 'Both durable and encrypted backups are required before import.'}
        $currentStep='stage payment snapshot for historical replay audit'
        $paymentText=[IO.File]::ReadAllText((Join-Path $scratchDirectory 'payments.json'))
        $auditPaymentPath='/tmp/payments-audit-'+[Guid]::NewGuid().ToString('N')+'.json'
        $stageAudit="set -eu; umask 077; test ! -e $auditPaymentPath; cat > $auditPaymentPath; chmod 400 $auditPaymentPath; sha256sum $auditPaymentPath"
        $staged=Invoke-PrivateAuditCommand -Arguments @('exec','-i',$pods.game,'--','sh','-ec',$stageAudit) -InputText $paymentText
        $paymentText=$null
        Assert-AuditStagingHash -ExitCode $staged.ExitCode -Output $staged.StdOut -ExpectedSha256 $state.backups.payment.sha256 -Path $auditPaymentPath
        $currentStep='execute historical payment replay audit'
        $audit=Invoke-PrivateAuditCommand -Arguments @('exec',$pods.game,'--',$auditToolPath,'-phase','audit','-game-file',$importPaths.game,'-payments-file',$auditPaymentPath)
        $currentStep='parse historical replay audit result'
        $state.audit=Read-SafePaymentAuditResult -Text $audit.StdOut
        Write-Host ('Audit summary: '+($state.audit|ConvertTo-Json -Depth 5 -Compress))
        $currentStep='record historical replay audit result'
        Save-State
        if($audit.ExitCode -ne 0 -or $state.audit.status -cne 'passed'){throw 'Historical replay audit did not pass.'}
        $state.phase='importing';Save-State
        foreach($service in @('game','payment')){
            $source=if($service -eq 'game'){'game'}else{'payments'}
            $currentStep="import and verify $service snapshot"
            $null=Invoke-Kube -Arguments @('exec',$pods[$service],'--','/app/db-migrate','-source',$source,'-file',$importPaths[$service])
            $verified=Invoke-Kube -Arguments @('exec',$pods[$service],'--',$verifyToolPaths[$service],'-source',$source,'-file',$importPaths[$service])
            if($ResumeFromBackups -and $service -ceq 'game'){$state.transformation.verification=$verified.StdOut.Trim()}else{$state.backups[$service].verification=$verified.StdOut.Trim()}
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
            Set-ApplicationReplicas -Service $service -Replicas $state.deployments[$service].replicas
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
        Set-ApplicationReplicas -Service frontend -Replicas $state.deployments.frontend.replicas
        Wait-AppRollout 'frontend'
        $null=Wait-PublicHealth -Uri 'https://starry-kitty.duckdns.org/healthz'
        $state.phase='complete';$state.completedAtUtc=[DateTime]::UtcNow.ToString('o');Save-State
        $null=Invoke-Kube -Arguments @('delete','configmap',$lockName)
        Write-Output 'Database migration finalized; frontend traffic restored and public health passed.'
    }
} catch {
    $failureRecord=$_
    Write-Host ("Failure exception type: {0}; script line: {1}" -f $failureRecord.Exception.GetType().FullName,$failureRecord.InvocationInfo.ScriptLineNumber)
    if($env:BACKUP_PUBLIC_KEY_BASE64){
        try{
            $detail="step=$currentStep`nexception=$($failureRecord.Exception.Message)`n$privateFailureDetail"
            $bytes=[Text.Encoding]::UTF8.GetBytes($detail)
            try{
                $encrypted=[StrayKittyDatabaseBackup]::Encrypt($bytes,[Convert]::FromBase64String($env:BACKUP_PUBLIC_KEY_BASE64))
                $null=New-Item -ItemType Directory -Path $artifactDirectory -Force
                [IO.File]::WriteAllText((Join-Path $artifactDirectory 'failure-diagnostic.encrypted.json'),$encrypted,[Text.UTF8Encoding]::new($false))
            }finally{[Array]::Clear($bytes,0,$bytes.Length)}
        }catch{Write-Host 'Encrypted failure diagnostic could not be saved.'}
    }
    # Never restore JSON or reopen traffic after a failed migration step.
    if($maintenanceStarted){
        try{Set-ApplicationReplicas -Service frontend -Replicas 0}catch{}
        if($null -ne $state){
            $state.phase='maintenance-failed';$state.failureStep=$currentStep
            $state.failedAtUtc=[DateTime]::UtcNow.ToString('o')
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
