#!/bin/sh
set -eu
PLIST="$HOME/Library/LaunchAgents/local.kindle-dashboard.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
printf 'Removed Kindle Dashboard launch agent.\n'
