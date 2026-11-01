# v3 — Clock, weather and Mac status

Approved on 2026-11-01. Adds a large 12-hour HH:MM clock, popular Chinese festival precedence over the current solar term, Chinese-standard AQI with shortened category labels, explicit rain timing, text-only three-day forecasts, and the retained Mac status footer.

The clock is the primary visual focus, current temperature secondary, and forecasts/status form the lower bands. The reference uses fixed public demonstration data and is exactly 1072×1448. Regenerate with `npm run prepare-demo`.

The previous major layout is preserved in `design-archive/v2-weather-system-status/` (reference PNG and executable renderer). Its replacement was necessary to give the clock sufficient size without removing Mac status. Set `DASHBOARD_LAYOUT=weather` and restart the Mac service to restore v2; see `docs/clock-refresh.md` for the complete rollback and timing instructions.

No client autostart behavior changed. This is a layout archive, not a device-runtime backup.
