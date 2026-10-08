#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

if ! require_network_config; then
  exit 2
fi

dashboard_pid="$(cat "$STATE_DIR/dashboard.pid" 2>/dev/null)"
if [ -n "$dashboard_pid" ] && kill -0 "$dashboard_pid" 2>/dev/null; then
  log_message "start: already running pid=$dashboard_pid"
  exit 0
fi

sh "$EXTENSION_DIR/bin/restore-ui.sh"
rm -f "$STATE_DIR/stop-requested" "$STATE_DIR/dashboard.pid"
rmdir "$STATE_DIR/daemon.lock" 2>/dev/null

if [ "$AUTO_UPDATE_ON_START" = "1" ]; then
  ensure_wifi
  update_attempt=1
  update_result=2
  while [ "$update_attempt" -le 3 ]; do
    sh "$EXTENSION_DIR/bin/update-client.sh"
    update_result=$?
    case "$update_result" in 10|20) break ;; esac
    log_message "start: update attempt=$update_attempt failed result=$update_result"
    update_attempt=$((update_attempt + 1))
    [ "$update_attempt" -le 3 ] && sleep 5
  done
  case "$update_result" in 10|20) ;; *) log_message "start: update check failed result=$update_result; continuing current client" ;; esac
fi

if command -v setsid >/dev/null 2>&1; then
  setsid sh "$EXTENSION_DIR/bin/dashboard-daemon.sh" >> "$LOG_FILE" 2>&1 &
else
  sh "$EXTENSION_DIR/bin/dashboard-daemon.sh" >> "$LOG_FILE" 2>&1 &
fi
launcher_pid=$!
log_message "start: launched pid=$launcher_pid"
exit 0
