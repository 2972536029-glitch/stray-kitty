# Offline tests for the release runner and native-command failure handling.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bundle = $PSScriptRoot
. (Join-Path $bundle 'Release.Common.ps1')

$results = [Collections.Generic.List[object]]::new()

function Assert-Case([string]$Name, [bool]$Condition) {
    if (-not $Condition) { throw "Release test failed: $Name" }
    $results.Add([pscustomobject]@{ case = $Name; passed = $true })
}

$deployPath = Join-Path $bundle 'Deploy-Preview.ps1'
$deployText = Get-Content -LiteralPath $deployPath -Raw
$tokens = $null
$parseErrors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($deployPath, [ref]$tokens, [ref]$parseErrors)
Assert-Case 'deployment-script-parses' (@($parseErrors).Count -eq 0)

$commonPath = Join-Path $bundle 'Release.Common.ps1'
$null = [System.Management.Automation.Language.Parser]::ParseFile($commonPath, [ref]$tokens, [ref]$parseErrors)
Assert-Case 'release-helper-parses' (@($parseErrors).Count -eq 0)

$dockerfileFromWorktree = $deployText.Contains('Join-Path $worktreeBundle $service.Dockerfile')
$rendererFromWorktree = $deployText.Contains('Join-Path $worktreeBundle ''Prepare-Preview.ps1''')
Assert-Case 'dockerfiles-resolved-from-detached-worktree' $dockerfileFromWorktree
Assert-Case 'renderer-resolved-from-detached-worktree' $rendererFromWorktree
Assert-Case 'release-settings-resolved-from-detached-worktree' ($deployText.Contains('Join-Path $worktreeBundle ''release-settings.json'''))
Assert-Case 'template-validator-required-in-worktree' ($deployText.Contains("'Test-PreviewConfig.ps1'") -and $deployText.Contains("'k8s/preview.template.json'"))
Assert-Case 'archive-path-is-commit-scoped' ($deployText.Contains('releases/" + $Commit + "/" + $runId'))

$tokens = $null
$parseErrors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($deployPath, [ref]$tokens, [ref]$parseErrors)
$ast = [System.Management.Automation.Language.Parser]::ParseFile($deployPath, [ref]$tokens, [ref]$parseErrors)
$directNativeCalls = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.CommandAst] -and
    $node.GetCommandName() -in @('git', 'docker', 'kubectl')
}, $true))
Assert-Case 'all-git-docker-kubectl-calls-use-exit-code-wrapper' ($directNativeCalls.Count -eq 0)

$comspec = $env:ComSpec
if ([string]::IsNullOrWhiteSpace($comspec)) { throw 'ComSpec is not available for native-process tests.' }
$gitVersion = Invoke-NativeChecked -FilePath 'git' -Arguments @('--version') -Step 'test Git executable resolution' -Quiet
Assert-Case 'native-git-executable-resolves' ($gitVersion.StdOut -match '^git version ')

$success = Invoke-NativeChecked -FilePath $comspec -Arguments @('/d', '/c', 'exit 0') -Step 'test success' -Quiet
Assert-Case 'native-zero-exit-accepted' ($success.ExitCode -eq 0)

$echo = Invoke-NativeChecked -FilePath $comspec -Arguments @('/d', '/c', 'echo release-helper-ok') -Step 'test stdout capture' -Quiet
Assert-Case 'native-stdout-captured' ($echo.StdOut.Trim() -eq 'release-helper-ok')

$nonZeroRejected = $false
try {
    $null = Invoke-NativeChecked -FilePath $comspec -Arguments @('/d', '/c', 'exit 23') -Step 'synthetic failing command' -Quiet
} catch {
    $nonZeroRejected = $_.Exception.Message -match 'exit code 23'
}
Assert-Case 'native-nonzero-exit-throws' $nonZeroRejected

$tempPath = Join-Path $env:TEMP ('stray-kitty-release-test-' + [Guid]::NewGuid().ToString('N') + '.json')
try {
    $sample = [pscustomobject]@{ status = 'failed'; commit = ('a' * 40); clusterContacted = $false }
    Write-JsonAtomically -Path $tempPath -Value $sample
    $roundTrip = Get-Content -LiteralPath $tempPath -Raw | ConvertFrom-Json
    Assert-Case 'release-record-atomic-json-roundtrip' ($roundTrip.status -eq 'failed' -and $roundTrip.commit -eq $sample.commit -and $roundTrip.clusterContacted -eq $false)
} finally {
    if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
}

$report = [ordered]@{
    status = 'passed'
    count = $results.Count
    clusterContacted = $false
    credentialsRead = $false
    dockerInvoked = $false
    kubectlInvoked = $false
    cases = $results
}
$json = $report | ConvertTo-Json -Depth 6
Write-Output $json
