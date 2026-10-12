#!/usr/bin/env bash
# ============================================================
# Name:        build.sh
# Description: Production build script for ALO Labs Agent Hub.
#              Installs dependencies, generates Prisma client,
#              pushes the database schema, and builds the Next.js
#              standalone output.
# Usage:       bash scripts/build.sh
#              (run from the project root, or the script will
#               cd there automatically)
# ============================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

# ── Project directory ───────────────────────────────────────────
# Derive the project root from the script location (scripts/build.sh → ..)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ============================================================
# 1. Change to Project Directory
# ============================================================
info "Changing to project directory: ${PROJECT_DIR}"
cd "$PROJECT_DIR" || error "Cannot cd to ${PROJECT_DIR}"

# ============================================================
# 2. Install Dependencies
# ============================================================
info "Installing dependencies with Bun..."
if ! bun install; then
    error "Failed to install dependencies with Bun"
fi
success "Dependencies installed"

# ============================================================
# 3. Generate Prisma Client
# ============================================================
info "Generating Prisma client..."
if ! npx prisma generate; then
    error "Failed to generate Prisma client"
fi
success "Prisma client generated"

# ============================================================
# 4. Push Database Schema
# ============================================================
info "Pushing database schema..."
if ! npx prisma db push; then
    error "Failed to push database schema"
fi
success "Database schema pushed"

# ============================================================
# 5. Build Next.js Application
# ============================================================
info "Building Next.js application (production)..."
if ! bun run build; then
    error "Next.js build failed"
fi
success "Next.js build completed"

# ============================================================
# 6. Verify Standalone Output
# ============================================================
info "Verifying standalone output..."
if [[ -d ".next/standalone" ]]; then
    success "Standalone output verified: .next/standalone/"
else
    error "Standalone output not found at .next/standalone/ — build may be misconfigured"
fi

# ============================================================
# 7. Print Build Summary
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Build Successful${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "  Time:     $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo -e "  Project:  ${PROJECT_DIR}"
echo -e "  Output:   .next/standalone/"
STANDALONE_SIZE=$(du -sh .next/standalone 2>/dev/null | cut -f1)
echo -e "  Size:     ${STANDALONE_SIZE}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
success "Next step: run 'bash scripts/deploy.sh' to deploy"
