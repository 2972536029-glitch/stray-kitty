Set-StrictMode -Version Latest

function Read-DatabaseOperationTools {
    param([Parameter(Mandatory)][string]$Directory,[Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedCommit)
    $manifest=Get-Content -LiteralPath (Join-Path $Directory 'manifest.json') -Raw | ConvertFrom-Json -AsHashtable
    if($manifest.version -ne 1 -or $manifest.sourceCommit -cne $ExpectedCommit -or
        $manifest.goos -cne 'linux' -or $manifest.goarch -cne 'amd64' -or
        $manifest.files -isnot [Collections.IDictionary] -or $manifest.files.Count -ne 2){
        throw 'Operation tools must be Linux amd64 artifacts from the executing CI commit.'
    }
    $result=@{sourceCommit=$ExpectedCommit;goos='linux';goarch='amd64';files=@{}}
    foreach($name in @('db-verify','db-smoke')){
        $path=Join-Path $Directory $name
        if(-not $manifest.files.Contains($name) -or $manifest.files[$name] -cnotmatch '^[a-f0-9]{64}$' -or
            -not(Test-Path -LiteralPath $path -PathType Leaf)) {throw 'An expected operation tool or its checksum is missing.'}
        $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if($hash -cne $manifest.files[$name]){throw 'Operation tool bytes do not match the CI artifact manifest.'}
        $result.files[$name]=@{path=[IO.Path]::GetFullPath($path);sha256=$hash}
    }
    return $result
}

function Get-DeploymentReplicaPatchArguments {
    param(
        [Parameter(Mandatory)][ValidateSet('game','payment','frontend')][string]$Service,
        [Parameter(Mandatory)][ValidateRange(0,1)][int]$Replicas
    )
    return @('patch','deployment',"stray-kitty-$Service",'--type=merge','-p',(@{spec=@{replicas=$Replicas}} | ConvertTo-Json -Compress))
}

function Get-SafeReplicaPatchError {
    param([AllowEmptyString()][string]$Text)
    $text=$Text -replace '(?i)Bearer\s+\S+','Bearer [redacted]'
    $text=$text -replace '(?i)(token|password|authorization)(\s*[:=]\s*)[^\s,;]+','$1$2[redacted]'
    $text=$text -replace '(?i)(https?://)[^\s/@:]+:[^\s/@]+@','$1[redacted]@'
    if($text.Length -gt 4096){$text=$text.Substring(0,4096)+' [truncated]'}
    return $text.Trim()
}

function Test-MigrationStopRetry {
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [AllowNull()][hashtable]$Lock,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$StateName,
        [bool]$AppDatabaseConfigured
    )
    if($AppDatabaseConfigured){throw 'Application DSN already exists; refusing an import retry.'}
    if($State.phase -ceq 'prepared'){
        if($null -ne $Lock){throw 'A prepared operation cannot take over an existing migration lock.'}
        return $false
    }
    if($State.phase -cne 'maintenance-failed' -or
        -not $State.ContainsKey('failureStep') -or
        $State.failureStep -cne 'stop all external traffic and legacy writers' -or
        -not $State.ContainsKey('backups') -or
        $State.backups -isnot [Collections.IDictionary] -or $State.backups.Count -ne 0 -or
        $null -eq $Lock -or -not $Lock.ContainsKey('data') -or
        $Lock.data.runId -cne $RunId -or $Lock.data.state -cne $StateName){
        throw 'Only the same locked stop-writers failure with no backups or database activation may resume.'
    }
    return $true
}

