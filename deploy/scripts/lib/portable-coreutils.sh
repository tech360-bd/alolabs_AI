#!/usr/bin/env bash
# ============================================================
# ALO Labs AgentOS — portable path + checksum helpers
#
# Production hosts run Linux (GNU coreutils); operator laptops and macOS
# runners ship a BSD userland where `realpath -m`, `realpath --relative-to`,
# `readlink -f`, `find -printf`, `stat -c` and `sha256sum` either do not
# exist or mean something else. `realpath -m` is the exact failure that broke
# `deploy/scripts/backup.sh` on macOS ("realpath: illegal option -- m").
#
# Every helper below is implemented with shell built-ins plus tools that
# exist on BOTH platforms, so path canonicalization — and the traversal
# protections built on top of it — behave identically everywhere. The
# semantics are deliberately equivalent to the GNU commands they replace:
#
#   alo_canonical_path PATH [BASE]      ==  realpath -m PATH   (readlink -f)
#   alo_relative_path  BASE TARGET      ==  realpath --relative-to=BASE TARGET
#   alo_sha256         FILE...          ==  sha256sum FILE...
#   alo_sha256_verify  DIR [SUMSFILE]   ==  (cd DIR && sha256sum -c SUMSFILE)
#   alo_file_mtime     PATH             ==  stat -c %Y PATH
#   alo_remove_tree    PATH [CONTAIN]   ==  rm -rf --one-file-system PATH
#
# This file is SOURCED, never executed:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/portable-coreutils.sh"
#   alo_checksum_init
# It assumes the caller already runs under `set -euo pipefail`.
# ============================================================
# shellcheck shell=bash

# Selected SHA-256 implementation (array, e.g. `sha256sum` or `shasum -a 256`).
ALO_SHA256_CMD=()

# Known SHA-256 of the literal string below; used to prove that a detected
# checksum utility actually works before it is trusted with backup data.
ALO_SHA256_PROBE_INPUT='alo-labs-portability-probe'
ALO_SHA256_PROBE_DIGEST='f24431baeb74a8a75703ce387804f60ff3746bf547610acaa92eb911e1761c14'

# ---------------------------------------------------------------------------
# alo_canonical_path PATH [BASE]
#
# Canonicalize PATH the way `realpath -m` / `readlink -f` do, without any
# GNU-only flag:
#   1. Make the path absolute (prefixed with BASE, defaulting to $PWD).
#   2. Resolve symlinks physically (`cd -P` + `pwd -P`) on the longest
#      EXISTING prefix — this is what makes `/tmp` (a symlink to
#      `/private/tmp` on macOS) compare equal to the real directory.
#   3. Collapse `.`, `..` and repeated separators in the remaining lexical
#      tail. A non-existent tail is preserved instead of being an error,
#      because backup/restore must canonicalize configured paths that have
#      not been created yet.
# ---------------------------------------------------------------------------
alo_canonical_path() {
  local input="${1-}"
  local base="${2-${PWD}}"
  local absolute dir part remainder resolved segment parent

  [[ -n "${input}" ]] || input="${base}"
  case "${input}" in
    /*) absolute="${input}" ;;
    *)  absolute="${base}/${input}" ;;
  esac

  # Split into the longest existing prefix (`dir`) and the lexical tail.
  dir="${absolute}"
  remainder=""
  while [[ ! -d "${dir}" && "${dir}" != "/" ]]; do
    part="${dir##*/}"
    parent="${dir%/*}"
    dir="${parent:-/}"
    if [[ -n "${remainder}" ]]; then
      remainder="${part}/${remainder}"
    else
      remainder="${part}"
    fi
  done

  if [[ -d "${dir}" ]]; then
    resolved="$(cd -P -- "${dir}" 2>/dev/null && pwd -P)" || resolved="${dir}"
  else
    resolved="/"
  fi
  [[ -n "${resolved}" ]] || resolved="/"
  [[ "${resolved}" == "/" ]] || resolved="${resolved%/}"

  while [[ -n "${remainder}" ]]; do
    segment="${remainder%%/*}"
    if [[ "${remainder}" == */* ]]; then
      remainder="${remainder#*/}"
    else
      remainder=""
    fi
    case "${segment}" in
      ''|'.') continue ;;
      '..') resolved="${resolved%/*}" ; [[ -n "${resolved}" ]] || resolved="/" ;;
      *)     resolved="${resolved}/${segment}" ;;
    esac
  done

  printf '%s\n' "${resolved:-/}"
}

