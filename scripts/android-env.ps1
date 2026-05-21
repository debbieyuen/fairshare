# Load Android + Node paths into the current PowerShell session.
# Usage: . .\scripts\android-env.ps1

$nodeDir = 'C:\Program Files\nodejs'
if (Test-Path $nodeDir) {
    $env:Path = "$nodeDir;$env:Path"
}

$studioJbr = "$env:ProgramFiles\Android\Android Studio\jbr"
if (Test-Path $studioJbr) {
    $env:JAVA_HOME = $studioJbr
}

if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$platformTools = Join-Path $env:ANDROID_HOME 'platform-tools'
if (Test-Path $platformTools) {
    $env:Path = "$platformTools;$env:Path"
}

Write-Host "JAVA_HOME=$env:JAVA_HOME" -ForegroundColor Gray
Write-Host "ANDROID_HOME=$env:ANDROID_HOME" -ForegroundColor Gray
