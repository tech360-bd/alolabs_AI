# Production SSH trust

A production-environment administrator must independently identify the host from the provider console or existing trusted console session. Read its negotiated **public** host key fingerprint there (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256` for Ed25519). Confirm the SHA256 string and host inventory with a second administrator through a separate channel. Never enroll from an unauthenticated network scan.

Configure `PRODUCTION_HOST_FINGERPRINT` as a secret on the protected `production` environment. Require reviewers and restrict deployment branches to main. Verify the enrolled key algorithm matches the one negotiated by both pinned actions on a disposable SSH server first. Every transfer and command must reject any different key. Missing trust blocks scheduled backups too: coordinate enrollment before rollout.

Rotation: pause production jobs, independently verify replacement public key, approve and record change, update the server and environment pin during the approved window, test identity before resuming jobs, then retire the old key. For unexpected mismatch, leave jobs blocked, investigate host identity using the provider console and incident process, and do not disable pinning. Never copy private keys into reports.
