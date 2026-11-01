# Clock layout, refresh timing and restoration

## Layouts

- `DASHBOARD_LAYOUT=clock` (default): approved v3, 12-hour HH:MM clock, festival/solar term, current weather, text-only forecasts and Mac status.
- `DASHBOARD_LAYOUT=weather`: preserved v2, without the clock.

The v2 PNG and executable renderer remain in `design-archive/v2-weather-system-status/`. V3's fixed-data 1072×1448 reference is in `design-archive/v3-clock-weather-status/`. `npm run prepare-demo` regenerates v3 and the client fallback only; it never overwrites older major-layout references.

## Refresh timing

The Mac includes numeric timing headers with each authenticated frame response, including HTTP 304:

- `X-Dashboard-Refresh-Seconds`: 60 for clock, 1800 for v2 weather.
- `X-Dashboard-Align`: 1 for clock, 0 for weather.
- `X-Dashboard-Server-Epoch`: the current Mac epoch in seconds.

Client 1.0.7 validates these fields and saves them under its runtime `state/` directory. It does not overwrite private `config.sh`. Without valid timing headers, it retains the previous valid schedule or falls back to `REFRESH_SECONDS` in device config (default 1800).

Clock downloads are scheduled on whole minute boundaries of Mac time. The device compensates for its clock's epoch offset using the server header without changing the Kindle system clock. It sleeps only until the earlier of its next command poll or frame boundary. Download/render/display time does not accumulate into the next boundary. A manual refresh also leaves the next whole-minute boundary intact.

The frame appears after PNG generation, Wi-Fi transfer and FBInk display, so this is minute-aligned scheduling rather than a guarantee that pixels finish changing at exactly :00. A frame whose rendering crossed a minute boundary is regenerated for the new minute.

Weather is cached for 15 minutes, then refreshed in the background so an unavailable weather source does not freeze an otherwise healthy clock. Mac status is sampled for each new frame. CNEMC city AQI is published hourly; the server checks it with weather refreshes and rejects observations more than three hours old. `AIR_QUALITY_CITY` defaults to `DASHBOARD_CITY` and should name a city in the CNEMC feed, e.g. `北京市`. US AQI is never relabeled as Chinese AQI.

## Ordinary image update and full clearing

`bin/display-frame.sh` uses GC16 for every successful image update. `FULL_REFRESH_EVERY` in the Kindle's private `config.sh` controls the extra full clear (`fbink -f -c`) before displaying the image. Its default remains **12**.

- A count of 0 triggers a full clear.
- The persisted successful-display count triggers the next clear each 12 images.
- With one changed frame per minute this is approximately **12 minutes** between full clears, not a fixed wall-clock schedule.
- Manual image updates count; failed downloads, HTTP 304, unchanged images and failed FBInk calls do not count as successful new displays.
- The counter survives client updates/restarts, so deployment does not promise an immediate full clear or restart the 12-image cycle.

Examples for device-local `config.sh`: `FULL_REFRESH_EVERY=5` gives approximately five minutes; `FULL_REFRESH_EVERY=12` gives approximately twelve. Keep it a positive integer. Changing this setting requires a dashboard restart. Only change it when explicitly desired; this rollout retains 12.

Command polling remains every 15 seconds, with the sleep shortened near a minute boundary. It controls update/stop/refresh command latency, not the clock cadence.

## Content rules

Calendar: popular Chinese festivals on the date take precedence over solar terms. Otherwise show the current solar term. A whitelist covers major traditional festivals and common public festivals; northern/southern Little New Year dates are both recognized. Same-date festivals may be shown together.

AQI: CNEMC city-level national-standard AQI, with display abbreviations 优、良、轻度、中度、重度、严重. These are abbreviations, not changed thresholds. Missing or expired AQI displays `-- · 暂无`.

Rain: current rain/snow takes precedence. Otherwise find the first future hourly probability >=40%, within the following 24 hours: `本小时有雨`, `18时有雨`, `明日8时有雨` (or snow when the hourly weather code identifies it). Past-hour probabilities are ignored. If no hour meets the threshold and the remaining hours of today are present, show `今日无雨`. Missing/invalid/incomplete data displays `降雨数据暂无` rather than an invented no-rain forecast. The label is recomputed from the cached hourly series every frame, so an earlier predicted hour does not remain on the clock all afternoon.

## Restore the earlier layout

1. In the Mac project's `.env.local`, set `DASHBOARD_LAYOUT=weather`.
2. Restart the existing launchd job: `launchctl kickstart -k "gui/$(id -u)/local.kindle-dashboard"`.
3. Send “立即刷新” from the authenticated control page. The next downloaded frame restores v2; the client then adopts its service-advertised 1800-second cadence.

To return to the clock, set `DASHBOARD_LAYOUT=clock`, restart the service and request one refresh. Client 1.0.7 supports both layouts, so a client downgrade is unnecessary.

The prior private Mac configuration and client-snapshot selection were backed up under the ignored local `runtime/backups/clock-dashboard-20261101/` directory. Do not publish or copy those files into a release. The previous immutable client snapshot is retained under `runtime/client-releases/`; the Kindle updater also keeps its own previous-release rollback directory.

Startup remains manual through KUAL; no device autostart was added.
