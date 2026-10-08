#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

touch "$STATE_DIR/stop-requested"
dashboard_pid="$(cat "$STATE_DIR/dashboard.pid" 2>/dev/null)"
case "$dashboard_pid" in ''|*[!0-9]*) dashboard_pid="" ;; esac

if [ -n "$dashboard_pid" ] && kill -0 "$dashboard_pid" 2>/dev/null; then
  log_message "stop: requesting daemon pid=$dashboard_pid"
  kill -TERM "$dashboard_pid" 2>/dev/null
  waited=0
  while kill -0 "$dashboard_pid" 2>/dev/null && [ "$waited" -lt 30 ]; do
    sleep 1
    waited=$((waited + 1))
  done
fi

sh "$EXTENSION_DIR/bin/restore-ui.sh"
rm -f "$STATE_DIR/dashboard.pid" "$STATE_DIR/daemon.lock/pid"
rmdir "$STATE_DIR/daemon.lock" 2>/dev/null
log_message "stop: complete"
