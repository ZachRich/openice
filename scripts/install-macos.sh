#!/bin/bash
#
# Install OpenIce as launchd jobs on macOS.
#
#   ./scripts/install-macos.sh                 # daily refresh at 06:00
#   ./scripts/install-macos.sh --hour 5        # daily refresh at 05:00
#   ./scripts/install-macos.sh --with-server   # also keep the site and feed running
#   ./scripts/install-macos.sh --uninstall
#
# launchd is used rather than cron for one reason that matters here: if the Mac is
# asleep at the scheduled time, launchd runs the job when it next wakes. cron would
# simply skip the day, and you would not find out until the schedule looked stale.

set -euo pipefail

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI="gui/$(id -u)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/openice"
REFRESH_LABEL="us.openice.refresh"
SERVER_LABEL="us.openice.server"
HOUR=6
MINUTE=0
WITH_SERVER=0
UNINSTALL=0
PORT="${PORT:-3030}"
HOME_ZIP="${HOME_ZIP:-01960}"

while [ $# -gt 0 ]; do
  case "$1" in
    --hour) HOUR="$2"; shift 2 ;;
    --minute) MINUTE="$2"; shift 2 ;;
    --with-server) WITH_SERVER=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

unload() {
  local label="$1"
  launchctl bootout "$GUI/$label" 2>/dev/null || true
  rm -f "$AGENTS/$label.plist"
}

if [ "$UNINSTALL" = "1" ]; then
  unload "$REFRESH_LABEL"
  unload "$SERVER_LABEL"
  echo "Removed OpenIce launch agents. Logs are left in $LOGS."
  exit 0
fi

# launchd starts jobs with a bare environment: no nvm, no Homebrew on PATH, no shell
# profile. The node binary has to be named absolutely or the job fails silently.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node was not found on PATH. Install Node 20+ and try again." >&2
  exit 1
fi
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"

mkdir -p "$AGENTS" "$LOGS"

write_plist() {
  local label="$1" schedule="$2" keepalive="$3" args="$4"
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT/server.mjs</string>$args
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOME_ZIP</key><string>$HOME_ZIP</string>
    <key>REFRESH_MINUTES</key><string>1440</string>
  </dict>
$schedule$keepalive  <key>StandardOutPath</key><string>$LOGS/$label.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$label.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
}

CALENDAR="  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MINUTE</integer>
  </dict>
"
KEEPALIVE="  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
"

unload "$REFRESH_LABEL"
write_plist "$REFRESH_LABEL" "$CALENDAR" "" "
    <string>--refresh</string>"
launchctl bootstrap "$GUI" "$AGENTS/$REFRESH_LABEL.plist"
printf 'Daily refresh installed: %02d:%02d every day.\n' "$HOUR" "$MINUTE"

if [ "$WITH_SERVER" = "1" ]; then
  unload "$SERVER_LABEL"
  write_plist "$SERVER_LABEL" "" "$KEEPALIVE" ""
  launchctl bootstrap "$GUI" "$AGENTS/$SERVER_LABEL.plist"
  echo "Server installed: http://127.0.0.1:$PORT, restarted automatically."
fi

echo
echo "Logs:        $LOGS"
echo "Run now:     launchctl kickstart -k $GUI/$REFRESH_LABEL"
echo "Check:       launchctl print $GUI/$REFRESH_LABEL | head -20"
echo "Remove:      $PROJECT/scripts/install-macos.sh --uninstall"
