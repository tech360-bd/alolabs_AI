#!/usr/bin/env bash
# Standalone app only. Run the socket services and reverse proxy under their own supervisor.
set -euo pipefail
cd "$(dirname "$0")/next-service-dist"
[[ "${DATABASE_URL:-}" == mysql://* ]] || { echo 'A provisioned MySQL/MariaDB DATABASE_URL is required.' >&2; exit 1; }
export NODE_ENV=production PORT="${PORT:-3011}" HOSTNAME="${APP_BIND_HOST:-127.0.0.1}"
exec node server.js
