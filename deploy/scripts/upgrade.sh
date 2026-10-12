#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt}"
exec sudo APP_DIR="${APP_DIR}" BRANCH="${BRANCH:-main}" bash "${APP_DIR}/deploy/scripts/deploy.sh"
