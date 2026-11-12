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
    foreach($file in @('Migrate-Database.ps1','Database.Common.ps1')){
        $tokens=$null;$errors=$null
        $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
        Assert-Case (@($errors).Count -eq 0) "$file-parses"
    }
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Migrate-Database.ps1'),[ref]$tokens,[ref]$errors)
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
