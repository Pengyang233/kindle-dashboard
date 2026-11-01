# Progress

## 2026-11-01 — inspection
- Read AGENTS.md, renderer, weather and solar-term logic, client download/display/daemon/recovery interfaces, release staging, tests and launchd installer.
- Confirmed clean working tree; no existing Trellis task or planning directory to resume.
- Next: resolve national AQI data and obtain current device status through the existing authenticated control endpoint before implementation.

## 2026-11-01 — implementation and first verification
- Added clock HTML template, holiday whitelist/precedence, CNEMC national AQI validation, clear rain timing and missing-data handling.
- Added minute-boundary client scheduling plus server timing headers, preserving private config, atomic PNG handling and the 17-file updater allowlist. Client VERSION/config.xml are 1.0.7.
- Preserved v2 source/reference and generated the v3 fixed-data reference and client fallback; visually inspected the 1072x1448 PNG.
- First expanded test run passed 30/30, including timing-header validation, HTTP 304 scheduling, failed-download isolation, 12-successful-image full clears and FBInk failure counters. Cross-minute render and concurrent frame handling were subsequently improved; final check pending.
- All client shell syntax and menu JSON checks passed; git diff --check passed at this checkpoint.
- Next: final tests, inspect live national-weather render, stage immutable client, restart active service, remotely update the connected Kindle and verify multiple minute boundaries.

## 2026-11-01 — final gate and rollout started
- Final tests passed 34/34; public-content scan, all client Shell syntax, menu JSON and diff whitespace checks passed.
- Fixed national-weather adapter option propagation and tested it end to end with mocked first-party responses. Also verified national AQI can refresh independently while cached weather keeps its original timestamp.
- Open-Meteo remains unreachable due to domain resolution timeout; existing service logs show the same failure. A cached-weather/CNEMC offline PNG was generated and inspected at 1072x1448. Missing new hourly series correctly shows rain data unavailable.
- Candidate client 1.0.7 staged immutably at runtime/client-releases/1.0.7-38035f89ac07b959. Exact 17-file manifest retained and config.sh excluded. The previous 1.0.6 snapshot remains intact.
- User explicitly authorized ongoing configured-coordinate requests to Open-Meteo after auto-review required confirmation.
- Selected clock layout / Beijing national city in private Mac config and started the restart/update rollout. Live device minute-cadence verification is still pending.

## 2026-11-01 — rollout verification complete
- Active launchd job restarted successfully; live endpoint serves client manifest 1.0.7 and a 1072x1448 PNG with refresh=60, align=1 and stale=0.
- Update command queued at 21:37:21 Asia/Shanghai. Uploaded Kindle logs confirm version=1.0.7 startup at device time 21:37:48, followed by timing: refresh=60s align=1 full_every=12 server_offset=5.
- Device periodic fetches were logged at 21:38:55, 21:39:55 and 21:40:56, with FBInk result=0 at 21:38:58, 21:39:58 and 21:40:58. Intervals 60/61 seconds show whole-minute scheduling with second-granularity offset correction rather than accumulated completion-time drift. Startup offset maps the first periodic fetch to Mac 21:39:00. Four successful displays were observed including startup.
- Live weather cache refreshed successfully at 2026-11-01T13:37:22.067Z (21:37 local), contains 24 hourly samples, and reports CNEMC city AQI 35 / CN at 21:00 local observation time. The earlier provider DNS failure was transient; root cause was not established. The current view correctly shows today's no-rain label from valid hourly data.
- Visually inspected the live PNG and fixed-data PNG, both 1072x1448. Old v1/v2 reference PNGs have no Git diff, and v2 renderer/cadence restoration has a regression test.
- Final quality gate: 34 tests pass; client Shell syntax, menu JSON, public-content scan and git diff --check pass. Full-clear cadence/failure counters were verified in tests; live startup confirms device setting 12. Physical-screen human acceptance is not claimed from logs alone.
- The requested rollout and documentation are complete. Source/archive changes will be recorded together in one local commit; no remote push or release publication is part of this task.

## 15-minute full-clear rollout
- Added the server-selected full-clear interval, default 15 for clock, and client 1.0.8 runtime adoption. Retained private device config and exact 17-file updater allowlist.
- Quality gate: 35/35 tests, all bin/lib shell syntax, menu JSON, public-content check and git diff --check passed. Tests verify both 12-image fallback and 15-image override cycles plus failed FBInk counters.
- Backed up private settings under runtime/backups/full-refresh-15-20261101/; retained old immutable snapshots. Staged 1.0.8 and restarted the existing local.kindle-dashboard job. Live frame headers confirm refresh=60, align=1, full_every=15.
- Updated PW4 through its authenticated update channel. Uploaded log confirms version=1.0.8 startup at 22:23:42 device time, successful display count=3531 at 22:23:57, and timing refresh=60s align=1 full_every=15 server_offset=6.
- Device setting and FBInk success are verified. No claim of a complete live 15-minute observation or physical-screen visual acceptance.

## Public release verification
- User authorized publication of v1.0.8 after checks. Refetched origin; main remains the expected ancestor, with no intervening upstream changes.
- Re-ran all 35 tests successfully, shell syntax for bin/lib, menu JSON, public-content scan and diff whitespace checks.
- Built and inspected the v1.0.8 ZIP: 21 packaged files, no device config.sh, no .env/runtime/state/log data, executable bin scripts retained. All three retained/current reference PNGs are 1072×1448; visually inspected the approved v3 reference for clipping, wrapping and separator overlap.
- Live frame remains 1072×1448, fresh (stale=0), with refresh=60, align=1 and full_every=15; a subsequent HTTP 304 also carries the full-clear setting.
- Fresh device log confirms successful minute updates under 1.0.8 and an actual full clear at device time 22:33:58 (successful count 3541 after displaying, previous count 3540 divisible by 15). Visually inspected the live 22:34 PNG as well as the fixed reference; both retain readable clock, current weather, forecast and Mac status without overlap.
- Scanned every tracked blob in both unpublished implementation commits against configured private credentials, device token and precise coordinates without printing those values; no matches.
