#!/bin/bash
#
# Install OpenIce as launchd jobs on macOS.
#
#   ./scripts/install-macos.sh                 # daily refresh at 06:00
#   ./scripts/install-macos.sh --hour 5        # daily refresh at 05:00
#   ./scripts/install-macos.sh --with-server   # also keep the site and feed running
#   ./scripts/install-macos.sh --uninstall
#
#   # write the calendar into iCloud Drive, filtered to evening stick & puck
#   ./scripts/install-macos.sh \
#     --feed-path ~/Library/Mobile\ Documents/com~apple~CloudDocs/openice.ics \
#     --feed-query 'zip=01960&radius=25&type=stick-puck&after=18'
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
FEED_PATH="${FEED_PATH:-}"
FEED_QUERY="${FEED_QUERY:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --hour) HOUR="$2"; shift 2 ;;
    --minute) MINUTE="$2"; shift 2 ;;
    --with-server) WITH_SERVER=1; shift ;;
    --feed-path) FEED_PATH="$2"; shift 2 ;;
    --feed-query) FEED_QUERY="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# Values land inside XML. A query string like "type=stick-puck&after=18" carries an
# ampersand, which makes the plist malformed and launchd refuses it at load time.
xml_escape() { printf '%s' "${1-}" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'; }

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
  local feed_env=""
  [ -n "$FEED_PATH" ] && feed_env="$feed_env
    <key>FEED_PATH</key><string>$(xml_escape "$FEED_PATH")</string>"
  [ -n "$FEED_QUERY" ] && feed_env="$feed_env
    <key>FEED_QUERY</key><string>$(xml_escape "$FEED_QUERY")</string>"
  local x_node x_project x_zip
  x_node="$(xml_escape "$NODE_BIN")"; x_project="$(xml_escape "$PROJECT")"; x_zip="$(xml_escape "$HOME_ZIP")"
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$x_node</string>
    <string>$x_project/server.mjs</string>$args
  </array>
  <key>WorkingDirectory</key><string>$x_project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOME_ZIP</key><string>$x_zip</string>
    <key>REFRESH_MINUTES</key><string>1440</string>$feed_env
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
if [ -n "$FEED_PATH" ]; then
  echo "Calendar written to: $FEED_PATH"
else
  echo "Calendar written to: $PROJECT/data/openice.ics"
fi

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
