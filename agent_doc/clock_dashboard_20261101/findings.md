# Findings

## 2026-11-01
- Repository is clean and has no `.trellis` directory. The project AGENTS.md is authoritative.
- Live local configuration selects `runtime/client-releases/1.0.6-e1cf85f145a6b6d4`; city Beijing, timezone Asia/Shanghai, port 8787.
- Both local.kindle-dashboard and com.perrin.kindle-dashboard plist files exist; active job must be checked before restart.
- Current renderer is clock-free v2; its reference PNG exists but there is no archived v2 renderer source yet.
- Weather has a 15-minute cache; AQI currently comes from Open-Meteo `us_aqi`. Chinese standard cannot be obtained by renaming its category.
- Kindle default download cadence is 1800 seconds; the daemon uses elapsed time after completion, which drifts. It polls commands every 15 seconds.
- Display uses GC16 each frame; at count=0 and each 12 successful displays it additionally runs FBInk `-f -c`. Full clear is count-based, not a wall-clock timer.
- Local config is never remotely updated. Existing updater manifest has exactly 17 files and must remain unchanged.
- Approved preview is stored in the thread visualization directory as kindle-balanced-refined.html. This implementation follows its final larger clock and shortened AQI grades.

## Implementation decisions
- Confirmed the first-party CNEMC JSON endpoint responds with city AQI, Area, CityCode and TimePoint, using TLS validation. Beijing matched the same-hour MEE page. Use this directly instead of computing national AQI from modeled pollutant concentrations.
- The currently active launchd job is local.kindle-dashboard; com.perrin.kindle-dashboard exists on disk but is not loaded. Device log upload completed and showed the old 1800-second cadence.
- Device-private config remains untouched. The frame response advertises cadence/alignment/server epoch; client 1.0.7 stores only validated numeric timing values, including on 304, and aligns its next deadline to Mac time.
- V2 render.js and its original reference PNG are retained; default renderer selects v3 or the archived renderer via DASHBOARD_LAYOUT. The existing 17-file updater protocol is unchanged.
- Weather cache is refreshed in the background, US cache AQI is invalidated, and national observations older than three hours are rejected. Rain summary is recalculated against the current hour each minute.

## Live preflight boundary
- The current service log already contains Open-Meteo DNS resolution timeouts. A direct domain-only probe and dscacheutil both timed out, while the official CNEMC endpoint was reachable. This establishes a provider-connectivity problem, not its root cause.
- The existing weather cache is valid PNG/input fallback but lacks the new hourly series. During this outage, v3 displays cached weather and an explicit missing-rain-data label; it must not invent today's no-rain status.
- National AQI refresh now remains independent when the weather response fails; the existing weather timestamp is preserved. A regression test covers this cross-provider fallback.
- Auto-review required explicit permission for continuing the configured coordinate-bearing Open-Meteo requests. User explicitly authorized continuing the existing coordinates and Open-Meteo; subsequent networking is authorized. CNEMC requests contain no coordinates.
