# Kindle Dashboard Agent Contract

## Architecture boundary

- Keep the architecture as: Mac mini fetches data and renders the final PNG; Kindle is a thin Wi-Fi downloader and FBInk display client.
- Do not reintroduce the Kindle browser as the display runtime.
- Content, layout, icons, and data-module changes should normally stay in the Mac-side renderer. Do not change Kindle scripts unless the requested feature genuinely requires device behavior to change.

## Validated device facts

- Target device: Kindle Paperwhite 4 on firmware 5.18.1.1.1.
- Display framebuffer: 1072×1448, 8bpp, rotation 3.
- Validated FBInk binary: `/mnt/us/libkh/bin/fbink`.
- The device is jailbroken and has KUAL, FBInk, and OTA blocking installed.

## Kindle lifecycle and recovery safety

- The dashboard may temporarily stop `lab126_gui`, disable Pillow, and set `preventScreenSaver=1` while active.
- Every stop, error exit, and recovery path must restore the original GUI, Pillow, and power-management state.
- Restore order is safety-critical: resume frozen processes, start and wait for `lab126_gui`, restore Pillow, then restore `preventScreenSaver` last.
- On this PW4, a successful Pillow setter may be followed by an empty getter result. Treat empty readback as unavailable only when the setter itself succeeded; a nonzero setter result or a nonempty mismatched value is a failure and must be retried.
- Never create `DONT_START_FRAMEWORK` or make another persistent framework-disabling change.
- Preserve the standalone recovery script and failure state so a later KUAL action or reboot can recover the native UI.

## Startup policy

- Kindle startup remains manual through KUAL. Do not add or expose Kindle auto-start unless the user explicitly changes this decision.
- The Mac mini rendering service remains a launchd service so the LAN image endpoint survives Mac restarts.
- Compatibility-only Kindle auto-start scripts currently remain in the client distribution because older updaters require the exact 17-file manifest. They must stay hidden from KUAL and must not be activated. Removing them requires an explicit updater-protocol migration.

## Client update compatibility

- `kindle/kindle-dashboard/config.sh` is device-local and must never be included in remote updates.
- Keep the exact allowlist, SHA-256 verification, size verification, full staging, backup, and atomic replacement behavior.
- Any released change to a remotely distributed Kindle file requires incrementing both `kindle/kindle-dashboard/VERSION` and the version in `config.xml`.
- Do not remove or add distributed filenames without first designing a migration that the oldest installed updater can accept.
- A failed update must leave the installed client usable and must not prevent the current dashboard version from starting.

## Reliability invariants

- Keep PNG validation and temporary-download/atomic-replacement behavior.
- Network, weather-provider, or rendering failures must preserve the last valid frame.
- Keep the native-UI recovery route independent of the Mac service where possible; a Kindle reboot must remain a valid final recovery path.
- Remote stop commands must not remain queued after the device has retrieved them.
- Do not expose arbitrary server filesystem reads or writes through client update, log, or control endpoints.

## PNG layout versioning

- Archive only a new approved major layout: a structural re-layout or a substantial change to displayed content. Before making that change, preserve the prior major layout as a 1072×1448 reference PNG rendered with fixed demonstration data, under `design-archive/<major-version-name>/`.
- Do not create an archive version for minor spacing, typography, copy, or small data-display refinements within the same major layout. Update that major version's reference PNG and README in place when a later minor refinement becomes the accepted baseline.
- Record the archived major-version path, major-version name, reason, and main layout/content changes in the same Git commit. This must make each approved major layout viewable and restorable from its commit.

## Required verification

Before publishing a change:

1. Run `npm test`.
2. Run `sh -n` on every file under `kindle/kindle-dashboard/bin/` and `kindle/kindle-dashboard/lib/`.
3. Parse `kindle/kindle-dashboard/menu.json` as JSON.
4. Run `git diff --check`.
5. For renderer changes, verify that the generated PNG is exactly 1072×1448 and visually inspect it for clipping, wrapping, and separator overlap.
6. For Kindle lifecycle changes, retain fault-injection coverage for GUI stop/start, Pillow restoration, power restoration, FBInk display, and stop acknowledgement ordering.

## Scope of this file

- Do not encode the current dashboard content selection, visual layout, or refresh intervals here; those are evolving product configuration.
- Keep incident history and debugging chronology in `findings.md` and `progress.md`, not in this contract.
