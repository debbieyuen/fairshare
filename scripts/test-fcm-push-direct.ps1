# POST directly to send-push-apns (bypasses SQL/pg_net). Use to test FCM on a physical device.
#
# Usage:
#   .\scripts\test-fcm-push-direct.ps1 -Token "FULL_FCM_TOKEN_FROM_LOGCAT"
#
# Get anon key from js/config.js or Supabase Dashboard -> Settings -> API.

param(
    [Parameter(Mandatory = $true)]
    [string]$Token
)

$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkcHFnbXJmdmxhaWVxcHZwZGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUzNjcsImV4cCI6MjA4NzIwMTM2N30.ORvkYqcrDjnhdpCvXaIBzjRLyzi3WSIqMmIxWecpgl8'
$url = 'https://vdpqgmrfvlaieqpvpdcr.supabase.co/functions/v1/send-push-apns'

$body = @{
    tokens = @(@{ token = $Token; platform = 'android' })
    title  = 'Union direct FCM test'
    body   = 'If you see this on the phone, FCM secrets and token are OK'
    url    = '/'
} | ConvertTo-Json -Depth 5

Write-Host "POST $url" -ForegroundColor Cyan
$response = Invoke-RestMethod -Method Post -Uri $url -Headers @{
    Authorization = "Bearer $anonKey"
    'Content-Type' = 'application/json'
} -Body $body

$response | ConvertTo-Json -Depth 5
Write-Host ''
Write-Host 'Expect: sent=1, fcm.total=1, failed=[]' -ForegroundColor Green
Write-Host 'Background the app on the phone before testing.' -ForegroundColor Yellow