function Assert-BackedUpAuditState {
    param([hashtable]$State,[AllowNull()][hashtable]$Lock,[string]$RunId,[string]$StateName,[bool]$AppDatabaseConfigured)
    if($AppDatabaseConfigured -or $State.phase -cne 'maintenance-failed' -or
        $State.failureStep -cnotin @('audit historical payment replay safety','stage payment snapshot for historical replay audit','execute historical payment replay audit','parse historical replay audit result','record historical replay audit result') -or
        $State.backups -isnot [Collections.IDictionary] -or $State.backups.Count -ne 2 -or
        $null -eq $Lock -or $Lock.data.runId -cne $RunId -or $Lock.data.state -cne $StateName){
        throw 'Backup resume only accepts the same locked audit failure before any database activation.'
    }
    foreach($service in @('game','payment')){
        $file=if($service -ceq 'game'){'game.json'}else{'payments.json'}
        if(-not $State.backups.Contains($service) -or
            $State.backups[$service].pvc -cne "stray-kitty-$service-db-backup" -or
            $State.backups[$service].path -cne "/backup/$RunId/$file" -or
            $State.backups[$service].sha256 -cnotmatch '^[a-f0-9]{64}$'){
            throw 'Both original durable snapshot identities and hashes are required.'
        }
    }
    if($State.ContainsKey('transformation')){Assert-RecordedTestPaymentTransform -State $State -RunId $RunId}
}

function Assert-RecordedTestPaymentTransform {
    param([hashtable]$State,[string]$RunId)
    $t=$State.transformation
    if($t.type -cne 'legacy-test-payment-replay-suppression' -or
        $t.gameSourceSha256 -cne $State.backups.game.sha256 -or
        $t.paymentSourceSha256 -cne $State.backups.payment.sha256 -or
        $t.gameImportPath -cne "/backup/$RunId/game.import.json" -or
        $t.gameImportSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $t.operationScriptCommit -cnotmatch '^[a-f0-9]{40}$' -or
        $t.balancesPreserved -isnot [bool] -or -not $t.balancesPreserved -or
        $t.ledgerPreserved -isnot [bool] -or -not $t.ledgerPreserved){
        throw 'Recorded transformed snapshot provenance does not match the retained sources and policy.'
    }
}

function Get-TestPaymentSnapshotWriteMode {
    param([hashtable]$State,[string]$RunId,[string]$ExistingOutput,[string]$GeneratedSha256)
    $path="/backup/$RunId/game.import.json"
    if($ExistingOutput.Trim() -ceq 'ABSENT'){
        if($State.ContainsKey('transformation')){throw 'The recorded transformed snapshot is missing; recovery will not recreate it silently.'}
        return 'create'
    }
    if(-not $State.ContainsKey('transformation')){throw 'An unrecorded transformed snapshot cannot be overwritten or reused.'}
    Assert-RecordedTestPaymentTransform -State $State -RunId $RunId
    if($State.transformation.gameImportSha256 -cne $GeneratedSha256 -or $ExistingOutput.Trim() -cne "$GeneratedSha256  $path"){
        throw 'Existing transformed snapshot differs from its provenance or the verified reproducible transform.'
    }
    return 'reuse'
}

function Assert-AuditStagingHash {
    param([int]$ExitCode,[string]$Output,[string]$ExpectedSha256,[string]$Path)
    if($ExitCode -ne 0 -or $Output.Trim() -cne "$ExpectedSha256  $Path"){throw 'Payment audit staging failed or its hash differs from the retained ledger.'}
}

function Get-SafePaymentAuditError {
    param([AllowEmptyString()][string]$Text)
    $allowed=@('cannot read stopped game snapshot','cannot read stopped payment snapshot','invalid stopped snapshots','invalid player identities in snapshot','unresolved Xsolla credits or missing players require reconciliation before activation')
    $lines=[Collections.Generic.List[string]]::new()
    foreach($line in @($Text -split "`r?`n" | Where-Object {$_ -ne ''})){
        if($line.StartsWith('db-smoke: ') -and $line.Substring(10) -cin $allowed){$lines.Add($line)}
        elseif($line -cmatch '^flag provided but not defined: -[a-z-]+$' -or $line -cmatch '^command terminated with exit code [0-9]+$'){$lines.Add($line)}
        elseif($line -cmatch '^Error from server \((Forbidden|NotFound|BadRequest)\):'){$lines.Add("Kubernetes $($Matches[1])")}
        elseif($line -cmatch '^sh: .*Permission denied$'){$lines.Add('Shell permission denied')}
    }
    return ($lines -join '; ')
}

