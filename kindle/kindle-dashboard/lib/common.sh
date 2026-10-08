#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
CONFIG_FILE="$EXTENSION_DIR/config.sh"
ASSETS_DIR="$EXTENSION_DIR/assets"
STATE_DIR="$EXTENSION_DIR/state"
LOG_FILE="$EXTENSION_DIR/dashboard.log"

if [ -f "$CONFIG_FILE" ]; then
  . "$CONFIG_FILE"
fi

DASHBOARD_BASE_URL="${DASHBOARD_BASE_URL:-}"
DEVICE_ID="${DEVICE_ID:-pw4}"
DEVICE_TOKEN="${DEVICE_TOKEN:-}"
REFRESH_SECONDS="${REFRESH_SECONDS:-1800}"
COMMAND_POLL_SECONDS="${COMMAND_POLL_SECONDS:-15}"
SERVER_OFFLINE_EXIT_SECONDS="${SERVER_OFFLINE_EXIT_SECONDS:-21600}"
WIFI_SETTLE_SECONDS="${WIFI_SETTLE_SECONDS:-8}"
DISPLAY_SETTLE_SECONDS="${DISPLAY_SETTLE_SECONDS:-5}"
RESTORE_RETRY_ATTEMPTS="${RESTORE_RETRY_ATTEMPTS:-5}"
RESTORE_RETRY_SECONDS="${RESTORE_RETRY_SECONDS:-2}"
FULL_REFRESH_EVERY="${FULL_REFRESH_EVERY:-12}"
LOW_BATTERY_PERCENT="${LOW_BATTERY_PERCENT:-15}"
AUTO_UPDATE_ON_START="${AUTO_UPDATE_ON_START:-0}"
LOG_MAX_BYTES="${LOG_MAX_BYTES:-262144}"
INITCTL="${KINDLE_INITCTL:-/sbin/initctl}"
EIPS="${KINDLE_EIPS:-/usr/sbin/eips}"

mkdir -p "$ASSETS_DIR" "$STATE_DIR"

rotate_log() {
  [ -f "$LOG_FILE" ] || return 0
  log_bytes="$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ')"
  case "$log_bytes" in ''|*[!0-9]*) return 0 ;; esac
  if [ "$log_bytes" -gt "$LOG_MAX_BYTES" ]; then
    tail -c 131072 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null &&
      mv -f "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

log_message() {
  rotate_log
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

valid_http_url() {
  url_to_validate="$1"
  [ -n "$url_to_validate" ] || return 1
  LC_ALL=C awk -v url="$url_to_validate" '
    function valid_authority(authority, i, count, labels, port) {
      if (authority ~ /^\[[[:xdigit:]:.]+\](:[0-9]+)?$/) return 1
      if (authority ~ /:/) {
        port = authority
        sub(/^.*:/, "", port)
        if (port !~ /^[0-9]+$/ || (port + 0) < 1 || (port + 0) > 65535) return 0
        sub(/:[0-9]+$/, "", authority)
      }
      if (authority == "" || authority ~ /^\./ || authority ~ /\.$/ || authority ~ /\.\./) return 0
      if (authority !~ /^[A-Za-z0-9.-]+$/) return 0
      count = split(authority, labels, ".")
      for (i = 1; i <= count; i++) {
        if (labels[i] == "" || labels[i] ~ /^-/ || labels[i] ~ /-$/ || length(labels[i]) > 63) return 0
      }
      return 1
    }
    BEGIN {
      if (url ~ /[[:space:][:cntrl:]]/) exit 1
      normalized = tolower(url)
      if (normalized !~ /^https?:\/\/[^\/?#]+([\/?#].*)?$/) exit 1
      authority = url
      sub(/^[Hh][Tt][Tt][Pp][Ss]?:\/\//, "", authority)
      sub(/[\/?#].*$/, "", authority)
      if (authority ~ /@/ || !valid_authority(authority)) exit 1
      exit 0
    }'
}

validate_network_config() {
  [ -n "$DEVICE_TOKEN" ] || return 1
  valid_http_url "$DASHBOARD_BASE_URL"
}

require_network_config() {
  if validate_network_config; then
    return 0
  fi
  log_message "network: configure a valid DASHBOARD_BASE_URL and non-empty DEVICE_TOKEN in config.sh"
  return 1
}

find_fbink() {
  for candidate in \
    ${KINDLE_FBINK:-} \
    /mnt/us/libkh/bin/fbink \
    /mnt/us/extensions/FBInk/bin/fbink \
    /mnt/us/extensions/fbink/bin/fbink \
    /usr/local/bin/fbink
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_wifi() {
  lipc-set-prop com.lab126.wifid enable 1 >> "$LOG_FILE" 2>&1
  lipc-set-prop com.lab126.cmd ensureConnection wifi >> "$LOG_FILE" 2>&1
  sleep "$WIFI_SETTLE_SECONDS"
}

download_file() {
  download_url="$1"
  download_output="$2"
  rm -f "$download_output"
  if command -v curl >/dev/null 2>&1; then
    curl -f -sS -L --connect-timeout 10 --max-time 45 \
      -o "$download_output" "$download_url" >> "$LOG_FILE" 2>&1
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 45 -O "$download_output" "$download_url" >> "$LOG_FILE" 2>&1
    return $?
  fi
  log_message "network: neither curl nor wget is available"
  return 127
}

sha256_file() {
  checksum_file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$checksum_file" | awk '{print $1}'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$checksum_file" | awk '{print $NF}'
    return 0
  fi
  return 127
}

valid_png() {
  png_file="$1"
  [ -s "$png_file" ] || return 1
  png_signature="$(dd if="$png_file" bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')"
  [ "$png_signature" = "89504e470d0a1a0a" ] || return 1
  png_bytes="$(wc -c < "$png_file" | tr -d ' ')"
  case "$png_bytes" in ''|*[!0-9]*) return 1 ;; esac
  [ "$png_bytes" -ge 10000 ]
}

read_number_file() {
  number_file="$1"
  if [ -f "$number_file" ]; then
    cat "$number_file" 2>/dev/null
  else
    printf '0\n'
  fi
}

show_message() {
  message="$1"
  "$EIPS" -c 2>/dev/null
  "$EIPS" 2 4 "$message" 2>/dev/null
}
