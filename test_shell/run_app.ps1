# Auto-detects current WiFi IP and runs the Flutter app with it as API_URL.
# Usage: ./run_app.ps1
# Optional device flag: ./run_app.ps1 -d <device-id>

param(
    [string]$d = ""
)

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.InterfaceAlias -match "Wi-Fi|Wireless|WLAN" -and
                      $_.IPAddress -notmatch "^169\." } |
       Select-Object -First 1).IPAddress

if (-not $ip) {
    Write-Error "Could not detect a WiFi IP address. Make sure you are connected to WiFi."
    exit 1
}

$apiUrl = "http://${ip}:3000"
Write-Host "Detected IP: $apiUrl" -ForegroundColor Cyan

if ($d) {
    flutter run --dart-define="API_URL=$apiUrl" -d $d
} else {
    flutter run --dart-define="API_URL=$apiUrl"
}
