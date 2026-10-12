#!/usr/bin/env bash
set -euo pipefail
cat >&2 <<'MSG'
BLOCKED: automated production provisioning is disabled for this existing live installation.
This script will not provision, replace, initialize, or alter a production database.
Use deploy/scripts/deploy.sh for database-safe application deployments.
MSG
exit 1
