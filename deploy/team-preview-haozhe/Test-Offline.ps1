$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$testDirectory = Join-Path $PSScriptRoot 'test-output'
$null = New-Item -ItemType Directory -Path $testDirectory -Force
$validator = Join-Path $bundle 'Test-PreviewConfig.ps1'
$template = Get-Content -LiteralPath (Join-Path $bundle 'k8s/preview.template.json') -Raw
$results = [Collections.Generic.List[object]]::new()

$validTemplate = & $validator -AllowPlaceholder
if ($validTemplate.Validation -ne 'passed-offline' -or $validTemplate.ImagesSelected) { throw 'Template validation failed.' }
$results.Add([pscustomobject]@{case='valid-template';passed=$true})

function Expect-Rejection([string]$Name, [scriptblock]$Mutation) {
    $case = $template | ConvertFrom-Json
    & $Mutation $case
    $casePath = Join-Path $testDirectory ($Name + '.json')
    [IO.File]::WriteAllText($casePath, ($case | ConvertTo-Json -Depth 40), [Text.UTF8Encoding]::new($false))
    $rejected = $false
    try { $null = & $validator -ManifestPath $casePath -AllowPlaceholder } catch { $rejected = $true }
    if (-not $rejected) { throw ('Validator accepted unsafe case: ' + $Name) }
    $results.Add([pscustomobject]@{case=$Name;passed=$true})
}
function Get-Item([object]$doc, [string]$kind, [string]$name) {
    @($doc.items | Where-Object { $_.kind -eq $kind -and $_.metadata.name -eq $name })[0]
}
Expect-Rejection 'wrong-namespace' { param($c) (Get-Item $c 'Deployment' 'stray-kitty-game').metadata.namespace='default' }
Expect-Rejection 'multiple-writers' { param($c) (Get-Item $c 'Deployment' 'stray-kitty-game').spec.replicas=2 }
Expect-Rejection 'mutable-image' { param($c) (Get-Item $c 'Deployment' 'stray-kitty-frontend').spec.template.spec.containers[0].image='school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/frontend:latest' }
Expect-Rejection 'payment-exposed-publicly' { param($c) (Get-Item $c 'Service' 'stray-kitty-payment').spec.type='LoadBalancer' }
Expect-Rejection 'lb-targets-game' { param($c) (Get-Item $c 'Service' 'stray-kitty-preview').spec.selector.'app.kubernetes.io/component'='game' }
Expect-Rejection 'game-mounts-payment-volume' { param($c) (Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.volumes[0].persistentVolumeClaim.claimName='stray-kitty-payment-data' }
Expect-Rejection 'ephemeral-tls-state' { param($c) $pod=(Get-Item $c 'Deployment' 'stray-kitty-frontend').spec.template.spec; $pod.volumes=@($pod.volumes | ForEach-Object { if ($_.name -eq 'tls') { [pscustomobject]@{name='tls';emptyDir=[pscustomobject]@{}} } else { $_ } }) }
Expect-Rejection 'frontend-mounts-game-save' { param($c) $volume=@((Get-Item $c 'Deployment' 'stray-kitty-frontend').spec.template.spec.volumes | Where-Object name -eq 'acme')[0]; $volume.persistentVolumeClaim.claimName='stray-kitty-preview-data' }
Expect-Rejection 'literal-key' { param($c) $key=@((Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.containers[0].env | Where-Object name -eq 'ADVISOR_API_KEY')[0]; $key | Add-Member -NotePropertyName value -NotePropertyValue 'test-value-not-a-real-key' }
Expect-Rejection 'required-advisor-secret' { param($c) $key=@((Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.containers[0].env | Where-Object name -eq 'ADVISOR_API_KEY')[0]; $key.valueFrom.secretKeyRef.optional=$false }
Expect-Rejection 'missing-payment-url' { param($c) $envs=(Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.containers[0].env; (Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.containers[0].env=@($envs | Where-Object name -ne 'PAYMENT_URL') }
Expect-Rejection 'ephemeral-save' { param($c) (Get-Item $c 'Deployment' 'stray-kitty-game').spec.template.spec.volumes[0]=[pscustomobject]@{name='progress';emptyDir=[pscustomobject]@{}} }
Expect-Rejection 'reused-public-ip' { param($c) (Get-Item $c 'Service' 'stray-kitty-preview').spec | Add-Member -NotePropertyName loadBalancerIP -NotePropertyValue '192.0.2.55' }
Expect-Rejection 'namespace-resource' { param($c) $c.items += [pscustomobject]@{apiVersion='v1';kind='Namespace';metadata=[pscustomobject]@{name='cn-haozhe-wang'}} }

$placeholderRejected = $false
try { $null = & $validator } catch { $placeholderRejected=$true }
if (-not $placeholderRejected) { throw 'Unselected image was accepted as a release.' }
$results.Add([pscustomobject]@{case='unselected-release-rejected';passed=$true})

# Synthetic digest only tests offline rendering; it is deliberately not a release image.
$settings = Get-Content -LiteralPath (Join-Path $bundle 'release-settings.json') -Raw | ConvertFrom-Json
$testGame = $settings.images.game + '@sha256:' + ('a' * 64)
$testPayment = $settings.images.payment + '@sha256:' + ('b' * 64)
$testFrontend = $settings.images.frontend + '@sha256:' + ('c' * 64)
$testCommit = 'd' * 40
$renderDirectory = Join-Path $testDirectory 'synthetic-render'
$null = & (Join-Path $bundle 'Prepare-Preview.ps1') -GameImage $testGame -PaymentImage $testPayment -FrontendImage $testFrontend -SourceCommit $testCommit -OutputDirectory $renderDirectory
$rendered = Get-Content -LiteralPath (Join-Path $renderDirectory 'preview.json') -Raw | ConvertFrom-Json
$release = Get-Content -LiteralPath (Join-Path $renderDirectory 'release.json') -Raw | ConvertFrom-Json
if ($release.images.game -ne $testGame -or $release.images.payment -ne $testPayment -or $release.images.frontend -ne $testFrontend -or $release.sourceCommit -ne $testCommit -or $release.status -ne 'prepared-not-deployed') { throw 'Invalid release record.' }
$renderedGame = @($rendered.items | Where-Object { $_.kind -eq 'Deployment' -and $_.metadata.name -eq 'stray-kitty-game' })[0]
if ($renderedGame.spec.template.metadata.annotations.'stray-kitty/source-commit' -ne $testCommit) { throw 'Source revision was not embedded.' }
if ($renderedGame.spec.template.spec.containers[0].image -ne $testGame) { throw 'Game image was not rendered.' }
if ($release.manifestSha256 -ne (Get-FileHash -LiteralPath (Join-Path $renderDirectory 'preview.json') -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Manifest hash does not match.' }
$results.Add([pscustomobject]@{case='synthetic-render-and-hash';passed=$true})

$invalidImageRejected = $false
try { $null = & (Join-Path $bundle 'Prepare-Preview.ps1') -GameImage 'wrong-project:latest' -PaymentImage $testPayment -FrontendImage $testFrontend -SourceCommit $testCommit -OutputDirectory (Join-Path $testDirectory 'must-not-exist') } catch { $invalidImageRejected=$true }
if (-not $invalidImageRejected -or (Test-Path -LiteralPath (Join-Path $testDirectory 'must-not-exist'))) { throw 'Invalid input wrote a release directory.' }
$results.Add([pscustomobject]@{case='invalid-image-before-write';passed=$true})

$report = [ordered]@{status='passed';count=$results.Count;clusterContacted=$false;credentialsRead=$false;realImageBuilt=$false;cases=$results}
$json = $report | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $testDirectory 'validation-report.json'), $json, [Text.UTF8Encoding]::new($false))
$json
