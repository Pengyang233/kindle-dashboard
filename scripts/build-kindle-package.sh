#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLIENT_DIR="$PROJECT_DIR/kindle/kindle-dashboard"
VERSION="$(cat "$CLIENT_DIR/VERSION")"
OUTPUT_DIR="$PROJECT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/kindle-dashboard-v$VERSION.zip"
STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kindle-dashboard-package.XXXXXX")"
STAGED_CLIENT="$STAGE_ROOT/kindle-dashboard"
TEMP_OUTPUT="$OUTPUT_FILE.tmp.$$"

cleanup() {
  rm -rf "$STAGE_ROOT"
  rm -f "$TEMP_OUTPUT"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

copy_allowed_file() {
  relative_path="$1"
  source_file="$CLIENT_DIR/$relative_path"
  staged_file="$STAGED_CLIENT/$relative_path"
  if [ ! -f "$source_file" ] || [ -L "$source_file" ]; then
    printf 'Missing package input: %s\n' "$relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$staged_file")"
  cp -p "$source_file" "$staged_file"
}

mkdir -p "$OUTPUT_DIR"
for relative_path in \
  VERSION config.xml config.example.sh menu.json lib/common.sh \
  bin/dashboard-daemon.sh bin/display-frame.sh bin/display-test.sh \
  bin/fetch-frame.sh bin/install-autostart.sh bin/refresh-now.sh \
  bin/remove-autostart.sh bin/restore-ui.sh bin/start-dashboard.sh \
  bin/status.sh bin/stop-dashboard.sh bin/update-and-restart.sh \
  bin/update-client.sh bin/upload-log.sh assets/frame.png
do
  copy_allowed_file "$relative_path"
done

[ -f "$PROJECT_DIR/LICENSE" ] && [ ! -L "$PROJECT_DIR/LICENSE" ] || exit 1
cp "$PROJECT_DIR/LICENSE" "$STAGED_CLIENT/LICENSE"
rm -f "$TEMP_OUTPUT"
(
  cd "$STAGE_ROOT"
  zip -q -r "$TEMP_OUTPUT" kindle-dashboard
)
mv -f "$TEMP_OUTPUT" "$OUTPUT_FILE"
printf '%s\n' "$OUTPUT_FILE"
