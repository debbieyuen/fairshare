#Requires -Version 5.1
<#
.SYNOPSIS
  Check Android push notification setup (Firebase file, Gradle flag, backend docs).

.EXAMPLE
  .\scripts\check-android-push.ps1
#>

$repoRoot = Split-Path -Parent $PSScriptRoot
$googleServices = Join-Path $repoRoot 'android\app\google-services.json'
$example = Join-Path $repoRoot 'android\app\google-services.json.example'

Write-Host 'Android push setup check' -ForegroundColor Cyan

if (Test-Path $googleServices) {
    Write-Host '  OK: android/app/google-services.json present' -ForegroundColor Green
    try {
        $json = Get-Content $googleServices -Raw | ConvertFrom-Json
        $pkg = $json.client[0].client_info.android_client_info.package_name
        if ($pkg -eq 'social.fairshare.union') {
            Write-Host "  OK: package_name is $pkg" -ForegroundColor Green
        } else {
            Write-Host "  WARN: package_name is '$pkg' (expected social.fairshare.union)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  WARN: could not parse google-services.json ($($_.Exception.Message))" -ForegroundColor Yellow
    }
} else {
    Write-Host '  MISSING: android/app/google-services.json' -ForegroundColor Yellow
    Write-Host "  See example at android/app/google-services.json.example and docs/android.md" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'After adding google-services.json:' -ForegroundColor White
Write-Host '  1. npm run cap:sync:android'
Write-Host '  2. Rebuild in Android Studio (Clean Project if needed)'
Write-Host '  3. Sign in, grant notification permission'
Write-Host '  4. Logcat filter: push'
Write-Host '  5. Supabase: device_push_tokens where platform = android'
Write-Host ''
Write-Host 'Backend FCM (Supabase Edge Function send-push-apns):' -ForegroundColor White
Write-Host '  node scripts/setup-fcm-secrets.js path\to\firebase-service-account.json'
Write-Host '  Ensure vault secret apns_edge_fn_url is set (see sql/check-push-vault-secrets.sql)'
Write-Host ''
Write-Host 'End-to-end test: trigger send_push_to_users or send a group chat from another account.'
