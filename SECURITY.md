# Security policy

The public `v1.0.6` release has been validated on a Kindle Paperwhite 4 running firmware 5.18.1.1.1 with KUAL and FBInk. Other Kindle models and firmware versions have not been validated. This is a compatibility note, not a security guarantee.

Run the service only on a trusted local network. It uses plain HTTP and does not provide TLS or a public hosted service. Read [the security model](docs/security-model.md) before allowing LAN access.

Report a suspected vulnerability through GitHub's private vulnerability reporting flow when it is available for this repository. If private reporting is unavailable, open a minimal issue asking for a private reporting route; do not include exploit details, credentials, logs, or personal configuration in a public issue.
