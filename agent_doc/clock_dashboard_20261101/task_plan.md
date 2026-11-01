# Clock dashboard rollout

## Objective
Deploy the approved clock/weather template, preserve the previous template, and update the Kindle once per minute on minute boundaries.

## Scope and change boundary
- Renderer: retain the previous v2 renderer and reference PNG; add approved v3 12-hour HH:MM clock, holiday-before-solar-term label, text-only forecasts and Mac status.
- Data: use Chinese AQI categories and a compatible Chinese-standard source/calculation; never relabel an existing US index. Rain copy uses a 40% threshold, explicit hours, and a separate missing-data state.
- Device timing: retain the 17-file updater protocol and local config isolation; upgrade only files needed for minute scheduling. Preserve all lifecycle recovery ordering and PNG atomic replacement behavior.
- Deployment: back up local configuration and the selected client snapshot, run checks, update the existing launchd service and the running Kindle through its authenticated update route, then verify consecutive live updates.

## Acceptance criteria
1. Old renderer plus fixed 1072x1448 reference remain available, with a documented configuration switch for restoration.
2. Default PNG matches approved layout and passes visual inspection, including long/negative values and missing-data states.
3. Holiday precedence, Chinese AQI, rain threshold/missing data, 12-hour noon/midnight and minute scheduling have meaningful coverage.
4. `npm test`, shell syntax, menu JSON, `git diff --check`, explicit 17-file staging checks pass.
5. Live Mac service serves the new PNG and the selected new client version; device update completion and at least two aligned minute updates are evidenced, or the exact external blocker is reported.
6. Document ordinary refresh, full-clear cadence, cached weather cadence and rollback instructions.

## Non-goals
No browser runtime on Kindle, no autostart changes, no GUI recovery redesign, no public GitHub release/push, no credential publication.

## Open questions
- Resolved: first-party CNEMC city JSON feed, with timestamps and exact local city matching.
- Resolved: active launchd label local.kindle-dashboard; device verified online, upgraded to 1.0.7, with 60-second aligned refresh and full_every=12.

## Phases
- [x] Inspect deployment and AQI provider
- [x] Preserve v2 and implement v3/data/timing
- [x] Verify tests and visual output
- [x] Deploy and verify actual device cadence
- [x] Document settings and restoration

## Follow-up — 15-minute full clear
User authorized changing the normal full-clear cadence to 15 minutes. Continue the existing clock rollout: add a validated full-clear count to the existing timing-header channel (15 in clock mode; 0 releases it in legacy weather mode), retain private config as fallback, release client 1.0.8 under the same 17-file manifest, update docs and verify device logs show refresh=60 / full_every=15. No renderer or lifecycle recovery changes are needed.

Completed: client 1.0.8 deployed and uploaded PW4 logs confirm 60-second aligned updates with full_every=15. Required quality gate passed (35 tests).
