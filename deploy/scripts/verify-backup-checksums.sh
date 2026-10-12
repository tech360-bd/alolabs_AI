#!/usr/bin/env bash
# ============================================================
# ALO Labs AgentOS — verify a backup snapshot's checksum manifest
#
# Usage: verify-backup-checksums.sh <snapshot-dir> [sums-file]
#
# Portable replacement for `sha256sum -c` (GNU) / `shasum -a 256 -c`
# (macOS). Exits non-zero when the manifest is missing or when any listed
# file is absent or corrupted, so it can be used as a release gate and from
# the integration test on either platform.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/portable-coreutils.sh
source "${SCRIPT_DIR}/lib/portable-coreutils.sh"

target="${1:-}"
sums="${2:-SHA256SUMS}"

if [[ -z "${target}" ]]; then
  printf '%s\n' "Usage: $(basename "$0") <snapshot-dir> [sums-file]" >&2
  exit 2
fi
if [[ ! -d "${target}" ]]; then
  printf '%s\n' "ERROR: snapshot directory not found: ${target}" >&2
  exit 1
fi
if [[ ! -s "${target}/${sums}" ]]; then
  printf '%s\n' "ERROR: checksum manifest missing or empty: ${target}/${sums}" >&2
  exit 1
fi

alo_sha256_verify "${target}" "${sums}"
