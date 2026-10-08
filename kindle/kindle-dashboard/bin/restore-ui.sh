#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

[ -f "$STATE_DIR/display-active" ] || exit 0
log_message "restore: restoring Kindle UI"
restore_result=0

restore_lipc_property() {
  interface_name="$1"
  property_name="$2"
  expected_value="$3"
  property_label="$4"
  attempt=1
  while [ "$attempt" -le "$RESTORE_RETRY_ATTEMPTS" ]; do
    if lipc-set-prop "$interface_name" "$property_name" "$expected_value" >> "$LOG_FILE" 2>&1; then
      actual_value="$(lipc-get-prop "$interface_name" "$property_name" 2>/dev/null)"
      if [ "$actual_value" = "$expected_value" ]; then
        log_message "restore: $property_label=$expected_value verified attempt=$attempt"
        return 0
      fi
      if [ -z "$actual_value" ]; then
        log_message "restore: $property_label=$expected_value applied; readback unavailable attempt=$attempt"
        return 0
      fi
      log_message "restore: $property_label verify mismatch expected=$expected_value actual=${actual_value:-empty} attempt=$attempt"
    else
      log_message "restore: $property_label set failed attempt=$attempt"
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -le "$RESTORE_RETRY_ATTEMPTS" ] && sleep "$RESTORE_RETRY_SECONDS"
  done
  return 1
}

if [ -s "$STATE_DIR/frozen-pids" ]; then
  for frozen_pid in $(cat "$STATE_DIR/frozen-pids"); do
    kill -CONT "$frozen_pid" 2>/dev/null
  done
fi

original_pillow="enable"
[ -s "$STATE_DIR/original-pillow" ] && original_pillow="$(cat "$STATE_DIR/original-pillow")"
case "$original_pillow" in enable|disable) ;; *) original_pillow="enable" ;; esac

original_prevent="0"
[ -s "$STATE_DIR/original-prevent" ] && original_prevent="$(cat "$STATE_DIR/original-prevent")"
case "$original_prevent" in 0|1) ;; *) original_prevent="0" ;; esac

if [ "$(cat "$STATE_DIR/gui-was-running" 2>/dev/null)" = "1" ]; then
  if ! "$INITCTL" status lab126_gui 2>/dev/null | grep -q 'start/running'; then
    log_message "restore: starting lab126_gui"
    "$INITCTL" start lab126_gui >> "$LOG_FILE" 2>&1 &
    waited=0
    while [ "$waited" -lt 30 ]; do
      if "$INITCTL" status lab126_gui 2>/dev/null | grep -q 'start/running'; then
        break
      fi
      sleep 1
      waited=$((waited + 1))
    done
    if ! "$INITCTL" status lab126_gui 2>/dev/null | grep -q 'start/running'; then
      restore_result=1
      log_message "restore: lab126_gui did not reach running state after ${waited}s"
    else
      log_message "restore: lab126_gui running after ${waited}s"
    fi
  fi
fi

if ! restore_lipc_property \
  com.lab126.pillow disableEnablePillow "$original_pillow" pillow; then
  restore_result=1
fi

if ! restore_lipc_property \
  com.lab126.powerd preventScreenSaver "$original_prevent" preventScreenSaver; then
  restore_result=1
fi

if [ "$restore_result" -eq 0 ]; then
  rm -f "$STATE_DIR/display-active" "$STATE_DIR/frozen-pids"
  log_message "restore: complete"
else
  log_message "restore: incomplete; recovery state preserved"
fi
exit "$restore_result"
