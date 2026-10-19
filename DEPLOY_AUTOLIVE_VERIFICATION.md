# Auto-deploy to the Utho server on push to `main` — verification

**Date:** 2026-10-19
**Question checked:** after any change is merged/pushed to `main`, does the project
go live on the Utho server automatically?
**Verdict: NO — the automation is wired correctly, but it has never reached the
server. Every push to `main` so far has been rejected by the deploy workflow's own
credential gate, before any SSH connection was made.**

Nothing on the server was changed by those runs — they fail closed. But no update
pushed to `main` since this pipeline was introduced has been deployed.

---

## 1. The trigger is correct

`.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      migrations_approved: ...
```

Merging a pull request into `main` produces a `push` event, so the workflow does
start. The intended chain is:

| Stage | Job | What it does |
|---|---|---|
| 1 | `quality-and-safety` | advisory gate, `prisma generate`, delegate check, `tsc`, tests, lint, `next build`, standalone-artifact + database-safety scan |
| 2 | `deployment-config` | validates the four `PRODUCTION_*` SSH values **before** contacting the server |
| 3 | `deploy` | uploads reviewed safety scripts, SSHes in, runs `deploy/scripts/deploy.sh` |

`deploy/scripts/deploy.sh` performs the actual "go live": verified backup →
`git fetch origin main` → `git reset --hard` → `bun install` → `prisma generate` →
`next build` → `pm2 reload agentos-app` → port/DB/health assertions, with an
automatic code rollback if the health check fails.

## 2. What actually happened

| Run | Commit title | Result | Failing step |
|---|---|---|---|
| [39249282663](https://github.com/tech360-bd/alolabs_AI/actions/runs/39249282663) | Merge PR #4 (2026-10-19 12:04Z) | failure | `Validate required production SSH secrets` |
| [39247113793](https://github.com/tech360-bd/alolabs_AI/actions/runs/39247113793) | Merge PR #3 | failure | same |
| [39157557003](https://github.com/tech360-bd/alolabs_AI/actions/runs/39157557003) | push to `main` | failure | `Validate required deployment secrets` |
| [39106293624](https://github.com/tech360-bd/alolabs_AI/actions/runs/39106293624) | push to `main` | failure | same |
| [38323910705](https://github.com/tech360-bd/alolabs_AI/actions/runs/38323910705) | push to `main` | failure | dependency advisory gate |

In all five runs the **`Deploy production` job is `skipped`** — GH Actions'
`needs: [quality-and-safety, deployment-config]` means a red gate prevents the
deploy job from starting at all.

The `quality-and-safety` gate itself is green (run 39249282663: all 14 steps
succeeded), so code quality is not the blocker.

### The exact blocker (read from the run annotation, not inferred)

```
Production SSH secrets are missing or malformed
- `PRODUCTION_HOST` is not set (expected: server hostname or IP address, e.g. 203.0.113.10)
```

`PRODUCTION_USER`, `PRODUCTION_SSH_KEY` and `PRODUCTION_PORT` **are** set and are
well formed — the validator reports every problem in one pass and named only
`PRODUCTION_HOST`.

That single missing value is enough to stop the whole pipeline. The `production`
GitHub environment exists and has no protection rules, so it is not blocking
anything either.

## 3. The site is not reachable right now either

Independent of GitHub:

| URL | Response |
|---|---|
| `https://alolabs.net/api/health` | **Cloudflare Tunnel error** — "the host … is configured as a Cloudflare Tunnel, and Cloudflare is currently unable to resolve it" |
| `https://panel.alolabs.net/api/health` | same |
| `https://api.alolabs.net/api/health` | no response |

That page means `cloudflared` has no live connector to the origin. Whatever the
deploy path, the application is **not live at this moment**.

## 4. The server address

The only production host recorded in this repository is:

```
103.239.252.41        (reverse DNS: 103-239-252-41.Dhaka.carnival.com.bd)
```

It appears in `audit/alo-labs/DEPLOYMENT.md` as the A record for `alolabs.net`
and `*.alolabs.net`, and as `SERVER_IP` in `audit/alo-labs/.env.example`. Confirm
this is still the Utho box before using it — it is an older snapshot of the
deployment, not a live inventory.

## 5. Fix (the deploy is blocked until this is done)

Set the one missing secret in the `production` environment, then re-run.

```bash
gh secret set PRODUCTION_HOST --env production --repo tech360-bd/alolabs_AI --body '103.239.252.41'
```

Rules that matter here:

* Bare hostname or IP only — no `https://`, no path, no `user@`, no `:port`.
* No leading space, trailing space or trailing newline (copy/paste carries them).
* The secret must be at the level the job reads. An **environment** secret that
  exists but is empty shadows a populated **repository** secret of the same name,
  so delete any empty `PRODUCTION_HOST` entry rather than adding a second one.
* UI equivalent: Settings → Environments → `production` → Environment secrets.

Then verify without waiting for the next merge:

```bash
gh workflow run 'Production database-safe deployment' --repo tech360-bd/alolabs_AI --ref main
gh run watch --repo tech360-bd/alolabs_AI
```

## 6. What will still be required after the secret is set

The deploy script fails closed, so a failure is safe — but a first-run failure is
likely unless these are also true on the server:

- the checkout exists at `/opt` or `/home/aloedu/alolabs_AI`
  (or repository variable `PRODUCTION_APP_DIR` points at it);
- `.env` / `.env.production` exists there with a working `DATABASE_URL`, is
  **not** tracked by Git, and the running `agentos-app` process uses the same URL;
- passwordless `sudo -n` for the deploy user;
- Bun exactly `1.3.4` at `/usr/local/bin/bun`, plus `pm2`, `sqlite3` (SQLite) or
  `mysql2` reachable (MySQL/MariaDB);
- `agentos-app` is already running under pm2 on port 3011;
- ingress is up: `alolabs.net` is a **Cloudflare Tunnel** hostname, so
  `cloudflared` must be running on the server and pointed at the app port —
  the current tunnel error is an ingress problem the deploy workflow cannot fix.

## 7. Related: scheduled backups are also failing

`Verified production database backup` has failed on 5 consecutive nights
(latest run 39189274242, 2026-10-19 02:00Z, failing in 8 s). Runs taken before
`.github/scripts/validate-production-secrets.sh` was wired into that workflow
report only "Process completed with exit code 1"; the same SSH values are used,
so the missing `PRODUCTION_HOST` is the most likely shared cause. The next
scheduled run will name the cause explicitly.

## 8. Change made in this branch

- `.github/workflows/backup.yml`: removed `script_stop: true`. `appleboy/ssh-action@v1`
  does not accept that input — GitHub emitted
  `Unexpected input(s) 'script_stop'` on every run. Error-stopping is already
  guaranteed by `set -euo pipefail` at the top of the script block and by the
  explicit `if ! …; then exit 1; fi` guards, so behaviour is unchanged.
- This report.

No secret values are stored in this document, and no secret could be read or
written from this session: the GitHub integration returns
`403 Resource not accessible by integration` for the secrets APIs.
