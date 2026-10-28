[CmdletBinding()]
param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot 'k8s/preview.template.json'),
    [switch]$AllowPlaceholder
)

# Offline validation only: no kubectl, Docker, network calls, or credential reads.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Assert-Config([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$text = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $ManifestPath).Path)
$document = $text | ConvertFrom-Json
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-settings.json') -Raw | ConvertFrom-Json
Assert-Config ($settings.namespace -eq 'cn-haozhe-wang') 'Unexpected target namespace in release settings.'
Assert-Config ($settings.context -eq 'haozhe-wang@gcp-k8s-xsolla-school-experiments') 'Unexpected target cluster context.'
Assert-Config ($document.apiVersion -eq 'v1' -and $document.kind -eq 'List') 'Expected a Kubernetes v1 List.'
Assert-Config (@($document.items).Count -eq 3) 'Only the preview PVC, Deployment, and Service may be included.'
Assert-Config ($text -notmatch '\b(?:sk|glpat)-[A-Za-z0-9_-]{8,}') 'A possible credential value was found in the manifest.'

$expectedNames = @{ PersistentVolumeClaim = 'stray-kitty-preview-data'; Deployment = 'stray-kitty-preview'; Service = 'stray-kitty-preview' }
foreach ($item in $document.items) {
    Assert-Config ($expectedNames.ContainsKey($item.kind)) ('Unexpected resource kind: ' + $item.kind)
    Assert-Config ($item.metadata.namespace -eq $settings.namespace) 'Every resource must explicitly target cn-haozhe-wang.'
    Assert-Config ($item.metadata.name -eq $expectedNames[$item.kind]) 'Unexpected resource name; shared or existing exercise resources must not be targeted.'
}
foreach ($kind in $expectedNames.Keys) {
    Assert-Config (@($document.items | Where-Object kind -eq $kind).Count -eq 1) ('Expected exactly one ' + $kind)
}
$pvc = @($document.items | Where-Object kind -eq 'PersistentVolumeClaim')[0]
$deployment = @($document.items | Where-Object kind -eq 'Deployment')[0]
$service = @($document.items | Where-Object kind -eq 'Service')[0]
$pod = $deployment.spec.template.spec
Assert-Config ($deployment.apiVersion -eq 'apps/v1' -and $pvc.apiVersion -eq 'v1' -and $service.apiVersion -eq 'v1') 'Unexpected resource API version.'
Assert-Config ($deployment.spec.replicas -eq 1 -and $deployment.spec.strategy.type -eq 'Recreate') 'The file-backed game requires one replica and Recreate updates.'
Assert-Config (@($pod.containers).Count -eq 1) 'Only the game container is expected.'
$game = $pod.containers[0]
$imagePattern = '^' + [regex]::Escape($settings.imageRepository) + '@sha256:[a-f0-9]{64}$'
$isPlaceholder = $game.image -eq 'RELEASE_IMAGE_NOT_SELECTED'
Assert-Config (($AllowPlaceholder -and $isPlaceholder) -or ($game.image -cmatch $imagePattern)) 'Select a verified image by registry SHA-256 digest; placeholders and mutable tags cannot be released.'

foreach ($selector in @($deployment.spec.selector.matchLabels, $deployment.spec.template.metadata.labels, $service.spec.selector)) {
    Assert-Config ($selector.'app.kubernetes.io/name' -eq 'stray-kitty' -and $selector.'app.kubernetes.io/instance' -eq 'haozhe-preview') 'Preview selectors must consistently isolate this game from other services.'
}
Assert-Config ($pod.automountServiceAccountToken -eq $false) 'The game does not require Kubernetes API credentials.'
Assert-Config ($pod.securityContext.runAsNonRoot -eq $true -and $pod.securityContext.runAsUser -eq 10001 -and $pod.securityContext.fsGroup -eq 10001) 'Runtime user and PVC group must match the image.'
Assert-Config ($game.securityContext.readOnlyRootFilesystem -eq $true -and $game.securityContext.allowPrivilegeEscalation -eq $false) 'Unexpected runtime write or privilege settings.'
Assert-Config ($pod.imagePullSecrets[0].name -eq $settings.registrySecret) 'Unexpected registry Secret reference.'

