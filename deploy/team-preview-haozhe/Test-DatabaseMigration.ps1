$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Database.Common.ps1')
$passed=0
function Assert-Case([bool]$Condition,[string]$Name){
    if(-not $Condition){throw "Database migration test failed: $Name"}
    $script:passed++
    Write-Host "PASS $Name"
}
function Assert-Rejected([scriptblock]$Action,[string]$Name){
    $rejected=$false
    try{& $Action}catch{$rejected=$true}
    Assert-Case $rejected $Name
}
$directory=Join-Path ([IO.Path]::GetTempPath()) ('kitty-db-test-' + [Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $directory
$rsa=[Security.Cryptography.RSA]::Create(3072)
try{
    $toolsDirectory=Join-Path $directory 'operation-tools'
    $null=New-Item -ItemType Directory -Path $toolsDirectory
    $toolsManifest=@{version=1;sourceCommit=('a'*40);goos='linux';goarch='amd64';files=@{}}
    foreach($name in @('db-verify','db-smoke')){
        [IO.File]::WriteAllText((Join-Path $toolsDirectory $name),"synthetic-$name",[Text.UTF8Encoding]::new($false))
        $toolsManifest.files[$name]=(Get-FileHash -LiteralPath (Join-Path $toolsDirectory $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $toolsManifestPath=Join-Path $toolsDirectory 'manifest.json'
    [IO.File]::WriteAllText($toolsManifestPath,($toolsManifest|ConvertTo-Json -Depth 5))
    $operationTools=Read-DatabaseOperationTools -Directory $toolsDirectory -ExpectedCommit ('a'*40)
    Assert-Case ($operationTools.files.Count -eq 2 -and $operationTools.files['db-verify'].sha256 -ceq $toolsManifest.files['db-verify']) 'operation-tools-require-current-commit-and-exact-file-hashes'
    Assert-Rejected {Read-DatabaseOperationTools -Directory $toolsDirectory -ExpectedCommit ('b'*40)} 'operation-tools-reject-artifacts-from-another-commit'
    [IO.File]::AppendAllText((Join-Path $toolsDirectory 'db-verify'),'tamper')
    Assert-Rejected {Read-DatabaseOperationTools -Directory $toolsDirectory -ExpectedCommit ('a'*40)} 'operation-tools-reject-altered-binary-bytes'
    [IO.File]::WriteAllText((Join-Path $toolsDirectory 'db-verify'),'synthetic-db-verify',[Text.UTF8Encoding]::new($false))
    $source=Join-Path $directory 'snapshot.json'
    $output=Join-Path $directory 'snapshot.encrypted.json'
    $text='{"players":{"synthetic-player":{"private":"do-not-publish-this-test-value"}},"accounts":{}}'
    [IO.File]::WriteAllText($source,$text,[Text.UTF8Encoding]::new($false))
    $sha=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $public=[Convert]::ToBase64String($rsa.ExportSubjectPublicKeyInfo())
    $actual=Write-EncryptedDatabaseBackup -SourcePath $source -DestinationPath $output -PublicKeyBase64 $public -ExpectedSha256 $sha
    $raw=[IO.File]::ReadAllText($output)
    $envelope=$raw | ConvertFrom-Json
    Assert-Case ($actual -ceq $sha -and $envelope.sha256 -ceq $sha) 'encrypted-backup-preserves-source-hash'
    Assert-Case (-not $raw.Contains('synthetic-player') -and -not $raw.Contains('do-not-publish')) 'encrypted-artifact-has-no-plaintext'
    Assert-Case ($envelope.version -eq 1 -and $envelope.algorithm -ceq 'RSA-OAEP-SHA256+AES-256-GCM') 'versioned-envelope-identifies-algorithms'
    $key=$rsa.Decrypt([Convert]::FromBase64String($envelope.encryptedKey),[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
    $cipher=[Convert]::FromBase64String($envelope.ciphertext)
    $plain=[byte[]]::new($cipher.Length)
    $nonce=[Convert]::FromBase64String($envelope.nonce)
    $tag=[Convert]::FromBase64String($envelope.tag)
    $aes=[Security.Cryptography.AesGcm]::new($key,16)
    try{
        $aes.Decrypt($nonce,$cipher,$tag,$plain)
        Assert-Case ([Text.Encoding]::UTF8.GetString($plain) -ceq $text) 'private-key-decrypts-exact-snapshot'
        $cipher[0]=$cipher[0] -bxor 1
        Assert-Rejected { $aes.Decrypt($nonce,$cipher,$tag,$plain) } 'tampered-ciphertext-rejected'
    }finally{$aes.Dispose();[Array]::Clear($key,0,$key.Length);[Array]::Clear($plain,0,$plain.Length)}
    $mismatchOutput=Join-Path $directory 'must-not-exist.json'
    Assert-Rejected { Write-EncryptedDatabaseBackup -SourcePath $source -DestinationPath $mismatchOutput -PublicKeyBase64 $public -ExpectedSha256 ('0'*64) } 'source-download-hash-mismatch-rejected'
    Assert-Case (-not(Test-Path -LiteralPath $mismatchOutput)) 'hash-mismatch-does-not-create-artifact'
    $weak=[Security.Cryptography.RSA]::Create(2048)
    try{Assert-Rejected { [StrayKittyDatabaseBackup]::ValidatePublicKey($weak.ExportSubjectPublicKeyInfo()) } 'weak-public-key-rejected'}finally{$weak.Dispose()}
    Assert-Rejected { [StrayKittyDatabaseBackup]::ValidatePublicKey([byte[]]@(1,2,3)) } 'malformed-public-key-rejected'

    foreach($service in @('game','payment')){
        $image="school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/$service@sha256:"+('a'*64)
        $pod=New-DatabaseMigrationPod -Service $service -RunId 'db-123' -Image $image
        $container=$pod.spec.containers[0]
        Assert-Case ($pod.metadata.namespace -ceq 'cn-haozhe-wang' -and -not $pod.spec.automountServiceAccountToken) "$service-migration-is-scoped-without-api-token"
        Assert-Case ($pod.spec.volumes[0].persistentVolumeClaim.readOnly -and $container.volumeMounts[0].readOnly) "$service-source-volume-is-read-only"
        Assert-Case ($pod.spec.volumes[1].persistentVolumeClaim.claimName -ceq "stray-kitty-$service-db-backup" -and $container.volumeMounts[1].mountPath -ceq '/backup') "$service-backup-volume-is-separate-and-durable"
        Assert-Case ($container.env[0].valueFrom.secretKeyRef.name -ceq 'stray-kitty-database-migration' -and $container.securityContext.readOnlyRootFilesystem) "$service-dsn-is-secret-reference"
        $pvc=New-DatabaseBackupPvc -Service $service
        Assert-Case ($pvc.metadata.namespace -ceq 'cn-haozhe-wang' -and $pvc.spec.resources.requests.storage -ceq '2Gi') "$service-backup-claim-target"
    }
    Assert-Rejected { New-DatabaseMigrationPod -Service game -RunId 'db-123' -Image 'mysql:latest' } 'wrong-project-or-mutable-migration-image-rejected'
    Assert-Rejected { New-DatabaseMigrationPod -Service game -RunId 'db-123;exit' -Image ('school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game@sha256:'+('a'*64)) } 'unsafe-run-id-rejected'
    foreach($service in @('game','payment','frontend')){
        $patch=Get-DeploymentReplicaPatchArguments -Service $service -Replicas 0
        Assert-Case ($patch[0] -ceq 'patch' -and $patch[1] -ceq 'deployment' -and $patch[2] -ceq "stray-kitty-$service" -and (($patch[-1]|ConvertFrom-Json).spec.replicas -eq 0)) "$service-replica-change-uses-deployment-patch"
    }
    $stopFailure=@{phase='maintenance-failed';failureStep='stop all external traffic and legacy writers';backups=@{}}
    $sameLock=@{data=@{runId='db-8857';state='stray-kitty-db-migration-8857'}}
    Assert-Case (Test-MigrationStopRetry -State $stopFailure -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857') 'same-stop-failure-with-no-backups-can-resume'
    Assert-Case (-not(Test-MigrationStopRetry -State @{phase='prepared';backups=@{}} -Lock $null -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857')) 'fresh-prepared-operation-remains-supported'
    Assert-Rejected {Test-MigrationStopRetry -State $stopFailure -Lock $sameLock -RunId 'db-other' -StateName 'stray-kitty-db-migration-8857'} 'retry-does-not-take-another-run-lock'
    Assert-Rejected {Test-MigrationStopRetry -State $stopFailure -Lock $sameLock -RunId 'db-8857' -StateName 'different-state'} 'retry-requires-same-state-record'
    Assert-Rejected {Test-MigrationStopRetry -State $stopFailure -Lock $null -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'retry-requires-existing-lock'
    Assert-Rejected {Test-MigrationStopRetry -State $stopFailure -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857' -AppDatabaseConfigured $true} 'retry-rejects-enabled-application-database'
    $withBackup=@{phase='maintenance-failed';failureStep='stop all external traffic and legacy writers';backups=@{game=@{sha256='recorded'}}}
    Assert-Rejected {Test-MigrationStopRetry -State $withBackup -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'retry-rejects-any-existing-backup'
    $laterFailure=@{phase='maintenance-failed';failureStep='import and verify game snapshot';backups=@{}}
    Assert-Rejected {Test-MigrationStopRetry -State $laterFailure -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'retry-rejects-later-failure-stage'
    $backedState=@{phase='maintenance-failed';failureStep='audit historical payment replay safety';backups=@{
        game=@{pvc='stray-kitty-game-db-backup';path='/backup/db-8857/game.json';sha256=('a'*64)}
        payment=@{pvc='stray-kitty-payment-db-backup';path='/backup/db-8857/payments.json';sha256=('b'*64)}
    }}
    Assert-BackedUpAuditState -State $backedState -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'
    Assert-Case $true 'retained-backups-require-exact-audit-stage-and-same-lock'
    Assert-Rejected {Assert-BackedUpAuditState -State $backedState -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857' -AppDatabaseConfigured $true} 'retained-backups-reject-activated-database'
    $wrongPath=$backedState|ConvertTo-Json -Depth 8|ConvertFrom-Json -AsHashtable
    $wrongPath.backups.game.path='/backup/different/game.json'
    Assert-Rejected {Assert-BackedUpAuditState -State $wrongPath -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'retained-backups-reject-different-snapshot-path'
    $later=$backedState|ConvertTo-Json -Depth 8|ConvertFrom-Json -AsHashtable
    $later.failureStep='import and verify game snapshot'
    Assert-Rejected {Assert-BackedUpAuditState -State $later -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'retained-backups-reject-import-stage-failure'
    $retainedTransform=$backedState|ConvertTo-Json -Depth 8|ConvertFrom-Json -AsHashtable
    $retainedTransform.transformation=@{type='legacy-test-payment-replay-suppression';gameSourceSha256=('a'*64);paymentSourceSha256=('b'*64);gameImportSha256=('c'*64);gameImportPath='/backup/db-8857/game.import.json';operationScriptCommit=('d'*40);balancesPreserved=$true;ledgerPreserved=$true}
    Assert-BackedUpAuditState -State $retainedTransform -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'
    Assert-Case $true 'existing-transform-accepted-only-with-matching-source-provenance'
    $retainedLine=('c'*64)+'  /backup/db-8857/game.import.json'
    Assert-Case ((Get-TestPaymentSnapshotWriteMode -State $retainedTransform -RunId 'db-8857' -ExistingOutput $retainedLine -GeneratedSha256 ('c'*64)) -ceq 'reuse') 'existing-exact-transformed-file-is-reused-not-written'
    Assert-Rejected {Get-TestPaymentSnapshotWriteMode -State $retainedTransform -RunId 'db-8857' -ExistingOutput $retainedLine -GeneratedSha256 ('f'*64)} 'existing-transform-rejects-different-regenerated-hash'
    Assert-Rejected {Get-TestPaymentSnapshotWriteMode -State $retainedTransform -RunId 'db-8857' -ExistingOutput 'ABSENT' -GeneratedSha256 ('c'*64)} 'recorded-missing-transform-is-not-silently-recreated'
    Assert-AuditStagingHash -ExitCode 0 -Output (('b'*64)+'  /tmp/audit-fixture.json') -ExpectedSha256 ('b'*64) -Path '/tmp/audit-fixture.json'
    Assert-Case $true 'audit-staging-accepts-exact-original-ledger-hash'
    Assert-Rejected {Assert-AuditStagingHash -ExitCode 0 -Output (('f'*64)+'  /tmp/audit-fixture.json') -ExpectedSha256 ('b'*64) -Path '/tmp/audit-fixture.json'} 'audit-staging-rejects-content-change'
    Assert-Rejected {Assert-AuditStagingHash -ExitCode 1 -Output (('b'*64)+'  /tmp/audit-fixture.json') -ExpectedSha256 ('b'*64) -Path '/tmp/audit-fixture.json'} 'audit-staging-rejects-command-failure-even-with-hash'
    $retainedTransform.transformation.gameSourceSha256='e'*64
    Assert-Rejected {Assert-BackedUpAuditState -State $retainedTransform -Lock $sameLock -RunId 'db-8857' -StateName 'stray-kitty-db-migration-8857'} 'existing-transform-with-wrong-source-rejected'
    $auditSummary=Read-SafePaymentAuditResult -Text '{"status":"passed","counts":{"players":264,"accounts":10,"confirmedTransactions":17,"xsollaTransactions":9,"knownApplied":17,"ambiguousXsolla":0,"ambiguousMock":0,"missingPlayers":0,"fullDisplayHistories":0},"private":"NEVER_PRINT_THIS_PRIVATE_VALUE"}'
    Assert-Case ($auditSummary.status -ceq 'passed' -and $auditSummary.counts.knownApplied -eq 17 -and -not($auditSummary|ConvertTo-Json -Compress).Contains('NEVER_PRINT_THIS_PRIVATE_VALUE')) 'audit-output-exposes-only-known-aggregate-fields'
    Assert-Rejected {Read-SafePaymentAuditResult -Text '{"status":"passed","counts":{"players":"private"}}'} 'malformed-audit-summary-rejected'
    $auditError=Get-SafePaymentAuditError -Text "db-smoke: cannot read stopped game snapshot`nNEVER_PRINT_THIS_PRIVATE_VALUE`ncommand terminated with exit code 1"
    Assert-Case ($auditError.Contains('cannot read stopped game snapshot') -and -not $auditError.Contains('NEVER_PRINT_THIS_PRIVATE_VALUE')) 'audit-diagnostic-allows-fixed-errors-without-unknown-content'
    $unsafeAuditErrors=Get-SafePaymentAuditError -Text "Error from server (Forbidden): NEVER_PRINT_THIS_PRIVATE_VALUE`nError from server (NotFound): NEVER_PRINT_THIS_PRIVATE_VALUE`nError from server (BadRequest): NEVER_PRINT_THIS_PRIVATE_VALUE`nsh: NEVER_PRINT_THIS_PRIVATE_VALUE: Permission denied"
    Assert-Case ($unsafeAuditErrors -ceq 'Kubernetes Forbidden; Kubernetes NotFound; Kubernetes BadRequest; Shell permission denied') 'audit-diagnostic-reduces-kubernetes-and-shell-free-text-to-fixed-categories'
    Assert-NeverImportedDatabaseMetrics -Metrics @{}
    Assert-Case $true 'empty-uninitialized-database-accepted'
    $emptyDb=@{game_players=@(0,0);game_sessions=@(0,0);game_accounts=@(0,0);payment_transactions=@(0,0);game_store_meta=@(1,0);payment_ledger_meta=@(1,0);schema_migrations=@(1,0)}
    Assert-NeverImportedDatabaseMetrics -Metrics $emptyDb
    Assert-Case $true 'empty-runtime-schema-with-unset-import-markers-accepted'
    $withRows=$emptyDb.Clone();$withRows.game_players=@(1,0)
    Assert-Rejected {Assert-NeverImportedDatabaseMetrics -Metrics $withRows} 'database-with-any-player-row-rejected'
    $withImport=$emptyDb.Clone();$withImport.payment_ledger_meta=@(1,1)
    Assert-Rejected {Assert-NeverImportedDatabaseMetrics -Metrics $withImport} 'database-with-imported-marker-rejected'
    $withUnknown=$emptyDb.Clone();$withUnknown.unknown=@(0,0)
    Assert-Rejected {Assert-NeverImportedDatabaseMetrics -Metrics $withUnknown} 'unknown-database-table-rejected'
    $missingMarker=$emptyDb.Clone();$missingMarker.game_store_meta=@(0,0)
    Assert-Rejected {Assert-NeverImportedDatabaseMetrics -Metrics $missingMarker} 'missing-import-marker-rejected'
    Assert-OriginalSnapshotHashes -Output ((('a'*64)+'  /legacy/game.json')+"`n"+(('a'*64)+'  /backup/db-8857/game.json')) -Expected ('a'*64)
    Assert-Case $true 'original-and-backup-must-both-match-recorded-sha'
    Assert-Rejected {Assert-OriginalSnapshotHashes -Output ((('b'*64)+'  /legacy/game.json')+"`n"+(('a'*64)+'  /backup/db-8857/game.json')) -Expected ('a'*64)} 'changed-original-file-rejected'
    Assert-Rejected {Assert-OriginalSnapshotHashes -Output ((('a'*64)+'  /legacy/game.json')+"`n"+(('b'*64)+'  /backup/db-8857/game.json')) -Expected ('a'*64)} 'changed-durable-backup-rejected'
    $sanitized=Get-SafeReplicaPatchError -Text 'Error from server (Forbidden): deployments.apps denied; token=NEVER_PRINT_THIS_PRIVATE_VALUE Authorization: Bearer NEVER_PRINT_THIS_PRIVATE_VALUE'
    Assert-Case ($sanitized.Contains('Error from server (Forbidden): deployments.apps denied') -and -not $sanitized.Contains('NEVER_PRINT_THIS_PRIVATE_VALUE')) 'replica-patch-stderr-preserves-rbac-reason-and-redacts-tokens'
    foreach($file in @('Migrate-Database.ps1','Database.Common.ps1')){
        $tokens=$null;$errors=$null
        $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
        Assert-Case (@($errors).Count -eq 0) "$file-parses"
    }
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Migrate-Database.ps1'),[ref]$tokens,[ref]$errors)
    $installTool=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Install-DatabaseOperationTool'},$true)
    . ([scriptblock]::Create($installTool.Extent.Text))
    $script:toolCalls=@();$script:toolProbe='ABSENT'
    $expectedToolPath="/tmp/db-verify-$($operationTools.sourceCommit)-$($operationTools.files['db-verify'].sha256)"
    function Invoke-Kube {
        param([string[]]$Arguments,[string]$InputText)
        $script:toolCalls+=,@{Arguments=$Arguments;InputText=$InputText}
        if($null -ne $InputText -and $InputText -ne ''){return @{StdOut="$($operationTools.files['db-verify'].sha256)  $expectedToolPath"}}
        return @{StdOut=$script:toolProbe}
    }
    $installed=Install-DatabaseOperationTool -Pod 'synthetic-import-pod' -Name 'db-verify'
    Assert-Case ($installed -ceq $expectedToolPath -and $script:toolCalls.Count -eq 2 -and $script:toolCalls[1].Arguments[-1].Contains('chmod 500') -and [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($script:toolCalls[1].InputText)) -ceq 'synthetic-db-verify') 'operation-tools-stage-exact-artifact-with-readonly-executable-mode'
    $script:toolCalls=@();$script:toolProbe="$($operationTools.files['db-verify'].sha256)  $expectedToolPath"
    $null=Install-DatabaseOperationTool -Pod 'synthetic-import-pod' -Name 'db-verify'
    Assert-Case ($script:toolCalls.Count -eq 1) 'operation-tools-reuse-exact-staged-binary-without-writing'
    $script:toolProbe=('f'*64)+"  $expectedToolPath"
    Assert-Rejected {Install-DatabaseOperationTool -Pod 'synthetic-import-pod' -Name 'db-verify'} 'operation-tools-refuse-mismatched-existing-executable'
    $setReplica=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-ApplicationReplicas'},$true)
    . ([scriptblock]::Create($setReplica.Extent.Text))
    $kubeArguments=@('--namespace','cn-haozhe-wang');$currentStep='test replica patch';$script:replicaArguments=@()
    function Invoke-NativeChecked {
        param([string]$FilePath,[string[]]$Arguments,[string]$Step,[switch]$Quiet,[switch]$ReturnFailure)
        $script:replicaArguments=$Arguments
        return @{ExitCode=0;StdOut='';StdErr=''}
    }
    Set-ApplicationReplicas -Service frontend -Replicas 0 -DryRun
    Assert-Case ($script:replicaArguments -contains '--dry-run=server' -and $script:replicaArguments -contains 'patch' -and $script:replicaArguments -notcontains 'scale') 'replica-patch-preflight-is-server-dry-run-without-scale-subresource'
    $diagnostics=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-DatabaseDiagnostics'},$true)
    . ([scriptblock]::Create($diagnostics.Extent.Text))
    function Invoke-Kube {
        param([string[]]$Arguments)
        return @{StdOut='{"items":[{"metadata":{"name":"stray-kitty-mysql-0"},"spec":{"containers":[{"env":[{"value":"NEVER_PRINT_THIS_PRIVATE_VALUE"}]}]},"status":{"phase":"Pending","containerStatuses":[{"ready":false,"state":{"waiting":{"reason":"ImagePullBackOff","message":"NEVER_PRINT_THIS_PRIVATE_VALUE"}}}]}}]}'}
    }
    function Get-KubeObject { param([string]$Kind,[string]$Name) return $null }
    $diagnosticOutput=(& { Write-DatabaseDiagnostics } 6>&1 | Out-String)
    Assert-Case ($diagnosticOutput.Contains('phase=Pending ready=0/1 reasons=ImagePullBackOff')) 'failure-diagnostics-preserve-actionable-pod-state'
    Assert-Case (-not $diagnosticOutput.Contains('NEVER_PRINT_THIS_PRIVATE_VALUE')) 'failure-diagnostics-omit-env-and-free-text'
}finally{
    $rsa.Dispose()
    $resolved=[IO.Path]::GetFullPath($directory)
    $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
    if($resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -like 'kitty-db-test-*'){
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
Write-Output "$passed offline database migration tests passed; no cluster or credentials accessed."
