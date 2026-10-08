#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

if ! require_network_config; then
  exit 2
fi

dashboard_pid="$(cat "$STATE_DIR/dashboard.pid" 2>/dev/null)"
was_running=0
if [ -n "$dashboard_pid" ] && kill -0 "$dashboard_pid" 2>/dev/null; then
  was_running=1
  sh "$EXTENSION_DIR/bin/stop-dashboard.sh"
fi

ensure_wifi
sh "$EXTENSION_DIR/bin/update-client.sh"
update_result=$?
case "$update_result" in
  20) message="client updated to $(cat "$EXTENSION_DIR/VERSION" 2>/dev/null)" ;;
  10) message="client already up to date" ;;
  *) message="client update failed ($update_result)" ;;
esac
log_message "update-and-restart: $message"

if [ "$was_running" -eq 1 ]; then
  sh "$EXTENSION_DIR/bin/start-dashboard.sh"
else
  show_message "Kindle Dashboard: $message"
fi
exit "$update_result"
