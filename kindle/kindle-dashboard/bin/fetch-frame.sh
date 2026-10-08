#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

if ! require_network_config; then
  exit 2
fi

FRAME_FILE="$ASSETS_DIR/frame.png"
TEMP_FILE="$ASSETS_DIR/frame.download.png"
HEADER_FILE="$STATE_DIR/frame.headers"
ETAG_FILE="$STATE_DIR/frame.etag"
FRAME_URL="${DASHBOARD_BASE_URL%/}/frame.png"

rm -f "$TEMP_FILE" "$HEADER_FILE"
log_message "frame: fetching $FRAME_URL"

if command -v curl >/dev/null 2>&1; then
  etag_header=""
  [ -s "$ETAG_FILE" ] && etag_header="$(cat "$ETAG_FILE")"
  if [ -n "$etag_header" ]; then
    curl -f -sS --connect-timeout 10 --max-time 45 \
      -H "X-Device-Token: $DEVICE_TOKEN" \
      -H "If-None-Match: $etag_header" -D "$HEADER_FILE" \
      -o "$TEMP_FILE" "$FRAME_URL" >> "$LOG_FILE" 2>&1
  else
    curl -f -sS --connect-timeout 10 --max-time 45 \
      -H "X-Device-Token: $DEVICE_TOKEN" \
      -D "$HEADER_FILE" -o "$TEMP_FILE" "$FRAME_URL" >> "$LOG_FILE" 2>&1
  fi
  fetch_result=$?
  http_status="$(awk '/^HTTP\// { code=$2 } END { print code }' "$HEADER_FILE" 2>/dev/null)"
  if [ "$fetch_result" -eq 0 ] && [ "$http_status" = "304" ]; then
    rm -f "$TEMP_FILE" "$HEADER_FILE"
    log_message "frame: unchanged (HTTP 304)"
    exit 10
  fi
elif command -v wget >/dev/null 2>&1; then
  wget -q --max-redirect=0 --header="X-Device-Token: $DEVICE_TOKEN" \
    -T 45 -O "$TEMP_FILE" "$FRAME_URL" >> "$LOG_FILE" 2>&1
  fetch_result=$?
  http_status="200"
else
  log_message "frame: neither curl nor wget is available"
  exit 2
fi

if [ "$fetch_result" -ne 0 ] || ! valid_png "$TEMP_FILE"; then
  log_message "frame: download or PNG validation failed result=$fetch_result status=$http_status"
  rm -f "$TEMP_FILE" "$HEADER_FILE"
  exit 3
fi

if [ -f "$FRAME_FILE" ] && cmp -s "$TEMP_FILE" "$FRAME_FILE"; then
  rm -f "$TEMP_FILE"
  result=10
  log_message "frame: unchanged (content match)"
else
  mv -f "$TEMP_FILE" "$FRAME_FILE"
  result=0
  log_message "frame: updated bytes=$(wc -c < "$FRAME_FILE" | tr -d ' ')"
fi

if [ -s "$HEADER_FILE" ]; then
  response_etag="$(awk 'BEGIN { IGNORECASE=1 } /^ETag:/ { sub(/^[^:]*:[[:space:]]*/, ""); sub(/\r$/, ""); value=$0 } END { print value }' "$HEADER_FILE")"
  if [ -n "$response_etag" ]; then
    printf '%s\n' "$response_etag" > "$ETAG_FILE.tmp" && mv -f "$ETAG_FILE.tmp" "$ETAG_FILE"
  fi
fi
rm -f "$HEADER_FILE"
exit "$result"
