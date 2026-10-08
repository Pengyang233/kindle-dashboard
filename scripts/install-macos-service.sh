#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
"$NODE_BINARY" "$SCRIPT_DIR/validate-local-config.js"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS_DIR/local.kindle-dashboard.plist"
SERVICE_DOMAIN="gui/$(id -u)"
mkdir -p "$LAUNCH_AGENTS_DIR" "$PROJECT_DIR/runtime/device-logs"
"$NODE_BINARY" "$SCRIPT_DIR/write-launch-agent.js" "$PLIST.new" "$NODE_BINARY"
plutil -lint "$PLIST.new" >/dev/null
mv -f "$PLIST.new" "$PLIST"
launchctl bootout "$SERVICE_DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$SERVICE_DOMAIN" "$PLIST"
launchctl enable "$SERVICE_DOMAIN/local.kindle-dashboard"
launchctl kickstart -k "$SERVICE_DOMAIN/local.kindle-dashboard"
printf 'Installed Kindle Dashboard launch agent.\n'
