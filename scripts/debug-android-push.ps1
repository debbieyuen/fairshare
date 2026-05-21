# Quick Android push diagnostics (emulator or USB device).
# Usage: .\scripts\debug-android-push.ps1
#        .\scripts\debug-android-push.ps1 -Serial emulator-5554

param(
    [string]$Serial = ''
)

. (Join-Path $PSScriptRoot 'android-env.ps1')

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    Write-Error 'adb not found. Run scripts/install-android-sdk.ps1 or Android Studio SDK Manager.'
}

$adbArgs = @()
if ($Serial) { $adbArgs += '-s', $Serial }

Write-Host '=== adb devices ===' -ForegroundColor Cyan
& $adb @adbArgs devices

$pkg = 'social.fairshare.union'
Write-Host "`n=== Notification permission (Android 13+) ===" -ForegroundColor Cyan
& $adb @adbArgs shell dumpsys package $pkg 2>$null | Select-String 'POST_NOTIFICATIONS|runtime permissions' -Context 0,3

Write-Host "`n=== Recent push-related log lines ===" -ForegroundColor Cyan
Write-Host 'Filter: Capacitor/Console and PushNotificationsPlugin' -ForegroundColor DarkGray
& $adb @adbArgs logcat -d -t 200 2>$null |
    Select-String '\[push\]|PushNotifications|FCM|registration' |
    Select-Object -Last 25

Write-Host "`n=== Checks ===" -ForegroundColor Cyan
Write-Host '1. Permission prompt once per install is NORMAL (not every run).' -ForegroundColor White
Write-Host '2. Confirm token in Supabase: device_push_tokens (platform=android).' -ForegroundColor White
Write-Host '3. Test delivery with app in BACKGROUND (Home button), not foreground.' -ForegroundColor White
Write-Host '4. Emulator must use a Google Play / Google APIs system image.' -ForegroundColor White
Write-Host '5. Edge function logs: Dashboard -> send-push-apns -> Logs' -ForegroundColor White
