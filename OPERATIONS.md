# Operations Runbook

## Starting the Service

**WHY:** Start the application after installation or server reboot.

**COMMAND:**
```bash
sudo systemctl start alolabs-aismh
```

**EXPECTED RESULT:**
```
● alolabs-aismh.service - ALO Labs AISMH
   Loaded: loaded (/etc/systemd/system/alolabs-aismh.service; enabled)
   Active: active (running) since ...
```

**FAILURE ACTION:** Check logs with `sudo journalctl -u alolabs-aismh -n 50 --no-pager`

---

## Stopping the Service

**WHY:** Stop for maintenance or before rollback.

**COMMAND:**
```bash
sudo systemctl stop alolabs-aismh
```

---

## Checking Health

**WHY:** Verify all subsystems are operational.

**COMMAND:**
```bash
bash scripts/healthcheck.sh --json
```

**EXPECTED RESULT:**
```json
{"status":"healthy","checks":[...],"timestamp":"..."}
```

**FAILURE ACTION:** If status is "critical", check systemd logs and database connectivity.

---

## Creating a Backup

**WHY:** Create a timestamped backup before any risky operation.

**COMMAND:**
```bash
bash scripts/backup.sh
```

**EXPECTED RESULT:** Archive created in `/var/backups/alolabs-aismh/` with `.sha256` checksum.

---

## Restoring from Backup

**WHY:** Recover from data loss or corruption.

**COMMAND:**
```bash
bash scripts/restore.sh /var/backups/alolabs-aismh/alolabs-aismh-YYYYMMDD-HHMMSS.tar.gz
```

**FAILURE ACTION:** Verify the archive checksum. Check database connectivity.

---

## Deploying an Update

**WHY:** Deploy a new release with automatic rollback on failure.

**COMMAND:**
```bash
bash scripts/update.sh /path/to/alolabs-aismh-release.tar.gz
```

**EXPECTED RESULT:** New release extracted, built, migrated, symlinked, and health-verified.

**FAILURE ACTION:** Script auto-rolls back. Manual rollback: `bash scripts/rollback.sh`

---

## Rolling Back

**WHY:** Revert to the previous working release.

**COMMAND:**
```bash
bash scripts/rollback.sh
```

**EXPECTED RESULT:** Previous release restored and service healthy.

---

## Viewing Logs

**WHY:** Debug issues or audit activity.

**COMMAND:**
```bash
# Last 100 lines
sudo journalctl -u alolabs-aismh -n 100 --no-pager

# Follow live
sudo journalctl -u alolabs-aismh -f

# Since specific time
sudo journalctl -u alolabs-aismh --since "2025-07-14 10:00:00" --no-pager
```

---

## Database Migration

**WHY:** Apply schema changes after a code update.

**COMMAND:**
```bash
cd /opt/alolabs-aismh/current && bun run db:migrate
```

**EXPECTED RESULT:** All pending migrations applied. No errors.

**FAILURE ACTION:** Restore database from last backup. Do NOT re-run failed migration without investigation.

---

## Rotating a Secret

**WHY:** Periodic secret rotation for security compliance.

**COMMAND:** (via API)
```bash
curl -X POST http://localhost:3000/api/security/secrets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secretName":"JWT_SECRET","reason":"scheduled_rotation"}'
```

**EXPECTED RESULT:** Secret rotated, previous value stored in SecretRotation table.

---

## Managing Users

**WHY:** Create or modify user accounts.

All user management is done via the UI (User Management panel) or API:
- `GET/POST /api/users` — List or create users
- `PATCH /api/users/<id>` — Update user
- Role changes require super_admin or admin role

---

## Service File Location

- **Systemd:** `/etc/systemd/system/alolabs-aismh.service`
- **Caddy:** `/etc/caddy/sites-available/alolabs-aismh.conf`
- **Sudoers:** `/etc/sudoers.d/alolabs-aismh`
- **Environment:** `/opt/alolabs-aismh/shared/.env`
- **Releases:** `/opt/alolabs-aismh/releases/`
- **Storage:** `/opt/alolabs-aismh/shared/storage/`
- **Backups:** `/var/backups/alolabs-aismh/`
