<#
.SYNOPSIS
  用三个服务的镜像 digest 渲染最终部署清单(离线,不接触集群)。
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$GameImage,
    [Parameter(Mandatory=$true)][string]$PaymentImage,
    [Parameter(Mandatory=$true)][string]$FrontendImage,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'rendered')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$null = & (Join-Path $PSScriptRoot 'Test-PreviewConfig.ps1') -AllowPlaceholder
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-settings.json') -Raw | ConvertFrom-Json
$document = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'k8s/preview.template.json') -Raw | ConvertFrom-Json

$images = @{ game = $GameImage; payment = $PaymentImage; frontend = $FrontendImage }
$deployments = @{}
foreach ($item in $document.items) {
    if ($item.kind -eq 'Deployment') { $deployments[$item.metadata.name] = $item }
}
$byComponent = @{ 'stray-kitty-game' = 'game'; 'stray-kitty-payment' = 'payment'; 'stray-kitty-frontend' = 'frontend' }
foreach ($name in $byComponent.Keys) {
    $component = $byComponent[$name]
    $pattern = '^' + [regex]::Escape($settings.images.$component) + '@sha256:[a-f0-9]{64}$'
    if ($images[$component] -cnotmatch $pattern) {
        throw ("{0} image must be the verified project image referenced by SHA-256 digest." -f $component)
    }
    $deployment = $deployments[$name]
    $deployment.spec.template.spec.containers[0].image = $images[$component]
    $deployment.metadata | Add-Member -NotePropertyName annotations -NotePropertyValue @{ 'stray-kitty/source-commit' = $SourceCommit } -Force
    $deployment.spec.template.metadata | Add-Member -NotePropertyName annotations -NotePropertyValue @{ 'stray-kitty/source-commit' = $SourceCommit } -Force
}

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
    images = $images
    manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    clusterContacted = $false
    credentialsRead = $false
}
[IO.File]::WriteAllText((Join-Path $outputPath 'release.json'), ($release | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$validation
Write-Output ('Prepared manifest: ' + $manifestPath)
Write-Output 'Files prepared locally; no image build, push, or deployment performed.'
