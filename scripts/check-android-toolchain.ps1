#Requires -Version 5.1
<#
.SYNOPSIS
  Verify Android development toolchain on Windows 11.

.EXAMPLE
  .\scripts\check-android-toolchain.ps1
#>

$ErrorActionPreference = 'Continue'
$ok = $true

function Test-Tool {
    param(
        [string]$Name,
        [scriptblock]$Check,
        [string]$FixHint
    )
    Write-Host "`n[$Name]" -ForegroundColor Cyan
    try {
        $result = & $Check
        if ($result) {
            Write-Host "  OK: $result" -ForegroundColor Green
            return $true
        }
        Write-Host "  MISSING" -ForegroundColor Red
        if ($FixHint) { Write-Host "  Fix: $FixHint" -ForegroundColor Yellow }
        return $false
    } catch {
        Write-Host "  MISSING ($($_.Exception.Message))" -ForegroundColor Red
        if ($FixHint) { Write-Host "  Fix: $FixHint" -ForegroundColor Yellow }
        return $false
    }
}

Write-Host 'Union Android toolchain check (Windows 11)' -ForegroundColor White
Write-Host 'Tip: if npm or adb are missing, run: . .\scripts\android-env.ps1' -ForegroundColor DarkGray

$ok = (Test-Tool 'Node.js 18+' {
    $v = (& node --version 2>$null) -replace '^v', ''
    if (-not $v) { return $null }
    $major = [int]($v.Split('.')[0])
    if ($major -lt 18) { throw "found v$v" }
    "v$v"
} 'winget install OpenJS.NodeJS.LTS') -and $ok

$ok = (Test-Tool 'npm' {
    npm --version 2>$null
} 'Reinstall Node.js LTS') -and $ok

$ok = (Test-Tool 'Java (for Gradle CLI)' {
    $java = Get-Command java -ErrorAction SilentlyContinue
    if ($java) { return (& java -version 2>&1 | Select-Object -First 1) }
    $studioJbr = "${env:ProgramFiles}\Android\Android Studio\jbr\bin\java.exe"
    if (Test-Path $studioJbr) { return "Android Studio JBR at $studioJbr" }
    $null
} 'Install Android Studio (bundled JDK) or set JAVA_HOME to Studio jbr') -and $ok

$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) {
    $sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
}

$ok = (Test-Tool 'Android SDK' {
    if (-not $sdkRoot -or -not (Test-Path $sdkRoot)) { return $null }
    " $sdkRoot"
} 'Install Android Studio, then SDK Manager: Platform 34, Build-Tools, Platform-Tools') -and $ok

if ($sdkRoot -and (Test-Path $sdkRoot)) {
    $platform34 = Join-Path $sdkRoot 'platforms\android-34'
    $ok = (Test-Tool 'Android SDK Platform 34' {
        if (Test-Path $platform34) { return $platform34 }
        $null
    } 'SDK Manager -> Android 14.0 (API 34)') -and $ok

    $adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
    $ok = (Test-Tool 'adb' {
        if (Test-Path $adb) { return $adb }
        $null
    } 'SDK Manager -> Android SDK Platform-Tools') -and $ok
}

$ok = (Test-Tool 'Android Studio' {
    $paths = @(
        "${env:ProgramFiles}\Android\Android Studio",
        "${env:ProgramFiles(x86)}\Android\Android Studio",
        "${env:LOCALAPPDATA}\Programs\Android Studio"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    $null
} 'Download from https://developer.android.com/studio') -and $ok

$repoRoot = Split-Path -Parent $PSScriptRoot
$googleServices = Join-Path $repoRoot 'android\app\google-services.json'
Test-Tool 'google-services.json (FCM)' {
    if (Test-Path $googleServices) { return $googleServices }
    'not present (push registration disabled until added)'
} 'Firebase Console -> add Android app social.fairshare.union -> download JSON' | Out-Null

Write-Host ''
if ($ok) {
    Write-Host 'Core toolchain looks ready. Next:' -ForegroundColor Green
    Write-Host '  npm install'
    Write-Host '  npm run cap:sync:android'
    Write-Host '  npx cap open android'
} else {
    Write-Host 'Some required tools are missing. See hints above and docs/android.md' -ForegroundColor Yellow
}

exit $(if ($ok) { 0 } else { 1 })
