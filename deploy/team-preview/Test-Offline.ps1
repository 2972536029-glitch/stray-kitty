$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$testDirectory = Join-Path $PSScriptRoot 'test-output'
$null = New-Item -ItemType Directory -Path $testDirectory -Force
$validator = Join-Path $bundle 'Test-PreviewConfig.ps1'
$template = Get-Content -LiteralPath (Join-Path $bundle 'k8s/preview.template.json') -Raw
$results = [Collections.Generic.List[object]]::new()

$validTemplate = & $validator -AllowPlaceholder
if ($validTemplate.Validation -ne 'passed-offline' -or $validTemplate.ImageSelected) { throw 'Template validation failed.' }
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
Expect-Rejection 'wrong-namespace' { param($c) $c.items[1].metadata.namespace='default' }
Expect-Rejection 'multiple-writers' { param($c) $c.items[1].spec.replicas=2 }
Expect-Rejection 'mismatched-service-selector' { param($c) $c.items[2].spec.selector.'app.kubernetes.io/instance'='another-game' }
Expect-Rejection 'mutable-image' { param($c) $c.items[1].spec.template.spec.containers[0].image='school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game:latest' }
Expect-Rejection 'literal-key' { param($c) $key=@($c.items[1].spec.template.spec.containers[0].env | Where-Object name -eq 'ADVISOR_API_KEY')[0]; $key | Add-Member -NotePropertyName value -NotePropertyValue 'test-value-not-a-real-key' }
Expect-Rejection 'optional-advisor-secret' { param($c) $key=@($c.items[1].spec.template.spec.containers[0].env | Where-Object name -eq 'ADVISOR_API_KEY')[0]; $key.valueFrom.secretKeyRef.optional=$true }
Expect-Rejection 'ephemeral-save' { param($c) $c.items[1].spec.template.spec.volumes[0]=[pscustomobject]@{name='progress';emptyDir=[pscustomobject]@{}} }
Expect-Rejection 'reused-public-ip' { param($c) $c.items[2].spec | Add-Member -NotePropertyName loadBalancerIP -NotePropertyValue '192.0.2.55' }
Expect-Rejection 'namespace-resource' { param($c) $c.items += [pscustomobject]@{apiVersion='v1';kind='Namespace';metadata=[pscustomobject]@{name='cn-qiwen-yan'}} }

$placeholderRejected = $false
try { $null = & $validator } catch { $placeholderRejected=$true }
if (-not $placeholderRejected) { throw 'Unselected image was accepted as a release.' }
$results.Add([pscustomobject]@{case='unselected-release-rejected';passed=$true})

# Synthetic digest only tests offline rendering; it is deliberately not a release image.
$testImage = 'school-gitlab.xsolla.dev:5050/haozhe_wang/stray-kitty/game@sha256:' + ('a' * 64)
$testCommit = 'b' * 40
$renderDirectory = Join-Path $testDirectory 'synthetic-render'
$null = & (Join-Path $bundle 'Prepare-Preview.ps1') -Image $testImage -SourceCommit $testCommit -OutputDirectory $renderDirectory
$rendered = Get-Content -LiteralPath (Join-Path $renderDirectory 'preview.json') -Raw | ConvertFrom-Json
$release = Get-Content -LiteralPath (Join-Path $renderDirectory 'release.json') -Raw | ConvertFrom-Json
if ($release.image -ne $testImage -or $release.sourceCommit -ne $testCommit -or $release.status -ne 'prepared-not-deployed') { throw 'Invalid release record.' }
if ($rendered.items[1].metadata.annotations.'stray-kitty/source-commit' -ne $testCommit) { throw 'Source revision was not embedded.' }
if ($release.manifestSha256 -ne (Get-FileHash -LiteralPath (Join-Path $renderDirectory 'preview.json') -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Manifest hash does not match.' }
$results.Add([pscustomobject]@{case='synthetic-render-and-hash';passed=$true})

$invalidImageRejected = $false
try { $null = & (Join-Path $bundle 'Prepare-Preview.ps1') -Image 'wrong-project:latest' -SourceCommit $testCommit -OutputDirectory (Join-Path $testDirectory 'must-not-exist') } catch { $invalidImageRejected=$true }
if (-not $invalidImageRejected -or (Test-Path -LiteralPath (Join-Path $testDirectory 'must-not-exist'))) { throw 'Invalid input wrote a release directory.' }
$results.Add([pscustomobject]@{case='invalid-image-before-write';passed=$true})

$report = [ordered]@{status='passed';count=$results.Count;clusterContacted=$false;credentialsRead=$false;realImageBuilt=$false;cases=$results}
$json = $report | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $testDirectory 'validation-report.json'), $json, [Text.UTF8Encoding]::new($false))
$json
