#!/usr/bin/env bash
# Supervise one service per process. No daemonization or swallowed failures.
set -euo pipefail
cd "$(dirname "$0")/next-service-dist"
case "${1:-}" in queue-service|realtime-service) ;; *) echo 'Usage: mini-services-start.sh queue-service|realtime-service' >&2; exit 2;; esac
[[ "${DATABASE_URL:-}" == mysql://* ]] || { echo 'A provisioned MySQL/MariaDB DATABASE_URL is required.' >&2; exit 1; }
export NODE_ENV=production
exec node "mini-services/$1.cjs"
