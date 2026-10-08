#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

FRAME_FILE="$ASSETS_DIR/frame.png"
COUNT_FILE="$STATE_DIR/display-count"
FBINK="$(find_fbink)" || {
  log_message "display: FBInk not found"
  exit 1
}

if ! valid_png "$FRAME_FILE"; then
  log_message "display: no valid frame at $FRAME_FILE"
  exit 2
fi

display_count="$(read_number_file "$COUNT_FILE")"
case "$display_count" in ''|*[!0-9]*) display_count=0 ;; esac

if [ "$display_count" -eq 0 ] || [ $((display_count % FULL_REFRESH_EVERY)) -eq 0 ]; then
  "$FBINK" -f -c >> "$LOG_FILE" 2>&1 || exit $?
  refresh_mode="full"
else
  refresh_mode="GC16"
fi

"$FBINK" -g file="$FRAME_FILE" -W GC16 >> "$LOG_FILE" 2>&1
display_result=$?
if [ "$display_result" -eq 0 ]; then
  display_count=$((display_count + 1))
  printf '%s\n' "$display_count" > "$COUNT_FILE.tmp" && mv -f "$COUNT_FILE.tmp" "$COUNT_FILE"
fi
log_message "display: result=$display_result mode=$refresh_mode count=$display_count"
exit "$display_result"