# ---------------------------------------------------------------------------
# alo_relative_path BASE TARGET
#
# Equivalent of `realpath --relative-to=BASE TARGET`: prints TARGET relative
# to BASE (`.` when identical, `../..`-prefixed when TARGET is outside BASE).
# Both arguments MUST already be canonical absolute paths (run them through
# alo_canonical_path first) — otherwise the comparison is meaningless.
# Used by the backup script to decide whether configured storage lives
# INSIDE the application directory (archived as a sub-path, preserving the
# layout) or OUTSIDE it (archived separately, with an explicit guard so it
# can never point into the backup directory).
# ---------------------------------------------------------------------------
alo_relative_path() {
  local base="${1%/}"
  local target="${2%/}"
  local -a base_parts target_parts
  local -i common=0
  local -i index=0
  local relative=""

  [[ -n "${base}" ]] || base="/"
  [[ -n "${target}" ]] || target="/"
  if [[ "${base}" == "${target}" ]]; then
    printf '.\n'
    return 0
  fi

  IFS='/' read -r -a base_parts <<<"${base#/}"
  IFS='/' read -r -a target_parts <<<"${target#/}"

  while (( common < ${#base_parts[@]} && common < ${#target_parts[@]} )); do
    [[ "${base_parts[common]}" == "${target_parts[common]}" ]] || break
    common=$(( common + 1 ))
  done

  index=$(( common ))
  while (( index < ${#base_parts[@]} )); do
    if [[ -n "${base_parts[index]}" ]]; then
      relative="${relative:+${relative}/}.."
    fi
    index=$(( index + 1 ))
  done
  index=$(( common ))
  while (( index < ${#target_parts[@]} )); do
    if [[ -n "${target_parts[index]}" ]]; then
      relative="${relative:+${relative}/}${target_parts[index]}"
    fi
    index=$(( index + 1 ))
  done

  printf '%s\n' "${relative:-.}"
}

# ---------------------------------------------------------------------------
# SHA-256 — GNU hosts have `sha256sum`, macOS has perl's `shasum -a 256`.
# Candidates are PROBED (not just located) so a stub or broken binary can
# never be trusted with a backup manifest.
# ---------------------------------------------------------------------------
_alo_checksum_probe() {
  local output
  output="$(printf '%s' "${ALO_SHA256_PROBE_INPUT}" | "$@" 2>/dev/null)" || return 1
  output="${output%% *}"
  [[ "${output}" == "${ALO_SHA256_PROBE_DIGEST}" ]] || return 1
  return 0
}

alo_checksum_init() {
  local candidate
  for candidate in "sha256sum" "shasum -a 256"; do
    # shellcheck disable=SC2086
    if command -v ${candidate%% *} >/dev/null 2>&1 && _alo_checksum_probe ${candidate}; then
      # shellcheck disable=SC2206
      ALO_SHA256_CMD=( ${candidate} )
      return 0
    fi
  done
  printf '%s\n' "ERROR: no working SHA-256 utility found (need sha256sum or shasum -a 256)" >&2
  return 1
}

alo_sha256() {
  if (( ${#ALO_SHA256_CMD[@]} == 0 )); then
    alo_checksum_init
  fi
  "${ALO_SHA256_CMD[@]}" "$@"
}

# alo_sha256_verify DIR [SUMSFILE]
alo_sha256_verify() {
  local dir="${1:?snapshot directory is required}"
  local sums="${2:-SHA256SUMS}"
  if (( ${#ALO_SHA256_CMD[@]} == 0 )); then
    alo_checksum_init
  fi
  ( cd "${dir}" && "${ALO_SHA256_CMD[@]}" -c "${sums}" )
}

# ---------------------------------------------------------------------------
# alo_file_mtime PATH
#
# Epoch modification time. GNU: `stat -c %Y`; BSD/macOS: `stat -f %m`.
# ---------------------------------------------------------------------------
alo_file_mtime() {
  local file="${1:?path is required}"
  local stamp
  if stamp="$(stat -c %Y "${file}" 2>/dev/null)" && [[ -n "${stamp}" ]]; then
    printf '%s\n' "${stamp}"
    return 0
  fi
  if stamp="$(stat -f %m "${file}" 2>/dev/null)" && [[ -n "${stamp}" ]]; then
    printf '%s\n' "${stamp}"
    return 0
  fi
  printf '0\n'
}

# ---------------------------------------------------------------------------
# alo_remove_tree PATH [MUST_BE_INSIDE]
#
# Remove a directory tree on either userland. `rm --one-file-system` is
# GNU-only, so the same protection is expressed with `find -xdev`, which
# never descends into another filesystem. When MUST_BE_INSIDE is given the
# target must resolve inside it, so retention pruning can never delete
# anything outside the backup directory.
# ---------------------------------------------------------------------------
alo_remove_tree() {
  local target="${1:?path is required}"
  local must_be_inside="${2-}"

  [[ -n "${target}" && "${target}" != "/" ]] || {
    printf '%s\n' "ERROR: refusing to remove unsafe path '${target}'" >&2
    return 1
  }
  if [[ -n "${must_be_inside}" ]]; then
    case "${target}/" in
      "${must_be_inside}"/*) : ;;
      *)
        printf '%s\n' "ERROR: refusing to remove '${target}' (outside '${must_be_inside}')" >&2
        return 1
        ;;
    esac
  fi
  [[ -e "${target}" ]] || return 0

  find "${target}" -xdev -mindepth 1 -delete 2>/dev/null || true
  rmdir "${target}" 2>/dev/null || true
  if [[ -e "${target}" ]]; then
    printf '%s\n' "WARNING: '${target}' still exists after removal (cross-filesystem content?)" >&2
  fi
  return 0
}
