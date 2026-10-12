#!/usr/bin/env bash
set -Eeuo pipefail

# ALO Labs AISMH - Pre-Deployment Verification

PROJECT_DIR="${1:-.}"
PASS=0
FAIL=0
WARN=0
RESULTS=""

res() {
  RESULTS="${RESULTS}{\"name\":\"${1}\",\"status\":\"${2}\",\"message\":\"${3}\"},"
  case "$2" in
    pass) PASS=$((PASS+1)) ;;
    fail) FAIL=$((FAIL+1)) ;;
    warn) WARN=$((WARN+1)) ;;
  esac
}

for arg in "$@"; do
  case "${arg}" in
    --help|-h) echo "Usage: bash verify.sh [PROJECT_DIR]"; exit 0 ;;
  esac
done

# Bun
if command -v bun &>/dev/null; then
  res bun_runtime pass "Bun $(bun --version 2>/dev/null || echo unknown)"
else
  res bun_runtime fail "Bun not found"
fi

# package.json
if [[ -f "${PROJECT_DIR}/package.json" ]]; then
  res package_json pass "Found"
else
  res package_json fail "Missing"
fi

# lockfile
if [[ -f "${PROJECT_DIR}/bun.lock" ]]; then
  res lockfile pass "Found"
else
  res lockfile fail "Missing"
fi

# Source dirs
missing=""
for d in src/app src/lib src/components prisma scripts; do
  [[ ! -d "${PROJECT_DIR}/${d}" ]] && missing="${missing} ${d}"
done
if [[ -n "${missing}" ]]; then
  res source_dirs fail "Missing:${missing}"
else
  res source_dirs pass "All present"
fi

# Prisma
if [[ -f "${PROJECT_DIR}/prisma/schema.prisma" ]] && grep -q '^model ' "${PROJECT_DIR}/prisma/schema.prisma"; then
  cnt=$(grep -c '^model ' "${PROJECT_DIR}/prisma/schema.prisma")
  res prisma_schema pass "${cnt} models"
else
  res prisma_schema fail "Invalid or missing"
fi

# tsconfig
if [[ -f "${PROJECT_DIR}/tsconfig.json" ]]; then
  res typescript pass "Found"
else
  res typescript fail "Missing"
fi

# Scripts
serr=0
for s in "${PROJECT_DIR}"/scripts/*.sh; do
  [[ -f "${s}" ]] || continue
  bash -n "${s}" 2>/dev/null || serr=$((serr+1))
done
if [[ "${serr}" -gt 0 ]]; then
  res script_syntax fail "${serr} script(s) failed"
else
  res script_syntax pass "All pass"
fi

# Docs
missing=""
for f in README.md ARCHITECTURE.md .env.example; do
  [[ ! -f "${PROJECT_DIR}/${f}" ]] && missing="${missing} ${f}"
done
if [[ -n "${missing}" ]]; then
  res documentation warn "Missing:${missing}"
else
  res documentation pass "All present"
fi

# Output
RESULTS="${RESULTS%,}"

echo "========================================="
echo "  ALO Labs AISMH - Verify"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================="
echo "${RESULTS}" | tr ',' '
' | sed 's/{/  /'
echo ""
echo "PASS:${PASS} FAIL:${FAIL} WARN:${WARN}"

[[ "${FAIL}" -gt 0 ]] && exit 1
exit 0
