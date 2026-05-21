# Google Play release checklist for Union (social.fairshare.union).
# Run when you are ready to ship; not required for local FCM testing.

Write-Host 'Google Play release checklist' -ForegroundColor Cyan
Write-Host ''
Write-Host '1. Google Play Console developer account ($25 one-time)' -ForegroundColor White
Write-Host '2. Upload keystore (keep out of git) - Android Studio: Build -> Generate Signed Bundle' -ForegroundColor White
Write-Host '3. npm run cap:sync:android before every release build' -ForegroundColor White
Write-Host '4. Build signed Android App Bundle (.aab) with upload key' -ForegroundColor White
Write-Host '5. Upload to Internal testing track first (validates production FCM)' -ForegroundColor White
Write-Host '6. Declare permissions in Play Console (see docs/android.md):' -ForegroundColor White
Write-Host '   INTERNET, CAMERA, ACCESS_*_LOCATION, POST_NOTIFICATIONS' -ForegroundColor Gray
Write-Host '7. Complete Data safety and content rating questionnaires' -ForegroundColor White
Write-Host ''
Write-Host 'Full details: docs/android.md (Release Build section)' -ForegroundColor Green
