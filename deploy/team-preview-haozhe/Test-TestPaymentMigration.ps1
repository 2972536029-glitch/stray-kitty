$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'TestPaymentMigration.Common.ps1')
$directory = Join-Path ([IO.Path]::GetTempPath()) ('kitty-test-payment-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $directory
$passed = 0
function Assert-Case([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "Test payment migration failed: $Name" }
    $script:passed++
}
function Assert-Rejected([scriptblock]$Action, [string]$Name) {
    $rejected = $false
    try { $null = & $Action } catch { $rejected = $true }
    Assert-Case $rejected $Name
}
try {
    $game = Join-Path $directory 'game.json'
    $payments = Join-Path $directory 'payments.json'
    $output = Join-Path $directory 'game.import.json'
    $gameText = @'
{"schemaVersion":1,"players":{"primary-a":{"id":"player-a","state":{"currencies":{"tuna":111},"exactInteger":9007199254740993,"timestamp":"2026-11-05T20:25:20.123456789+08:00","txns":[{"id":"visible-history","status":"confirmed"}]},"receipts":{"command":{"response":{"state":{"currencies":{"tuna":42}}}}},"qaRestore":{"currencies":{"tuna":77}},"sessionAliases":["alias-a"],"appliedPayments":{"already":true,"set-true":false,"keep-false":false}},"primary-b":{"id":"player-b","state":{"currencies":{"tuna":222}},"receipts":{}}},"accounts":{"fake-owner":{"username":"fake-owner","passwordHash":"fake-hash","createdAt":"2026-11-05T12:25:20.123456789Z"}}}
'@
    $paymentText = @'
{"players":{"player-a":[{"id":"set-true","playerId":"player-a","status":"confirmed","amount":1200},{"id":"already","playerId":"player-a","status":"confirmed","amount":3000},{"id":"declined","playerId":"player-a","status":"declined","amount":1200}],"player-b":[{"id":"new-confirmed","playerId":"player-b","status":"confirmed","amount":600}]}}
'@
    [IO.File]::WriteAllText($game, $gameText)
    [IO.File]::WriteAllText($payments, $paymentText)
    $gameHash = (Get-FileHash -LiteralPath $game -Algorithm SHA256).Hash.ToLowerInvariant()
    $paymentHash = (Get-FileHash -LiteralPath $payments -Algorithm SHA256).Hash.ToLowerInvariant()
    $summary = New-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $output
    Assert-Case ($summary.confirmedTransactions -eq 3 -and $summary.ledgerTransactions -eq 4 -and $summary.newlySuppressed -eq 2 -and $summary.alreadySuppressed -eq 1 -and $summary.changedPlayers -eq 2) 'confirmed-only-counts'
    Assert-Case ($summary.gameSourceSha256 -ceq $gameHash -and $summary.paymentsSourceSha256 -ceq $paymentHash) 'metadata-original-hashes'
    Assert-Case (((Get-FileHash -LiteralPath $game).Hash.ToLowerInvariant() -ceq $gameHash) -and ((Get-FileHash -LiteralPath $payments).Hash.ToLowerInvariant() -ceq $paymentHash)) 'original-bytes-unchanged'
    $verified = Test-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $output
    Assert-Case ($verified.gameImportSha256 -ceq $summary.gameImportSha256) 'strict-independent-verification'
    $node = [System.Text.Json.Nodes.JsonNode]::Parse([IO.File]::ReadAllText($output))
    Assert-Case ($node['players']['primary-a']['appliedPayments']['set-true'].GetValue[bool]() -and -not $node['players']['primary-a']['appliedPayments']['keep-false'].GetValue[bool]() -and $null -eq $node['players']['primary-a']['appliedPayments']['declined']) 'existing-flags-preserved-declined-excluded'
    Assert-Case ($node['players']['primary-a']['state']['exactInteger'].ToJsonString() -ceq '9007199254740993' -and $node['players']['primary-a']['state']['timestamp'].GetValue[string]() -ceq '2026-11-05T20:25:20.123456789+08:00') 'numeric-and-timestamp-precision'
    if ([OperatingSystem]::IsWindows()) {
        Assert-Case ([bool]((Get-Item -LiteralPath $output).Attributes -band [IO.FileAttributes]::ReadOnly)) 'output-read-only'
    } else {
        Assert-Case ([IO.File]::GetUnixFileMode($output) -eq [IO.UnixFileMode]::UserRead) 'output-owner-read-only'
    }
    Assert-Rejected { New-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $output } 'overwrite-rejected'
    Assert-Rejected { New-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $game } 'source-overwrite-rejected'
    $tampered = Join-Path $directory 'tampered.json'
    [IO.File]::WriteAllText($tampered, [IO.File]::ReadAllText($output).Replace('"tuna":111','"tuna":112'))
    Assert-Rejected { Test-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $tampered } 'balance-change-rejected'
    [IO.File]::WriteAllText($tampered, [IO.File]::ReadAllText($output).Replace('"keep-false":false','"keep-false":true'))
    Assert-Rejected { Test-LegacyTestPaymentImport -GamePath $game -PaymentsPath $payments -OutputPath $tampered } 'unrelated-flag-change-rejected'
    $invalidPayments = Join-Path $directory 'invalid-payments.json'
    foreach ($case in @(
        @{name='missing-player';json='{"players":{"absent":[]}}'},
        @{name='confirmed-missing-player';json='{"players":{"absent":[{"id":"orphan-confirmed","playerId":"absent","status":"confirmed"}]}}'},
        @{name='owner-mismatch';json='{"players":{"player-a":[{"id":"test","playerId":"player-b","status":"confirmed"}]}}'},
        @{name='conflicting-id';json='{"players":{"player-a":[{"id":"same","playerId":"player-a","status":"confirmed","amount":1},{"id":"same","playerId":"player-a","status":"confirmed","amount":2}]}}'},
        @{name='duplicate-property';json='{"players":{"player-a":[],"player-a":[]}}'}
    )) {
        [IO.File]::WriteAllText($invalidPayments, $case.json)
        Assert-Rejected { New-LegacyTestPaymentImport -GamePath $game -PaymentsPath $invalidPayments -OutputPath (Join-Path $directory 'invalid-output.json') } $case.name
        Assert-Case (-not (Test-Path -LiteralPath (Join-Path $directory 'invalid-output.json'))) ($case.name + '-no-output')
    }
    $orphanPayments = Join-Path $directory 'orphan-declined-payments.json'
    $orphanOutput = Join-Path $directory 'orphan-declined.import.json'
    [IO.File]::WriteAllText($orphanPayments, '{"players":{"absent":[{"id":"orphan-declined","playerId":"absent","status":"declined","amount":600}]}}')
    $orphanHash = (Get-FileHash -LiteralPath $orphanPayments).Hash.ToLowerInvariant()
    $orphanSummary = New-LegacyTestPaymentImport -GamePath $game -PaymentsPath $orphanPayments -OutputPath $orphanOutput
    Assert-Case ($orphanSummary.declinedOrphanRecords -eq 1 -and $orphanSummary.nonConfirmedOrphanRecords -eq 1 -and $orphanSummary.confirmedTransactions -eq 0 -and $orphanSummary.changedPlayers -eq 0 -and $orphanSummary.newlySuppressed -eq 0) 'declined-orphan-preserved-without-marker'
    $null = Test-LegacyTestPaymentImport -GamePath $game -PaymentsPath $orphanPayments -OutputPath $orphanOutput
    Assert-Case ((Get-FileHash -LiteralPath $orphanPayments).Hash.ToLowerInvariant() -ceq $orphanHash) 'declined-orphan-ledger-bytes-preserved'
    Assert-Case (-not (($summary | ConvertTo-Json -Compress) -match 'player-a|primary-a|fake-owner|fake-hash|set-true')) 'summary-excludes-record-identities'
    Write-Output "$passed test-payment migration checks passed; synthetic data only."
} finally {
    $resolved = [IO.Path]::GetFullPath($directory)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -like 'kitty-test-payment-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
