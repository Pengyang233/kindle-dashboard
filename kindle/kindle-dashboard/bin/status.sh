#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

version="$(cat "$EXTENSION_DIR/VERSION" 2>/dev/null)"
dashboard_pid="$(cat "$STATE_DIR/dashboard.pid" 2>/dev/null)"
if [ -n "$dashboard_pid" ] && kill -0 "$dashboard_pid" 2>/dev/null; then
  status_text="running pid=$dashboard_pid version=$version"
else
  status_text="stopped version=$version"
fi
printf '%s\n' "$status_text" > "$STATE_DIR/status.txt"
log_message "status: $status_text"
show_message "Kindle Dashboard: $status_text"
