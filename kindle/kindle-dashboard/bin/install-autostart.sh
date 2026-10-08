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

{
  printf '%s\n' 'description "Kindle Dashboard"'
  printf '%s\n' 'start on started framework'
  printf '%s\n' 'task'
  printf '%s\n' 'script'
  printf '%s\n' '  sleep 20'
  printf '%s\n' "  /bin/sh $EXTENSION_DIR/bin/start-dashboard.sh"
  printf '%s\n' 'end script'
} > "$JOB_FILE"
chmod 644 "$JOB_FILE"
"$INITCTL" reload-configuration >> "$LOG_FILE" 2>&1

if command -v mntroot >/dev/null 2>&1; then mntroot ro >> "$LOG_FILE" 2>&1; else /usr/sbin/mntroot ro >> "$LOG_FILE" 2>&1; fi
log_message "autostart: installed $JOB_FILE"
show_message "Kindle Dashboard: auto-start installed"