function Read-SafePaymentAuditResult {
    param([string]$Text)
    $result=$Text|ConvertFrom-Json -AsHashtable
    if($result.status -cnotin @('passed','blocked') -or $result.counts -isnot [Collections.IDictionary]){throw 'Audit output is not a recognized summary.'}
    $safe=@{status=$result.status;counts=@{}}
    foreach($key in @('players','accounts','confirmedTransactions','xsollaTransactions','knownApplied','ambiguousXsolla','ambiguousMock','missingPlayers','fullDisplayHistories')){
        if(-not $result.counts.Contains($key) -or $result.counts[$key] -isnot [ValueType] -or [string]$result.counts[$key] -notmatch '^\d+$'){throw 'Audit summary is missing a valid aggregate count.'}
        $safe.counts[$key]=[long]$result.counts[$key]
    }
    return $safe
}

function Assert-NeverImportedDatabaseMetrics {
    param([hashtable]$Metrics)
    $expected=@('game_players','game_sessions','game_accounts','payment_transactions','game_store_meta','payment_ledger_meta','schema_migrations')
    if($Metrics.Count -eq 0){return}
    if($Metrics.Count -ne $expected.Count){throw 'Partially initialized or unknown database tables cannot prove an untouched target.'}
    foreach($table in $expected){
        if(-not $Metrics.ContainsKey($table) -or $Metrics[$table].Count -ne 2){throw 'Incomplete database emptiness proof.'}
        $rows=[long]$Metrics[$table][0];$invalid=[long]$Metrics[$table][1]
        if($rows -lt 0 -or $invalid -ne 0){throw 'Database import markers or unknown schema state prevent pre-import recovery.'}
        if($table -in @('game_store_meta','payment_ledger_meta')){
            if($rows -ne 1){throw 'A store import marker is missing or duplicated.'}
        }elseif($table -eq 'schema_migrations'){
            if($rows -gt 1){throw 'Unexpected database schema migration history.'}
        }elseif($rows -ne 0){throw 'Database business rows prevent pre-import recovery.'}
    }
}

function Assert-OriginalSnapshotHashes {
    param([string]$Output,[ValidatePattern('^[a-f0-9]{64}$')][string]$Expected)
    $hashes=@($Output -split "`r?`n" | Where-Object {$_ -match '^[a-f0-9]{64}  '} | ForEach-Object {$_.Substring(0,64)})
    if($hashes.Count -ne 2 -or $hashes[0] -cne $Expected -or $hashes[1] -cne $Expected){throw 'Original file or durable backup changed since the verified snapshot.'}
}

# Byte-array wrappers keep the .NET span APIs usable on PowerShell 7.
if (-not ('StrayKittyDatabaseBackup' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Security.Cryptography;
using System.Text.Json;
public static class StrayKittyDatabaseBackup {
    public static void ValidatePublicKey(byte[] spki) {
        using (RSA rsa = RSA.Create()) {
            int read;
            rsa.ImportSubjectPublicKeyInfo(spki, out read);
            if (read != spki.Length || rsa.KeySize < 3072)
                throw new CryptographicException("RSA public key must be at least 3072 bits.");
        }
    }
    public static string Encrypt(byte[] plaintext, byte[] spki) {
        ValidatePublicKey(spki);
        byte[] key = RandomNumberGenerator.GetBytes(32);
        byte[] nonce = RandomNumberGenerator.GetBytes(12);
        byte[] tag = new byte[16];
        byte[] ciphertext = new byte[plaintext.Length];
        try {
            using (var aes = new AesGcm(key, 16)) aes.Encrypt(nonce, plaintext, ciphertext, tag);
            using (RSA rsa = RSA.Create()) {
                int read;
                rsa.ImportSubjectPublicKeyInfo(spki, out read);
                return JsonSerializer.Serialize(new {
                    version = 1,
                    algorithm = "RSA-OAEP-SHA256+AES-256-GCM",
                    encryptedKey = Convert.ToBase64String(rsa.Encrypt(key, RSAEncryptionPadding.OaepSHA256)),
                    nonce = Convert.ToBase64String(nonce),
                    tag = Convert.ToBase64String(tag),
                    ciphertext = Convert.ToBase64String(ciphertext),
                    sha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant()
                });
            }
        } finally { CryptographicOperations.ZeroMemory(key); }
    }
}
'@
}

function Write-EncryptedDatabaseBackup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$DestinationPath,
        [Parameter(Mandatory)][string]$PublicKeyBase64,
        [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSha256
    )
    $plaintext = [IO.File]::ReadAllBytes($SourcePath)
    try {
        $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($plaintext)).ToLowerInvariant()
        if ($actual -cne $ExpectedSha256) { throw 'Downloaded backup does not match the stopped-writer PVC snapshot.' }
        $envelope = [StrayKittyDatabaseBackup]::Encrypt($plaintext, [Convert]::FromBase64String($PublicKeyBase64))
        [IO.File]::WriteAllText($DestinationPath, $envelope, [Text.UTF8Encoding]::new($false))
        $saved = [IO.File]::ReadAllText($DestinationPath) | ConvertFrom-Json
        if ($saved.sha256 -cne $actual -or $saved.algorithm -cne 'RSA-OAEP-SHA256+AES-256-GCM') { throw 'Encrypted backup verification failed.' }
        return $actual
    } finally { [Array]::Clear($plaintext, 0, $plaintext.Length) }
}

