#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Install at the workspace root and provision a local DB separately, see README.
# Sockets are optional: run their workspace `dev` scripts in separate terminals.
exec bun run dev
