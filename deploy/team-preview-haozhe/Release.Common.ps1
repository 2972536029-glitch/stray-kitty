Set-StrictMode -Version Latest

function Wait-PublicHealth {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][uri]$Uri,
        [ValidateRange(1, 24)][int]$Attempts = 12,
        [ValidateRange(0, 10)][int]$DelaySeconds = 5
    )
    $lastError = 'No response received.'
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
            $body = $body.Trim()
            if ($response.StatusCode -ne 200) { throw "Unexpected HTTP status: $($response.StatusCode)" }
            if ($body -ne 'ok') {
                $json = $body | ConvertFrom-Json -ErrorAction Stop
                if (-not $json.PSObject.Properties['status'] -or $json.status -ne 'ok') { throw 'Health response did not report ok.' }
            }
            return [pscustomobject]@{ Uri = $Uri.AbsoluteUri; Content = $body; Attempts = $attempt }
        } catch {
            $lastError = $_.Exception.Message
            if ($attempt -lt $Attempts) {
                Write-Host "Public health not ready ($attempt/$Attempts): $lastError; retrying in $DelaySeconds seconds."
                if ($DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
            }
        }
    }
    throw "Public health verification failed after $Attempts attempts for ${Uri}: $lastError"
}

function Invoke-NativeChecked {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)][string]$Step,
        [AllowNull()][string]$StandardInput,
        [switch]$Quiet,
        [int]$TailLines = 0
    )

    $command = Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $executable = if ($command.Source) { $command.Source } else { $command.Path }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $executable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add([string]$argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "$Step could not start: $FilePath"
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if ($null -ne $StandardInput) {
        $process.StandardInput.Write($StandardInput)
    }
    $process.StandardInput.Close()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
    $process.Dispose()

    if (-not $Quiet) {
        $display = @()
        if ($stdout) { $display += ($stdout -split "`r?`n") }
        if ($stderr) { $display += ($stderr -split "`r?`n") }
        $display = @($display | Where-Object { $_ -ne '' })
        if ($TailLines -gt 0 -and $display.Count -gt $TailLines) {
            $display = @($display | Select-Object -Last $TailLines)
        }
        foreach ($line in $display) { Write-Host $line }
    }

    if ($exitCode -ne 0) {
        throw "$Step failed (exit code $exitCode)."
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        StdOut = $stdout
        StdErr = $stderr
    }
}

function Write-JsonAtomically {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object]$Value
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        $null = New-Item -ItemType Directory -Path $directory -Force
    }
    $temporaryPath = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    $json = $Value | ConvertTo-Json -Depth 12
    try {
        [IO.File]::WriteAllText($temporaryPath, $json, [Text.UTF8Encoding]::new($false))
        $null = Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}
