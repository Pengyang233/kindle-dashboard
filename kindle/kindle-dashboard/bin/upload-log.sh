#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"
if ! require_network_config; then
  exit 2
fi
notify_result=0
[ "${1:-}" = "--notify" ] && notify_result=1

[ -s "$LOG_FILE" ] || log_message "log: initialized"
UPLOAD_URL="${DASHBOARD_BASE_URL%/}/client/logs/$DEVICE_ID"

if ! command -v curl >/dev/null 2>&1; then
  log_message "log: upload requires curl"
  [ "$notify_result" -eq 1 ] && show_message "Kindle Dashboard: log upload unavailable"
  exit 2
fi

http_status="$(curl -f -sS --connect-timeout 10 --max-time 45 \
  -w "%{http_code}" \
  -H "X-Device-Token: $DEVICE_TOKEN" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data-binary "@$LOG_FILE" -o /dev/null "$UPLOAD_URL")"
result=$?
if [ "$result" -eq 0 ]; then
  case "$http_status" in
    2[0-9][0-9]) ;;
    *) result=22 ;;
  esac
fi
if [ "$result" -eq 0 ]; then
  log_message "log: upload complete"
  [ "$notify_result" -eq 1 ] && show_message "Kindle Dashboard: log uploaded"
else
  log_message "log: upload failed result=$result"
  [ "$notify_result" -eq 1 ] && show_message "Kindle Dashboard: log upload failed ($result)"
fi
exit "$result"
