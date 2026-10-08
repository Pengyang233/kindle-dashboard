#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

JOB_FILE="/etc/upstart/kindle-dashboard.conf"
if command -v mntroot >/dev/null 2>&1; then
  mntroot rw >> "$LOG_FILE" 2>&1 || exit 1
elif [ -x /usr/sbin/mntroot ]; then
  /usr/sbin/mntroot rw >> "$LOG_FILE" 2>&1 || exit 1
else
  log_message "autostart: mntroot not found"
  exit 1
fi

rm -f "$JOB_FILE"
"$INITCTL" reload-configuration >> "$LOG_FILE" 2>&1
if command -v mntroot >/dev/null 2>&1; then mntroot ro >> "$LOG_FILE" 2>&1; else /usr/sbin/mntroot ro >> "$LOG_FILE" 2>&1; fi
log_message "autostart: removed $JOB_FILE"
show_message "Kindle Dashboard: auto-start removed"
