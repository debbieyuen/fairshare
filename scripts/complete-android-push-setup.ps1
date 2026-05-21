# Validates Firebase + Supabase push wiring after manual credential steps.
# Usage:
#   .\scripts\complete-android-push-setup.ps1
#   .\scripts\complete-android-push-setup.ps1 -ServiceAccount path\to\firebase-adminsdk.json

param(
    [string]$ServiceAccount
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
$googleServices = Join-Path $repoRoot 'android\app\google-services.json'

Write-Host 'Union Android push setup verification' -ForegroundColor Cyan
Write-Host ''

# 1. google-services.json
if (Test-Path $googleServices) {
    Write-Host '[OK] android/app/google-services.json present' -ForegroundColor Green
    try {
        $gs = Get-Content $googleServices -Raw | ConvertFrom-Json
        $pkg = $gs.client[0].client_info.android_client_info.package_name
        if ($pkg -ne 'social.fairshare.union') {
            Write-Host "[WARN] Package name is $pkg (expected social.fairshare.union)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[WARN] Could not parse google-services.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host '[MISSING] android/app/google-services.json' -ForegroundColor Yellow
    Write-Host '  Firebase Console -> Add Android app -> package social.fairshare.union' -ForegroundColor Gray
    Write-Host '  Download JSON to android/app/google-services.json (see google-services.json.example)' -ForegroundColor Gray
}

# 2. Rebuild hint
Write-Host ''
Write-Host 'After adding google-services.json:' -ForegroundColor White
Write-Host '  npm run cap:sync:android' -ForegroundColor Gray
Write-Host '  cd android; .\gradlew.bat assembleDebug' -ForegroundColor Gray

# 3. FCM secrets via setup-fcm-secrets.js
Write-Host ''
if ($ServiceAccount -and (Test-Path $ServiceAccount)) {
    Write-Host 'Supabase CLI commands for FCM secrets:' -ForegroundColor White
    node (Join-Path $repoRoot 'scripts\setup-fcm-secrets.js') $ServiceAccount
} else {
    Write-Host 'FCM backend secrets (requires Firebase service account JSON):' -ForegroundColor White
    Write-Host '  node scripts/setup-fcm-secrets.js path\to\firebase-adminsdk.json' -ForegroundColor Gray
    Write-Host '  supabase login' -ForegroundColor Gray
    Write-Host '  supabase link --project-ref vdpqgmrfvlaieqpvpdcr' -ForegroundColor Gray
    Write-Host '  (run printed supabase secrets set commands)' -ForegroundColor Gray
    Write-Host '  supabase functions deploy send-push-apns' -ForegroundColor Gray
}

# 4. Vault secrets
Write-Host ''
Write-Host 'Verify Supabase Vault (SQL Editor): sql/check-push-vault-secrets.sql' -ForegroundColor White
Write-Host '  apns_edge_fn_url -> send-push-apns function URL' -ForegroundColor Gray
Write-Host '  supabase_anon_key -> project anon key' -ForegroundColor Gray

# 5. Device verification
Write-Host ''
Write-Host 'On device/emulator after sign-in:' -ForegroundColor White
Write-Host '  Logcat filter: push' -ForegroundColor Gray
Write-Host '  Supabase: device_push_tokens where platform = android' -ForegroundColor Gray
