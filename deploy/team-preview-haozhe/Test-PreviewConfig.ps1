[CmdletBinding()]
param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot 'k8s/preview.template.json'),
    [switch]$AllowPlaceholder
)

# Offline validation only: no kubectl, Docker, network calls, or credential reads.
# 校验三服务拓扑:前端(nginx+LB)/游戏(ClusterIP+存档PVC)/支付(ClusterIP+账本PVC)。
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
Assert-Config (@($document.items).Count -eq 9) 'Expected exactly: 3 PVC, 3 Deployments, 3 Services.'
Assert-Config ($text -notmatch '\b(?:sk|glpat)-[A-Za-z0-9_-]{8,}') 'A possible credential value was found in the manifest.'

$expectedNames = @{
    PersistentVolumeClaim = @('stray-kitty-preview-data', 'stray-kitty-payment-data', 'stray-kitty-tls-state')
    Deployment            = @('stray-kitty-game', 'stray-kitty-payment', 'stray-kitty-frontend')
    Service               = @('stray-kitty-game', 'stray-kitty-payment', 'stray-kitty-preview')
}
foreach ($item in $document.items) {
    Assert-Config ($expectedNames.ContainsKey($item.kind)) ('Unexpected resource kind: ' + $item.kind)
    Assert-Config ($item.metadata.namespace -eq $settings.namespace) 'Every resource must explicitly target cn-haozhe-wang.'
    Assert-Config ($expectedNames[$item.kind] -contains $item.metadata.name) ('Unexpected resource name: ' + $item.metadata.name)
}
foreach ($kind in $expectedNames.Keys) {
    $count = @($document.items | Where-Object kind -eq $kind).Count
    Assert-Config ($count -eq $expectedNames[$kind].Count) ("Expected exactly {0} {1}" -f $expectedNames[$kind].Count, $kind)
}

function Get-Item([string]$kind, [string]$name) {
    @($document.items | Where-Object { $_.kind -eq $kind -and $_.metadata.name -eq $name })[0]
}
$deployments = @{
    game     = Get-Item 'Deployment' 'stray-kitty-game'
    payment  = Get-Item 'Deployment' 'stray-kitty-payment'
    frontend = Get-Item 'Deployment' 'stray-kitty-frontend'
}
$services = @{
    game     = Get-Item 'Service' 'stray-kitty-game'
    payment  = Get-Item 'Service' 'stray-kitty-payment'
    lb       = Get-Item 'Service' 'stray-kitty-preview'
}
$components = @{ game = 'game'; payment = 'payment'; frontend = 'frontend' }

# 1) 每个 Deployment:单副本 Recreate、组件标签一致、不挂 ServiceAccount 令牌、引用拉取 Secret、digest 镜像。
$imagePatternByRepo = @{
    game     = '^' + [regex]::Escape($settings.images.game) + '@sha256:[a-f0-9]{64}$'
    payment  = '^' + [regex]::Escape($settings.images.payment) + '@sha256:[a-f0-9]{64}$'
    frontend = '^' + [regex]::Escape($settings.images.frontend) + '@sha256:[a-f0-9]{64}$'
}
foreach ($name in $deployments.Keys) {
    $deployment = $deployments[$name]
    $pod = $deployment.spec.template.spec
    $labels = $deployment.spec.template.metadata.labels
    Assert-Config ($deployment.spec.replicas -eq 1 -and $deployment.spec.strategy.type -eq 'Recreate') ("Single replica with Recreate required for " + $name)
    Assert-Config ($labels.'app.kubernetes.io/instance' -eq 'haozhe-preview' -and $labels.'app.kubernetes.io/component' -eq $components[$name]) ("Consistent component labels required for " + $name)
    Assert-Config ($deployment.spec.selector.matchLabels.'app.kubernetes.io/component' -eq $components[$name]) ("Selector must pin the component for " + $name)
    # frontend 允许附加 cert sidecar(acme.sh,签发/续期 443 证书);game/payment 保持单容器。
    $maxContainers = if ($name -eq 'frontend') { 2 } else { 1 }
    Assert-Config (@($pod.containers).Count -ge 1 -and @($pod.containers).Count -le $maxContainers) ("At most " + $maxContainers + " container(s) expected in " + $name)
    Assert-Config ($pod.containers[0].name -eq $name) ("Primary container must be named " + $name)
    Assert-Config ($pod.automountServiceAccountToken -eq $false) ("No Kubernetes API credentials for " + $name)
    Assert-Config ($pod.imagePullSecrets[0].name -eq $settings.registrySecret) ("Registry Secret reference required for " + $name)
    Assert-Config ($pod.securityContext.runAsNonRoot -eq $true) ("Non-root required for " + $name)
    $container = $pod.containers[0]
    $isPlaceholder = $container.image -eq 'RELEASE_IMAGE_NOT_SELECTED'
    Assert-Config (($AllowPlaceholder -and $isPlaceholder) -or ($container.image -cmatch $imagePatternByRepo[$name])) ("Verified digest image required for " + $name)
    Assert-Config ($container.securityContext.readOnlyRootFilesystem -eq $true -and $container.securityContext.allowPrivilegeEscalation -eq $false) ("Hardened container required for " + $name)
}

