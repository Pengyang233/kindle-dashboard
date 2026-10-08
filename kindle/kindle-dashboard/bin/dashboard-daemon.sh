#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

if ! require_network_config; then
  exit 2
fi

LOCK_DIR="$STATE_DIR/daemon.lock"
PID_FILE="$STATE_DIR/dashboard.pid"
requested_action="run"
restore_result=0

cleanup() {
  sh "$EXTENSION_DIR/bin/restore-ui.sh"
  restore_result=$?
  rm -f "$PID_FILE" "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null
  log_message "daemon: exited action=$requested_action restore_result=$restore_result"
  return "$restore_result"
}

request_stop() {
  requested_action="stop"
}

trap request_stop INT TERM HUP
trap cleanup EXIT

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  existing_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null)"
  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    log_message "daemon: already running pid=$existing_pid"
    exit 0
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || exit 1
  mkdir "$LOCK_DIR" 2>/dev/null || exit 1
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"
printf '%s\n' "$$" > "$PID_FILE"
rm -f "$STATE_DIR/stop-requested"

prepare_display() {
  if [ -f "$STATE_DIR/display-active" ]; then
    sh "$EXTENSION_DIR/bin/restore-ui.sh"
  fi

  original_prevent="$(lipc-get-prop com.lab126.powerd preventScreenSaver 2>/dev/null)"
  case "$original_prevent" in 0|1) ;; *) original_prevent="0" ;; esac
  printf '%s\n' "$original_prevent" > "$STATE_DIR/original-prevent"

  original_pillow="$(lipc-get-prop com.lab126.pillow disableEnablePillow 2>/dev/null)"
  case "$original_pillow" in enable|disable) ;; *) original_pillow="enable" ;; esac
  printf '%s\n' "$original_pillow" > "$STATE_DIR/original-pillow"

  gui_was_running=0
  if "$INITCTL" status lab126_gui 2>/dev/null | grep -q 'start/running'; then
    gui_was_running=1
  fi
  printf '%s\n' "$gui_was_running" > "$STATE_DIR/gui-was-running"
  : > "$STATE_DIR/frozen-pids"
  touch "$STATE_DIR/display-active"

  lipc-set-prop com.lab126.powerd preventScreenSaver 1 >> "$LOG_FILE" 2>&1
  lipc-set-prop com.lab126.pillow disableEnablePillow disable >> "$LOG_FILE" 2>&1
  if [ "$gui_was_running" -eq 1 ]; then
    "$INITCTL" stop lab126_gui >> "$LOG_FILE" 2>&1
    log_message "daemon: lab126_gui stopped"
  fi

  for process_name in mesquite KPPMainApp; do
    process_pids="$(pidof "$process_name" 2>/dev/null)"
    for process_pid in $process_pids; do
      kill -STOP "$process_pid" 2>/dev/null
      if kill -0 "$process_pid" 2>/dev/null; then
        printf '%s\n' "$process_pid" >> "$STATE_DIR/frozen-pids"
        log_message "daemon: froze $process_name pid=$process_pid"
      fi
    done
  done
  sleep "$DISPLAY_SETTLE_SECONDS"
}

battery_requires_exit() {
  battery_level="$(lipc-get-prop com.lab126.powerd battLevel 2>/dev/null)"
  case "$battery_level" in ''|*[!0-9]*) return 1 ;; esac
  [ "$battery_level" -lt "$LOW_BATTERY_PERCENT" ] || return 1

  charging="$(lipc-get-prop com.lab126.powerd isCharging 2>/dev/null)"
  case "$charging" in 1|true|yes) return 1 ;; esac
  log_message "power: battery=$battery_level charging=${charging:-unknown}; restoring UI"
  return 0
}

