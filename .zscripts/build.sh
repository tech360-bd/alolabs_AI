#!/usr/bin/env bash
# Package the verified production standalone tree, never a database or dotenv.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BUILD_ID:?Set BUILD_ID for this packaging run}"
[[ "$BUILD_ID" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'Invalid BUILD_ID' >&2; exit 1; }
out="${TMPDIR:-/tmp}/build_fullstack_${BUILD_ID}"
mkdir -m 700 "$out" # refuse to reuse a dirty directory
bun install --frozen-lockfile
bun run db:generate:mysql
bun run build
cp -R .next/standalone "$out/next-service-dist"
# Next may trace a build-time dotenv into standalone; never distribute it.
find "$out/next-service-dist" -type f \( -name '.env' -o -name '.env.*' -o -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \) -delete
cp .zscripts/{start,mini-services-start}.sh "$out/"
tar -czf "$out.tar.gz" -C "$out" .
printf 'Production package: %s.tar.gz\n' "$out"
