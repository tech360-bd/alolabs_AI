#!/usr/bin/env bash
# Validate configuration without executing dotenv text or logging credentials.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/validate-environment.cjs "$@"
