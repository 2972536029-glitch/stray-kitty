Set-StrictMode -Version Latest

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