# 2) 拓扑约束:游戏与支付仅集群内可达;唯一 LoadBalancer 指向前端。
Assert-Config ($services.game.spec.type -eq 'ClusterIP') 'Game service must stay cluster-internal.'
Assert-Config ($services.payment.spec.type -eq 'ClusterIP') 'Payment service must stay cluster-internal.'
Assert-Config ($services.lb.spec.type -eq 'LoadBalancer') 'Exactly the frontend entry may be a LoadBalancer.'
Assert-Config ($services.lb.spec.selector.'app.kubernetes.io/component' -eq 'frontend') 'The LoadBalancer must target the frontend.'
Assert-Config ($null -eq $services.lb.spec.PSObject.Properties['loadBalancerIP']) 'Do not pin a public IP in the manifest.'

# 3) 数据所有权:游戏只挂存档卷;支付只挂账本卷;前端只持久化证书与 ACME 状态。
$gamePod = $deployments.game.spec.template.spec
$paymentPod = $deployments.payment.spec.template.spec
Assert-Config ($gamePod.volumes[0].persistentVolumeClaim.claimName -eq 'stray-kitty-preview-data') 'Game must mount the save PVC.'
Assert-Config ($paymentPod.volumes[0].persistentVolumeClaim.claimName -eq 'stray-kitty-payment-data') 'Payment must mount its own ledger PVC.'
$frontendVolumes = @($deployments.frontend.spec.template.spec.volumes | Where-Object { $_.PSObject.Properties['persistentVolumeClaim'] })
Assert-Config ($frontendVolumes.Count -eq 2) 'Frontend must persist both installed TLS certificates and ACME account state.'
foreach ($volume in $frontendVolumes) {
    Assert-Config ($volume.name -in @('tls', 'acme') -and $volume.persistentVolumeClaim.claimName -eq 'stray-kitty-tls-state') 'Frontend may only mount its dedicated TLS state PVC.'
}
$frontendPod = $deployments.frontend.spec.template.spec
$tlsMount = @($frontendPod.containers[0].volumeMounts | Where-Object name -eq 'tls')[0]
Assert-Config ($tlsMount.readOnly -eq $true -and $tlsMount.subPath -eq 'certs') 'Nginx must read the installed certificates without write access.'
$certbot = @($frontendPod.containers | Where-Object name -eq 'certbot')[0]
$acmeMount = @($certbot.volumeMounts | Where-Object name -eq 'acme')[0]
Assert-Config ($acmeMount.mountPath -eq '/acme' -and $acmeMount.subPath -eq 'acme' -and $certbot.command[2] -match '--config-home /acme') 'ACME configuration and private keys must use the persistent directory.'

# 4) 游戏环境:指向支付 Service 的集群内地址;阿策密钥只允许可选 Secret 注入。
$envByName = @{}
foreach ($entry in $gamePod.containers[0].env) {
    Assert-Config (-not $envByName.ContainsKey($entry.name)) 'Duplicate environment variable.'
    $envByName[$entry.name] = $entry
}
foreach ($pair in @{ GAME_ADDR='0.0.0.0:8080'; GAME_DATA_FILE='/data/game.json'; GAME_WEB_DIR='disabled'; PAYMENT_URL='http://stray-kitty-payment:8082' }.GetEnumerator()) {
    Assert-Config ($envByName.ContainsKey($pair.Key) -and $envByName[$pair.Key].value -eq $pair.Value) ('Invalid ' + $pair.Key)
}
$keyEntry = $envByName['ADVISOR_API_KEY']
Assert-Config ($null -ne $keyEntry -and $null -eq $keyEntry.PSObject.Properties['value']) 'The model key must not be embedded as a value.'
Assert-Config ($keyEntry.valueFrom.secretKeyRef.name -eq $settings.advisorSecret -and $keyEntry.valueFrom.secretKeyRef.key -eq 'api-key' -and $keyEntry.valueFrom.secretKeyRef.optional -eq $true) 'The model key must use the optional dedicated Secret.'
$paymentEnv = @{}
foreach ($entry in $paymentPod.containers[0].env) { $paymentEnv[$entry.name] = $entry }
foreach ($pair in @{ PAYMENT_ADDR='0.0.0.0:8082'; PAYMENT_DATA_FILE='/data/payments.json' }.GetEnumerator()) {
    Assert-Config ($paymentEnv.ContainsKey($pair.Key) -and $paymentEnv[$pair.Key].value -eq $pair.Value) ('Invalid ' + $pair.Key)
}

[pscustomobject]@{
    Validation       = 'passed-offline'
    Namespace        = $settings.namespace
    Resources        = @($document.items | ForEach-Object { "$($_.kind)/$($_.metadata.name)" })
    ImagesSelected   = ($deployments.game.spec.template.spec.containers[0].image -ne 'RELEASE_IMAGE_NOT_SELECTED')
    ClusterContacted = $false
    CredentialsRead  = $false
}
