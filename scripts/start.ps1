param([string]$DotNet = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $DotNet) {
    if ($env:DOTNET_ROOT -and (Test-Path -LiteralPath (Join-Path $env:DOTNET_ROOT 'dotnet.exe'))) {
        $DotNet = Join-Path $env:DOTNET_ROOT 'dotnet.exe'
    } elseif (Get-Command dotnet -ErrorAction SilentlyContinue) {
        $DotNet = 'dotnet'
    } else { throw 'Install the .NET 10 SDK, set DOTNET_ROOT or pass -DotNet with the SDK executable path.' }
}
Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath 'web/node_modules')) {
        npm --prefix web ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    }
    npm --prefix web run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    & $DotNet run --project src/Touchline.Api --no-launch-profile
    if ($LASTEXITCODE -ne 0) { throw 'Touchline stopped with an error.' }
} finally { Pop-Location }