poll_remote_command() {
  command_file="$STATE_DIR/remote-command"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'run\n'
    return 1
  fi
  curl -f -sS --connect-timeout 5 --max-time 10 \
    -H "X-Device-Token: $DEVICE_TOKEN" \
    -o "$command_file.tmp" \
    "${DASHBOARD_BASE_URL%/}/client/command/$DEVICE_ID" 2>/dev/null || {
      rm -f "$command_file.tmp"
      printf 'run\n'
      return 1
    }
  mv -f "$command_file.tmp" "$command_file"
  remote_command="$(sed -n '1p' "$command_file")"
  case "$remote_command" in run|stop|refresh|upload|update) printf '%s\n' "$remote_command" ;;
    *) printf 'run\n' ;;
  esac
}

ack_remote_command() {
  acknowledged="$1"
  command -v curl >/dev/null 2>&1 || return 0
  curl -f -sS --connect-timeout 5 --max-time 10 \
    -H "X-Device-Token: $DEVICE_TOKEN" \
    --data "command=$acknowledged" \
    -o /dev/null "${DASHBOARD_BASE_URL%/}/client/command/$DEVICE_ID/ack" 2>/dev/null
}

refresh_frame() {
  sh "$EXTENSION_DIR/bin/fetch-frame.sh"
  fetch_result=$?
  case "$fetch_result" in
    0) sh "$EXTENSION_DIR/bin/display-frame.sh" ;;
    10) log_message "daemon: frame unchanged, display skipped" ;;
    *) log_message "daemon: fetch failed result=$fetch_result; keeping last frame" ;;
  esac
}

log_message "daemon: starting version=$(cat "$EXTENSION_DIR/VERSION" 2>/dev/null)"
ensure_wifi
sh "$EXTENSION_DIR/bin/fetch-frame.sh"
initial_fetch=$?
if [ "$initial_fetch" -ne 0 ] && [ "$initial_fetch" -ne 10 ] && ! valid_png "$ASSETS_DIR/frame.png"; then
  log_message "daemon: no network frame and no valid fallback; leaving Kindle UI active"
  exit 3
fi

prepare_display
sh "$EXTENSION_DIR/bin/display-frame.sh" || exit $?
last_refresh="$(date +%s)"
last_server_contact="$last_refresh"

while [ "$requested_action" = "run" ]; do
  if [ -f "$STATE_DIR/stop-requested" ] || battery_requires_exit; then
    requested_action="stop"
    break
  fi

  remote_command="$(poll_remote_command)"
  command_result=$?
  now_epoch="$(date +%s)"
  if [ "$command_result" -eq 0 ]; then
    last_server_contact="$now_epoch"
  elif [ $((now_epoch - last_server_contact)) -ge "$SERVER_OFFLINE_EXIT_SECONDS" ]; then
    log_message "daemon: server offline for ${SERVER_OFFLINE_EXIT_SECONDS}s; restoring UI"
    requested_action="stop"
    continue
  fi
  case "$remote_command" in
    stop)
      requested_action="stop"
      continue
      ;;
    refresh)
      touch "$STATE_DIR/refresh-requested"
      ack_remote_command refresh
      ;;
    upload)
      sh "$EXTENSION_DIR/bin/upload-log.sh"
      ack_remote_command upload
      ;;
    update)
      ack_remote_command update
      requested_action="update"
      continue
      ;;
  esac

  now_epoch="$(date +%s)"
  if [ -f "$STATE_DIR/refresh-requested" ] || [ $((now_epoch - last_refresh)) -ge "$REFRESH_SECONDS" ]; then
    rm -f "$STATE_DIR/refresh-requested"
    refresh_frame
    last_refresh="$(date +%s)"
  fi
  sleep "$COMMAND_POLL_SECONDS"
done

trap - EXIT
cleanup
restore_result=$?
if [ "$requested_action" = "stop" ] && [ "$restore_result" -eq 0 ]; then
  ack_remote_command stop
fi
if [ "$requested_action" = "update" ]; then
  if [ "$restore_result" -eq 0 ]; then
    ack_remote_command update
    ensure_wifi
    sh "$EXTENSION_DIR/bin/update-client.sh"
    sh "$EXTENSION_DIR/bin/start-dashboard.sh"
  fi
fi
exit "$restore_result"
