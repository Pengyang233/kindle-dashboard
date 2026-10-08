#!/bin/sh

EXTENSION_DIR="/mnt/us/extensions/kindle-dashboard"
FRAME_FILE="$EXTENSION_DIR/assets/frame.png"
LOG_FILE="$EXTENSION_DIR/dashboard.log"

find_fbink() {
  detected_fbink="$(command -v fbink 2>/dev/null)"
  if [ -n "$detected_fbink" ] && [ -x "$detected_fbink" ]; then
    printf '%s\n' "$detected_fbink"
    return 0
  fi

  for candidate in \
    /usr/bin/fbink \
    /usr/local/bin/fbink \
    /mnt/us/extensions/FBInk/bin/fbink \
    /mnt/us/extensions/FBInk/fbink \
    /mnt/us/extensions/fbink/bin/fbink \
    /mnt/us/extensions/fbink/fbink \
    /mnt/us/extensions/MRInstaller/bin/fbink \
    /mnt/us/extensions/KUAL/bin/fbink \
    /mnt/us/libkh/bin/fbink \
    /mnt/us/koreader/fbink \
    /mnt/us/fbink
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  for search_root in \
    /mnt/us/extensions \
    /mnt/us/libkh \
    /mnt/us/koreader \
    /mnt/us/tools \
    /opt/bin \
    /usr/bin \
    /usr/local/bin
  do
    if [ -d "$search_root" ]; then
      detected_fbink="$(find "$search_root" -type f -name fbink 2>/dev/null | head -n 1)"
      if [ -n "$detected_fbink" ] && [ -x "$detected_fbink" ]; then
        printf '%s\n' "$detected_fbink"
        return 0
      fi
    fi
  done

  return 1
}

write_diagnostics() {
  {
    printf '\n=== FBInk diagnostic %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'PATH=%s\n' "$PATH"
    uname -a 2>/dev/null
    printf '%s\n' '-- matching files under /mnt/us --'
    find /mnt/us -type f -iname '*fbink*' 2>/dev/null
    printf '%s\n' '-- matching files under system bin directories --'
    find /usr/bin /usr/local/bin /opt/bin -type f -iname '*fbink*' 2>/dev/null
  } >> "$LOG_FILE"
}

show_error() {
  message="$1"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" >> "$LOG_FILE"
  sleep 2
  /usr/sbin/eips -c 2>/dev/null
  /usr/sbin/eips 2 4 "$message" 2>/dev/null
}

FBINK="$(find_fbink)"
if [ -z "$FBINK" ]; then
  write_diagnostics
  show_error "Kindle Dashboard: FBInk not found; copy dashboard.log"
  exit 1
fi

if [ ! -s "$FRAME_FILE" ]; then
  show_error "Kindle Dashboard: frame.png not found"
  exit 1
fi

(
  sleep 2
  printf '%s FBInk=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$FBINK" >> "$LOG_FILE"
  "$FBINK" -f -c >> "$LOG_FILE" 2>&1
  "$FBINK" -g file="$FRAME_FILE" -W GC16 >> "$LOG_FILE" 2>&1
  result=$?
  printf '%s display result=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$result" >> "$LOG_FILE"
) &

exit 0
