#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "BLOCKED: automatic database-engine migration is disabled in production." >&2
printf '%s\n' "Use a separately reviewed, data-preserving migration plan outside automated deployment." >&2
exit 1
