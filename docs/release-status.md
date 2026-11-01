# Release status

`v1.0.8` is the current Kindle client release. It adds the clock dashboard, minute-aligned scheduling and approximately 15-minute full clears; download the packaged client from the v1.0.8 GitHub Release. Previous releases and layout archives remain available.

## Local clock rollout — 2026-11-01

The initial clock rollout installed client 1.0.7 locally on the same PW4; it has not been published as a GitHub Release. Uploaded device logs confirm `daemon: starting version=1.0.7`, `refresh=60s align=1 full_every=12`, and successful FBInk displays after successive scheduled downloads. Observed device timestamps had 60/61-second intervals, consistent with whole-minute scheduling using the Mac/Kindle clock offset; visible-image writes completed about 2–3 seconds after the periodic download began.

The Mac serves the approved v3 clock PNG at 1072×1448 with national-standard CNEMC AQI. Real weather/hourly data were refreshed at 21:37 local time after an earlier DNS timeout. V2 is preserved as a selectable layout and fixed reference. Validation is automated renderer inspection plus device command/display logs; it does not claim a human inspected the physical Kindle screen. See `docs/clock-refresh.md` for timing and restoration.

## Full-clear interval follow-up — 2026-11-01

Client 1.0.8 is installed on the same PW4. The Mac advertises 15 successful displays per full clear, with the existing 60-second aligned clock cadence. Uploaded device logs confirm version 1.0.8 startup at device time 22:23:42, followed by a successful GC16 display and `refresh=60s align=1 full_every=15` at 22:23:57. The observed offset was 6 seconds. The complete 15-image cycle is covered by automated tests. A later uploaded log confirms successful minute updates through count 3540 and a full clear at 22:33:58, logged as count 3541 after display. Physical-screen appearance was not separately inspected during this follow-up.

Private device configuration, the 17-file updater manifest, previous snapshots, layout archives and recovery behavior are preserved. All 35 tests, client shell syntax, menu JSON, public-content scan and whitespace checks pass.

## Tested setup

The release was tested on a Kindle Paperwhite 4 running firmware 5.18.1.1.1 with KUAL and FBInk. The Kindle was started manually from KUAL, connected to the Mac service over Wi-Fi, and displayed the generated 1072×1448 frame.

Other Kindle models and firmware versions have not been validated. The Kindle client does not start automatically; use KUAL to launch it.

## Runtime boundary

The Mac-side server targets macOS with Node.js 22.13+ and Google Chrome. GitHub CI runs on Ubuntu and checks source, scripts, and package structure; that does not establish Linux server runtime support or compatibility with other Kindle devices. The frame layout is reviewed on a Mac.
