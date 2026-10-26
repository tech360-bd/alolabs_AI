#!/usr/bin/env bash
# ALO Labs AgentOS — generate the Prisma client for engine-less (air-gapped) dev.
#
# The Prisma engines CDN (binaries.prisma.sh) is unreachable in some sandboxes,
# so `prisma generate` cannot download the schema-engine/query-engine binaries.
# This script generates a client that runs on the WASM query compiler with the
# better-sqlite3 driver adapter instead:
#
#   1. PRISMA_SCHEMA_ENGINE_BINARY / PRISMA_QUERY_ENGINE_LIBRARY point at local
#      stub files so the CLI's engine download/version check is skipped
#      (generation itself uses the CLI-bundled WASM schema parser).
#   2. The generator block is switched to engineType="client" +
#      previewFeatures=["queryCompiler","driverAdapters"] in a temp schema copy.
#      The repository's prisma/schema.prisma is NOT modified — production keeps
#      the standard library engine.
#
# Runtime: set PRISMA_SQLITE_ADAPTER=1 so src/lib/db.ts attaches the adapter.
# Database: DATABASE_URL=file:./db/custom.db npx tsx scripts/sqlite-push.ts
#
# In production with CDN access, just run: npx prisma generate
set -euo pipefail
cd "$(dirname "$0")/.."

STUB_DIR=".arena-tmp/engines"
mkdir -p "$STUB_DIR"
if [ ! -f "$STUB_DIR/schema-engine" ]; then
  printf '#!/bin/bash\nif [ "$1" = "--version" ]; then echo "schema-engine stub"; exit 0; fi\nexit 0\n' > "$STUB_DIR/schema-engine"
  chmod +x "$STUB_DIR/schema-engine"
fi
if [ ! -f "$STUB_DIR/libquery_engine.so.node" ]; then
  touch "$STUB_DIR/libquery_engine.so.node"
fi

sed 's|  binaryTargets = \["native", "debian-openssl-3.0.x"\]|  binaryTargets = ["native", "debian-openssl-3.0.x"]\n  previewFeatures = ["queryCompiler", "driverAdapters"]\n  engineType   = "client"|' \
  prisma/schema.prisma > .arena-tmp/schema.client.prisma

PRISMA_SCHEMA_ENGINE_BINARY="$PWD/$STUB_DIR/schema-engine" \
PRISMA_QUERY_ENGINE_LIBRARY="$PWD/$STUB_DIR/libquery_engine.so.node" \
  npx prisma generate --schema=.arena-tmp/schema.client.prisma

echo ""
echo "Client generated (engineType=client). Set PRISMA_SQLITE_ADAPTER=1 at runtime."
echo ""
echo "WARNING — this also applies at BUILD time, not just runtime."
echo "  An engineType=\"client\" PrismaClient throws at construction when no driver"
echo "  adapter is supplied:"
echo ""
echo "    PrismaClientInitializationError: Missing configured driver adapter."
echo "    Engine type \`client\` requires an active driver adapter.  (P2038)"
echo ""
echo "  \`next build\` constructs the client while collecting page data, so a build"
echo "  run without PRISMA_SQLITE_ADAPTER=1 fails on the first API route:"
echo ""
echo "    PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run build"
echo ""
echo "  If you only need typecheck/lint (no build), generate against the DEFAULT"
echo "  schema instead — that client needs no adapter:"
echo ""
echo "    PRISMA_SCHEMA_ENGINE_BINARY=\$PWD/.arena-tmp/engines/schema-engine \\"
echo "    PRISMA_QUERY_ENGINE_LIBRARY=\$PWD/.arena-tmp/engines/libquery_engine.so.node \\"
echo "      npx prisma generate --schema=prisma/schema.prisma"
