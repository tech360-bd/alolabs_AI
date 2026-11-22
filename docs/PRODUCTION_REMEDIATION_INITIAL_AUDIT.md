# Read-only baseline audit

Baseline: `19723593b0ea8bfad2707786c79a1d090ca3e366`, clean `arena/304ea66d-alolabs-ai`, `/home/user/alolabs_AI`. Source inspection, not an inspection of the live host.

| Verified behavior and root cause (baseline lines) | Proposed control and verification |
|---|---|
| `deploy/scripts/backup.sh:158–170` sources JSON assignments containing decoded MySQL credentials. Failure before unlink leaves secrets on disk. | Feed a non-shell client options stream over a private pipe; test error redaction, punctuation and argv. |
| `.github/workflows/deploy.yml:249`, `deploy/scripts/deploy.sh:118–120` resolve moving main after approval. Dispatch gate does not constrain ref. | Require main dispatch, full workflow SHA, pinned origin and main ancestry. Simulate advancing main in disposable git. |
| `deploy/scripts/deploy.sh:118–186` resets and builds in the active tree before rollback is armed. `ecosystem.config.js:9,35–44` resolves cwd and server relative to the config. | Isolated releases with shared state and signal-safe activation; rehearse initial cutover, old release restart, reload failure and recovery using disposable PM2. Never roll back SQL automatically. |
| `.github/workflows/deploy.yml:191–229`, `.github/workflows/backup.yml:58–68` omit server fingerprints. | Pin independently verified SHA256 fingerprint on each SSH/SCP action; require protected production environment configuration and test rejection. |
| `deploy/scripts/backup.sh:123–125,208–244` reuses second-resolution directory, writes final manifest after checksum verification, counts nonempty files. | Private unique staging and serialized verified retention. Preserve legacy snapshots, tamper-test and exercise concurrency and restore. Preserve Linux/macOS scripts. |
| `__tests__/e2e/login-flow.test.ts:20–65` exercises no browser or application; MFA condition is false. | Browser with isolated database, real session and TOTP; deny protected access before verification and after logout. Existing runner is Vitest; no root Playwright dependency. |
| `SETUP_GUIDE.md:25–59` uses ZIP, three local variables and no account provisioning; `README.md:25–27` calls offline helper and seed. | One clone-based guide, separate isolated MySQL and SQLite fallback; run from empty database through login. |

Production design: manual Actions approval, transferred safety scripts, sudo, Node standalone on loopback:3011 supervised by PM2, frozen Bun installation, MySQL Prisma schema and verified backup gate. SQLite is for local use. Shared file storage, optional services, current checkout ownership and sudo policy constrain any release cutover. Operator approvals required for host identity enrollment, storage mapping and first release switch. No production commands or configuration changes authorized here.
