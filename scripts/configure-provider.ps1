param(
    [ValidateSet('FootballData', 'RedditAccessToken')][string]$Provider = 'FootballData',
    [string]$DotNet = '',
    [switch]$ApprovedRedditAccess
)
$ErrorActionPreference = 'Stop'
if ($Provider -eq 'RedditAccessToken' -and -not $ApprovedRedditAccess) {
    throw 'This option is for an existing approved Reddit API app. A Reddit login or a new Developer Platform registration does not establish Data API access.'
}
if (-not $DotNet) {
    if ($env:DOTNET_ROOT -and (Test-Path -LiteralPath (Join-Path $env:DOTNET_ROOT 'dotnet.exe'))) { $DotNet = Join-Path $env:DOTNET_ROOT 'dotnet.exe' }
    elseif (Get-Command dotnet -ErrorAction SilentlyContinue) { $DotNet = 'dotnet' }
    else { throw 'Set DOTNET_ROOT or pass -DotNet with the .NET SDK executable path.' }
}
$projectPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'src/Touchline.Api'
$label = if ($Provider -eq 'FootballData') { 'football-data.org API key' } else { 'approved Reddit OAuth access token' }
$secret = Read-Host "Paste your $label (input is hidden)" -MaskInput
if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -gt 4096 -or $secret -match '\s') { throw 'The credential must be non-empty and contain no whitespace.' }
$settings = @{}
if ($Provider -eq 'FootballData') { $settings['FootballData:Token'] = $secret }
else {
    $settings['Reddit:AccessToken'] = $secret
    $settings['Reddit:Enabled'] = 'true'
    $accountName = Read-Host 'Your Reddit username for the API user agent (without /u/)'
    if ($accountName -notmatch '^[A-Za-z0-9_-]{3,30}$') { throw 'Enter a valid Reddit username.' }
    $settings['Reddit:UserAgent'] = "Touchline/0.1 by /u/$accountName"
}
# Pass JSON through stdin. Credential values never become process arguments,
# source files, logs, terminal output or shell-history entries.
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $DotNet
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
foreach ($argument in @('user-secrets', 'set', '--project', $projectPath)) { $startInfo.ArgumentList.Add($argument) }
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
try {
    if (-not $process.Start()) { throw 'Could not start the .NET secrets tool.' }
    $process.StandardInput.WriteLine(($settings | ConvertTo-Json -Compress))
    $process.StandardInput.Close()
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $null = $outputTask.GetAwaiter().GetResult()
    $null = $errorTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'The .NET secrets tool failed. Verify the SDK and project path; no credential output was printed.' }
    Write-Host 'Credential saved to local .NET user secrets. Restart Touchline, then check Sources.'
} finally {
    $secret = $null
    $settings.Clear()
    $process.Dispose()
}
