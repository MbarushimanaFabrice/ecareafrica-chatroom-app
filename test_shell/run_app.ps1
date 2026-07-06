# Launches the Flutter app against the remote ECareAfrica backend.
# The API URL is hardcoded in main.dart (http://13.140.133.61:3000).
# Use --dart-define to override for local development:
#   flutter run --dart-define=API_URL=http://192.168.x.x:3000
#
# Usage:
#   ./run_app.ps1              # uses remote server
#   ./run_app.ps1 -d <device>  # target a specific device

param(
    [string]$d = ""
)

if ($d) {
    flutter run -d $d
} else {
    flutter run
}