function New-DatabaseBackupPvc {
    param([Parameter(Mandatory)][ValidateSet('game', 'payment')][string]$Service)
    return @{
        apiVersion = 'v1'; kind = 'PersistentVolumeClaim'
        metadata = @{ name = "stray-kitty-$Service-db-backup"; namespace = 'cn-haozhe-wang'; labels = @{ 'app.kubernetes.io/name'='stray-kitty'; 'app.kubernetes.io/component'='database-backup' } }
        spec = @{ accessModes = @('ReadWriteOnce'); resources = @{ requests = @{ storage = '2Gi' } } }
    }
}

function New-DatabaseMigrationPod {
    param(
        [Parameter(Mandatory)][ValidateSet('game', 'payment')][string]$Service,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$RunId,
        [Parameter(Mandatory)][string]$Image
    )
    $repo = "school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/$Service"
    if ($Image -cnotmatch ('^' + [regex]::Escape($repo) + '@sha256:[a-f0-9]{64}$')) { throw 'A verified project image digest is required.' }
    $sourcePvc = if ($Service -eq 'game') { 'stray-kitty-preview-data' } else { 'stray-kitty-payment-data' }
    return @{
        apiVersion='v1'; kind='Pod'
        metadata=@{name="stray-kitty-import-$Service-$RunId";namespace='cn-haozhe-wang';labels=@{'app.kubernetes.io/name'='stray-kitty';'stray-kitty/migration-run'=$RunId}}
        spec=@{
            restartPolicy='Never';automountServiceAccountToken=$false
            imagePullSecrets=@(@{name='stray-kitty-preview-registry'})
            securityContext=@{runAsNonRoot=$true;runAsUser=10001;runAsGroup=10001;fsGroup=10001;fsGroupChangePolicy='OnRootMismatch';seccompProfile=@{type='RuntimeDefault'}}
            containers=@(@{
                name='migration';image=$Image;command=@('/bin/sh','-c','sleep 86400')
                env=@(@{name=($Service.ToUpperInvariant() + '_MYSQL_DSN');valueFrom=@{secretKeyRef=@{name='stray-kitty-database-migration';key="$Service-dsn"}}})
                securityContext=@{readOnlyRootFilesystem=$true;allowPrivilegeEscalation=$false;capabilities=@{drop=@('ALL')}}
                resources=@{requests=@{cpu='50m';memory='64Mi'};limits=@{cpu='500m';memory='512Mi'}}
                volumeMounts=@(@{name='legacy';mountPath='/legacy';readOnly=$true},@{name='backup';mountPath='/backup'},@{name='tmp';mountPath='/tmp'})
            })
            volumes=@(
                @{name='legacy';persistentVolumeClaim=@{claimName=$sourcePvc;readOnly=$true}},
                @{name='backup';persistentVolumeClaim=@{claimName="stray-kitty-$Service-db-backup"}},
                @{name='tmp';emptyDir=@{sizeLimit='128Mi'}}
            )
        }
    }
}
