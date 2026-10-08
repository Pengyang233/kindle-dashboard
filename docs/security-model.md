# Security model

Run the server only on a trusted local network. The service uses plain HTTP and does not provide TLS or a public hosting guarantee. Leave `HOST=127.0.0.1` for local preview. Set `HOST=0.0.0.0` only when the Kindle or a browser must reach the Mac over the LAN, and restrict network access at the router or firewall.

The control page uses HTTP Basic credentials. `DASHBOARD_CONTROL_ORIGINS` restricts which browser origins may make control requests; it is an additional browser boundary, not a substitute for authentication. Basic credentials and the device token travel over HTTP without encryption. Anyone able to observe or alter LAN traffic could read credentials or replace responses.

The Kindle updater checks the size and SHA-256 hash of each file against a manifest served by the same HTTP server. This detects transfer corruption. It does not authenticate the publisher because a party able to replace the files can replace the manifest as well. Keep the server on a trusted LAN and use source you have reviewed.

The service sends configured weather coordinates to Open-Meteo to request forecasts. The setup file `.env.local`, Kindle `config.sh`, and runtime logs are local data and must stay out of source publication. The generated Kindle ZIP omits `config.sh`; its 17-file remote update allowlist also omits it. Device startup is manual through KUAL.

The update service reads a selected local release snapshot, not the evolving working client directory. Stage a new snapshot explicitly and restart the service to select it; staging alone does not issue a device command.
