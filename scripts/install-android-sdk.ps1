# Install Android SDK command-line tools and required packages for Union (API 34).
# Run once after Android Studio is installed. Idempotent.

$ErrorActionPreference = 'Stop'

$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$cmdlineRoot = Join-Path $sdkRoot 'cmdline-tools'
$latestDir = Join-Path $cmdlineRoot 'latest'
$sdkmanager = Join-Path $latestDir 'bin\sdkmanager.bat'

Write-Host "Android SDK root: $sdkRoot" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $sdkRoot | Out-Null

if (-not (Test-Path $sdkmanager)) {
    Write-Host 'Downloading Android command-line tools...' -ForegroundColor Cyan
    $zipUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
    $zipPath = Join-Path $env:TEMP 'commandlinetools-win.zip'
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

    $extractDir = Join-Path $env:TEMP 'android-cmdline-tools'
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    New-Item -ItemType Directory -Force -Path $latestDir | Out-Null
    $inner = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $latestDir -Recurse -Force
    Remove-Item -Recurse -Force $extractDir, $zipPath
    Write-Host 'Command-line tools installed.' -ForegroundColor Green
}

$packages = @(
    'platform-tools',
    'platforms;android-34',
    'build-tools;34.0.0'
)

function Write-SdkLicenses {
    param([string]$SdkRoot)
    $licDir = Join-Path $SdkRoot 'licenses'
    New-Item -ItemType Directory -Force -Path $licDir | Out-Null
    $entries = @{
        'android-sdk-license' = '24333f8a63b6825ea9c5514f83c2829b5433d0d636d'
        'android-sdk-preview-license' = '84831b9409646a918e305682786232fb4ac4574351c'
        'google-gdk-license' = '33b6a2b6460575a79715d9e4cdf9fe39f5b6200'
        'intel-android-extra-license' = 'd975f751698697e4d6a2658c6673e9c62e2cb54d'
    }
    foreach ($name in $entries.Keys) {
        [IO.File]::WriteAllText((Join-Path $licDir $name), "$($entries[$name])`n")
    }
}

function Accept-SdkLicenses {
    param([string]$SdkRoot, [string]$SdkManager)
    $yesFile = Join-Path $env:TEMP 'sdk-yes.txt'
    1..50 | ForEach-Object { 'y' } | Set-Content $yesFile
    cmd /c "`"$SdkManager`" --sdk_root=`"$SdkRoot`" --licenses < `"$yesFile`"" | Out-Null
    Remove-Item $yesFile -Force -ErrorAction SilentlyContinue
}

Write-SdkLicenses -SdkRoot $sdkRoot
Accept-SdkLicenses -SdkRoot $sdkRoot -SdkManager $sdkmanager

Write-Host 'Installing SDK packages (may take several minutes)...' -ForegroundColor Cyan
& $sdkmanager --sdk_root=$sdkRoot @packages 2>&1 | ForEach-Object { Write-Host $_ }

if (-not $env:ANDROID_HOME) {
    [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
    $env:ANDROID_HOME = $sdkRoot
    Write-Host "Set ANDROID_HOME=$sdkRoot (User)" -ForegroundColor Green
}

$platformPath = Join-Path $sdkRoot 'platforms\android-34'
if (-not (Test-Path $platformPath)) {
    Write-Error 'Platform 34 install failed. Re-run or use Android Studio SDK Manager.'
}

Write-Host 'Android SDK 34 ready.' -ForegroundColor Green
