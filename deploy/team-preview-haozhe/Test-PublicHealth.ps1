$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'Release.Common.ps1')
$script:responses = @()
$script:requests = 0
$script:delays = 0
function Invoke-WebRequest {
    param($Uri, [switch]$UseBasicParsing, [int]$TimeoutSec, [string]$ErrorAction)
    $script:requests++
    $value = $script:responses[[Math]::Min($script:requests - 1, $script:responses.Count - 1)]
    if ($value -is [Exception]) { throw $value }
    return $value
}
function Start-Sleep { param([int]$Seconds) $script:delays++ }
function Reset-Probe([object[]]$Responses) {
    $script:responses = $Responses; $script:requests = 0; $script:delays = 0
}
function Assert-Probe([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "Health test failed: $Name" }
    Write-Output "PASS $Name"
}
$ok = [pscustomobject]@{ StatusCode = 200; Content = 'ok' }
Reset-Probe @([Exception]::new('Connection refused'), [Exception]::new('Connection refused'), $ok)
$result = Wait-PublicHealth -Uri 'http://example.test/healthz' -Attempts 3
Assert-Probe ($result.Content -eq 'ok' -and $result.Attempts -eq 3 -and $script:delays -eq 2) 'routing delay recovers within the probe budget'
Reset-Probe @([pscustomobject]@{ StatusCode = 200; Content = [Text.Encoding]::UTF8.GetBytes("ok`n") })
$result = Wait-PublicHealth -Uri 'http://example.test/healthz'
Assert-Probe ($result.Content -eq 'ok' -and $script:requests -eq 1 -and $script:delays -eq 0) 'byte health response accepted without sleeping'
Reset-Probe @([pscustomobject]@{ StatusCode = 200; Content = '{"status":"ok"}' })
$result = Wait-PublicHealth -Uri 'http://example.test/healthz'
Assert-Probe ($result.Content -eq '{"status":"ok"}') 'JSON health response accepted'
foreach ($value in @([Exception]::new('TLS certificate invalid'), [pscustomobject]@{StatusCode=200;Content='<html>not health</html>'}, [pscustomobject]@{StatusCode=200;Content='{"status":"failed"}'}, [pscustomobject]@{StatusCode=503;Content='ok'})) {
    Reset-Probe @($value)
    $failed = $false
    try { $null = Wait-PublicHealth -Uri 'https://example.test/healthz' -Attempts 3 } catch { $failed = $_.Exception.Message -match 'failed after 3 attempts' }
    Assert-Probe ($failed -and $script:requests -eq 3 -and $script:delays -eq 2) 'persistent network, TLS, status or body failure stays failed'
}
Write-Output '7 offline health probe tests passed; no network or cluster access.'
