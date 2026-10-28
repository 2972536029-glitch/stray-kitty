[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Image,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'rendered')
)

# Prepare files only. This script never calls kubectl, Docker, Git, or a network API.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$null = & (Join-Path $PSScriptRoot 'Test-PreviewConfig.ps1') -AllowPlaceholder
$document = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'k8s/preview.template.json') -Raw | ConvertFrom-Json
$deployment = @($document.items | Where-Object kind -eq 'Deployment')[0]
$deployment.spec.template.spec.containers[0].image = $Image
$deployment.metadata | Add-Member -NotePropertyName annotations -NotePropertyValue @{ 'stray-kitty/source-commit' = $SourceCommit }
$deployment.spec.template.metadata | Add-Member -NotePropertyName annotations -NotePropertyValue @{ 'stray-kitty/source-commit' = $SourceCommit }

$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-settings.json') -Raw | ConvertFrom-Json
$pattern = '^' + [regex]::Escape($settings.imageRepository) + '@sha256:[a-f0-9]{64}$'
if ($Image -cnotmatch $pattern) { throw 'Image must be the verified project image referenced by SHA-256 digest, not a tag or placeholder.' }
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$null = New-Item -ItemType Directory -Path $outputPath -Force
$manifestPath = Join-Path $outputPath 'preview.json'
$candidatePath = Join-Path $outputPath ('.preview-' + [Guid]::NewGuid().ToString('N') + '.json')
try {
    [IO.File]::WriteAllText($candidatePath, ($document | ConvertTo-Json -Depth 40), [Text.UTF8Encoding]::new($false))
    $validation = & (Join-Path $PSScriptRoot 'Test-PreviewConfig.ps1') -ManifestPath $candidatePath
    Move-Item -LiteralPath $candidatePath -Destination $manifestPath -Force
} finally {
    if (Test-Path -LiteralPath $candidatePath) { Remove-Item -LiteralPath $candidatePath }
}
$release = [ordered]@{
    status = 'prepared-not-deployed'
    context = $settings.context
    namespace = $settings.namespace
    application = $settings.application
    sourceCommit = $SourceCommit
    image = $Image
    manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    clusterContacted = $false
    credentialsRead = $false
}
[IO.File]::WriteAllText((Join-Path $outputPath 'release.json'), ($release | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$validation
Write-Output ('Prepared manifest: ' + $manifestPath)
Write-Output 'Files prepared locally; no image build, push, or deployment performed.'
