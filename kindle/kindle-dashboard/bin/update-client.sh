#!/bin/sh

EXTENSION_DIR="${KINDLE_DASHBOARD_DIR:-/mnt/us/extensions/kindle-dashboard}"
. "$EXTENSION_DIR/lib/common.sh"

if ! require_network_config; then
  exit 2
fi

MANIFEST_URL="${DASHBOARD_BASE_URL%/}/client/manifest.txt"
STAGE_DIR="$STATE_DIR/update-staging"
BACKUP_DIR="$STATE_DIR/update-rollback"
MANIFEST_FILE="$STAGE_DIR/manifest.txt"
INSTALL_LIST="$STAGE_DIR/install.list"
force_update=0
[ "${1:-}" = "--force" ] && force_update=1

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

if ! download_file "$MANIFEST_URL" "$MANIFEST_FILE"; then
  log_message "update: manifest download failed"
  rm -rf "$STAGE_DIR"
  exit 2
fi

set -- $(sed -n '1p' "$MANIFEST_FILE")
if [ "$#" -ne 2 ] || [ "$1" != "version" ]; then
  log_message "update: invalid manifest header"
  rm -rf "$STAGE_DIR"
  exit 3
fi
remote_version="$2"
case "$remote_version" in ''|*[!A-Za-z0-9._-]*)
  log_message "update: invalid version $remote_version"
  rm -rf "$STAGE_DIR"
  exit 3
;; esac

current_version="$(cat "$EXTENSION_DIR/VERSION" 2>/dev/null)"
if [ "$current_version" = "$remote_version" ] && [ "$force_update" -ne 1 ]; then
  log_message "update: already current version=$current_version"
  rm -rf "$STAGE_DIR"
  exit 10
fi

: > "$INSTALL_LIST"
files_seen=0
manifest_failed=0
while IFS=' ' read -r record_type expected_hash expected_size relative_path extra; do
  [ "$record_type" = "file" ] || continue
  case "$relative_path" in
    VERSION|config.xml|menu.json|lib/common.sh|\
    bin/dashboard-daemon.sh|bin/display-frame.sh|bin/fetch-frame.sh|\
    bin/install-autostart.sh|bin/refresh-now.sh|bin/remove-autostart.sh|\
    bin/restore-ui.sh|bin/start-dashboard.sh|bin/status.sh|\
    bin/stop-dashboard.sh|bin/update-and-restart.sh|bin/update-client.sh|\
    bin/upload-log.sh) ;;
    *) manifest_failed=1; log_message "update: rejected path $relative_path"; break ;;
  esac
  case "$expected_hash" in *[!0-9a-f]*)
    manifest_failed=1; log_message "update: invalid hash for $relative_path"; break
  ;; esac
  if [ "${#expected_hash}" -ne 64 ]; then
    manifest_failed=1; log_message "update: invalid hash length for $relative_path"; break
  fi
  case "$expected_size" in ''|*[!0-9]*)
    manifest_failed=1; log_message "update: invalid size for $relative_path"; break
  ;; esac
  if [ -n "$extra" ]; then
    manifest_failed=1; log_message "update: extra manifest fields for $relative_path"; break
  fi

  staged_file="$STAGE_DIR/files/$relative_path"
  mkdir -p "$(dirname "$staged_file")"
  if ! download_file "${DASHBOARD_BASE_URL%/}/client/files/$relative_path" "$staged_file"; then
    manifest_failed=1; log_message "update: download failed for $relative_path"; break
  fi
  actual_size="$(wc -c < "$staged_file" | tr -d ' ')"
  actual_hash="$(sha256_file "$staged_file")"
  if [ "$actual_size" != "$expected_size" ] || [ "$actual_hash" != "$expected_hash" ]; then
    manifest_failed=1
    log_message "update: verification failed for $relative_path size=$actual_size hash=$actual_hash"
    break
  fi
  printf '%s\n' "$relative_path" >> "$INSTALL_LIST"
  files_seen=$((files_seen + 1))
done < "$MANIFEST_FILE"

for required_path in \
  VERSION config.xml menu.json lib/common.sh \
  bin/dashboard-daemon.sh bin/display-frame.sh bin/fetch-frame.sh \
  bin/install-autostart.sh bin/refresh-now.sh bin/remove-autostart.sh \
  bin/restore-ui.sh bin/start-dashboard.sh bin/status.sh \
  bin/stop-dashboard.sh bin/update-and-restart.sh bin/update-client.sh \
  bin/upload-log.sh
do
  if [ ! -f "$STAGE_DIR/files/$required_path" ]; then
    manifest_failed=1
    log_message "update: required file missing $required_path"
  fi
done

if [ "$manifest_failed" -ne 0 ] || [ "$files_seen" -ne 17 ]; then
  log_message "update: staging rejected files=$files_seen"
  rm -rf "$STAGE_DIR"
  exit 4
fi

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
while IFS= read -r relative_path; do
  [ -n "$relative_path" ] || continue
  if [ -f "$EXTENSION_DIR/$relative_path" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$relative_path")"
    cp "$EXTENSION_DIR/$relative_path" "$BACKUP_DIR/$relative_path" || exit 5
  fi
done < "$INSTALL_LIST"

install_failed=0
while IFS= read -r relative_path; do
  [ -n "$relative_path" ] || continue
  [ "$relative_path" = "VERSION" ] && continue
  destination="$EXTENSION_DIR/$relative_path"
  mkdir -p "$(dirname "$destination")"
  cp "$STAGE_DIR/files/$relative_path" "$destination.new" || { install_failed=1; break; }
  case "$relative_path" in *.sh) chmod 755 "$destination.new" ;; esac
  mv -f "$destination.new" "$destination" || { install_failed=1; break; }
done < "$INSTALL_LIST"

if [ "$install_failed" -eq 0 ]; then
  cp "$STAGE_DIR/files/VERSION" "$EXTENSION_DIR/VERSION.new" &&
    mv -f "$EXTENSION_DIR/VERSION.new" "$EXTENSION_DIR/VERSION" || install_failed=1
fi

if [ "$install_failed" -ne 0 ]; then
  log_message "update: install failed, restoring backup"
  while IFS= read -r relative_path; do
    [ -f "$BACKUP_DIR/$relative_path" ] || continue
    cp "$BACKUP_DIR/$relative_path" "$EXTENSION_DIR/$relative_path.rollback" &&
      mv -f "$EXTENSION_DIR/$relative_path.rollback" "$EXTENSION_DIR/$relative_path"
  done < "$INSTALL_LIST"
  rm -rf "$STAGE_DIR"
  exit 6
fi

rm -rf "$STAGE_DIR"
log_message "update: installed version=$remote_version files=$files_seen"
exit 20
