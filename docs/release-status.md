# Release status

`1.0.6` is a source publication snapshot. Its renderer, server, and Kindle client have not been validated together on a real Kindle device. It is not a stable device release, and no hardware-tested release is being announced here.

The original `1.0.5` implementation has historical real-device experience. That history is separate from this public source snapshot and does not validate `1.0.6`. Hardware verification, credential rotation on an installed device, and deployment cutover are deferred.

The intended architecture is a Mac running Node.js 22.13+ and Chrome to fetch data and render a `1072×1448` PNG, with a jailbroken Paperwhite 4 using KUAL and FBInk as a thin Wi-Fi display client. Starting the Kindle client remains a manual KUAL action. Public CI validates source checks and package structure on Ubuntu; it does not claim Linux runtime or Kindle hardware compatibility. PNG layout review is done visually on a local Mac.