$envByName = @{}
foreach ($entry in $game.env) {
    Assert-Config (-not $envByName.ContainsKey($entry.name)) 'Duplicate environment variable.'
    $envByName[$entry.name] = $entry
}
foreach ($pair in @{ GAME_ADDR='0.0.0.0:8080'; GAME_DATA_FILE='/data/game.json'; GAME_WEB_DIR='/app/web'; ADVISOR_BASE_URL='https://api.deepseek.com' }.GetEnumerator()) {
    Assert-Config ($envByName.ContainsKey($pair.Key) -and $envByName[$pair.Key].value -eq $pair.Value) ('Invalid ' + $pair.Key)
}
Assert-Config ($envByName.ContainsKey('ADVISOR_MODEL') -and -not [string]::IsNullOrWhiteSpace($envByName['ADVISOR_MODEL'].value)) 'A model name is required.'
$keyEntry = $envByName['ADVISOR_API_KEY']
Assert-Config ($null -ne $keyEntry -and $null -eq $keyEntry.PSObject.Properties['value']) 'The model key must not be embedded as a value.'
Assert-Config ($keyEntry.valueFrom.secretKeyRef.name -eq $settings.advisorSecret -and $keyEntry.valueFrom.secretKeyRef.key -eq 'api-key' -and $keyEntry.valueFrom.secretKeyRef.optional -eq $true) 'The model key must use the required dedicated Secret.'
foreach ($limit in @('ADVISOR_MAX_CONCURRENT','ADVISOR_DAILY_REQUEST_LIMIT')) {
    $number = 0
    Assert-Config ($envByName.ContainsKey($limit) -and [int]::TryParse($envByName[$limit].value, [ref]$number) -and $number -gt 0 -and $number -le 10000) ('Invalid ' + $limit)
}

$progressMount = @($game.volumeMounts | Where-Object name -eq 'progress')
$progressVolume = @($pod.volumes | Where-Object name -eq 'progress')
Assert-Config ($progressMount.Count -eq 1 -and $progressMount[0].mountPath -eq '/data' -and $null -eq $progressMount[0].PSObject.Properties['subPath']) 'Mount the whole /data directory for atomic save operations.'
Assert-Config ($progressVolume.Count -eq 1 -and $progressVolume[0].persistentVolumeClaim.claimName -eq $pvc.metadata.name) 'Save data must use the dedicated PVC.'
Assert-Config (@($pvc.spec.accessModes).Count -eq 1 -and $pvc.spec.accessModes[0] -eq 'ReadWriteOnce' -and $pvc.spec.resources.requests.storage -eq '1Gi') 'Unexpected preview storage configuration.'
Assert-Config ($game.ports[0].name -eq 'http' -and $game.ports[0].containerPort -eq 8080) 'Container HTTP port must be 8080.'
Assert-Config ($game.readinessProbe.httpGet.path -eq '/readyz' -and $game.livenessProbe.httpGet.path -eq '/healthz') 'Invalid health probe paths.'
Assert-Config ($service.spec.type -eq 'LoadBalancer' -and $service.spec.ports[0].port -eq 80 -and $service.spec.ports[0].targetPort -eq 'http') 'Expected a LoadBalancer from port 80 to the game HTTP port.'
Assert-Config ($null -eq $service.spec.PSObject.Properties['loadBalancerIP'] -and $null -eq $service.spec.PSObject.Properties['externalIPs'] -and $null -eq $service.spec.ports[0].PSObject.Properties['nodePort']) 'Do not reuse another project IP or fixed node port.'
Assert-Config ($null -eq $service.metadata.PSObject.Properties['annotations']) 'Cloud-specific existing-resource annotations must not be copied from travel-cow.'

[pscustomobject]@{
    Validation = 'passed-offline'
    Namespace = $settings.namespace
    Resources = @($document.items | ForEach-Object { $_.kind + '/' + $_.metadata.name })
    ImageSelected = -not $isPlaceholder
    ClusterContacted = $false
    CredentialsRead = $false
}
