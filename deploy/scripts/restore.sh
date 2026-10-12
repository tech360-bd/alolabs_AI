#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "BLOCKED: automated production database restore is disabled." >&2
printf '%s\n' "Recovery must be explicitly reviewed and must never recreate or replace the live database." >&2
exit 1
