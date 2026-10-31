# Release status

`v1.0.6` is the current public Kindle client release.

## Tested setup

The release was tested on a Kindle Paperwhite 4 running firmware 5.18.1.1.1 with KUAL and FBInk. The Kindle was started manually from KUAL, connected to the Mac service over Wi-Fi, and displayed the generated 1072×1448 frame.

Other Kindle models and firmware versions have not been validated. The Kindle client does not start automatically; use KUAL to launch it.

## Runtime boundary

The Mac-side server targets macOS with Node.js 22.13+ and Google Chrome. GitHub CI runs on Ubuntu and checks source, scripts, and package structure; that does not establish Linux server runtime support or compatibility with other Kindle devices. The frame layout is reviewed on a Mac.
