#!/usr/bin/env bash
# ============================================================
# ALO Labs AgentOS — apply an Environment Manager configuration
#
# This script is the only thing on the host that turns a configuration version into
# a running environment. It is deliberately dumb and deliberately narrow:
#
#   * It reads ONE file (a JSON payload produced by the control plane), and refuses
#     anything that does not look exactly like that payload.
#   * It writes ONE file, atomically, with mode 0600, and keeps a timestamped copy of
#     the previous one so `--rollback` is possible without the control plane.
#   * It never evaluates the payload as shell, never `source`s it, and never prints a
#     value. The summary lists key names only.
#   * It does not choose what to run: the reload and health commands come from the
#     operator's workflow, not from the payload, so a compromised control plane
#     cannot turn this into a remote shell.
#
# Usage:
#   apply-environment.sh --payload FILE --target FILE [options]
#
#   --payload FILE        JSON: {projectSlug, environment, version, checksum, values}
#   --target FILE         environment file to write (e.g. /opt/app/.env.production)
#   --expect-project SLUG refuse unless the payload is for this project
#   --expect-environment  refuse unless the payload is for this environment
#   --reload-cmd CMD      run after writing (fixed string from the workflow)
#   --health-cmd CMD      run after reload; non-zero exit fails the apply
#   --dry-run             validate and print the plan; write nothing
#   --check               validate the payload and target only
#   --rollback            restore the newest backup of --target and exit
#
# Exit codes: 0 success · 2 usage · 3 payload invalid · 4 precondition failed
#             5 reload failed · 6 health check failed · 7 rollback unavailable
# ============================================================
set +x          # never echo commands: arguments can contain values
set -euo pipefail
umask 077

die() { local code="$1"; shift; printf 'APPLY_ERROR=%s\n' "$*" >&2; exit "$code"; }

payload=""; target=""; expect_project=""; expect_environment=""
reload_cmd=""; health_cmd=""; dry_run=false; check_only=false; rollback=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --payload)            payload="${2:-}"; shift 2 ;;
    --target)             target="${2:-}"; shift 2 ;;
    --expect-project)     expect_project="${2:-}"; shift 2 ;;
    --expect-environment) expect_environment="${2:-}"; shift 2 ;;
    --reload-cmd)         reload_cmd="${2:-}"; shift 2 ;;
    --health-cmd)         health_cmd="${2:-}"; shift 2 ;;
    --dry-run)            dry_run=true; shift ;;
    --check)              check_only=true; shift ;;
    --rollback)           rollback=true; shift ;;
    -h|--help)            sed -n '2,40p' "$0"; exit 0 ;;
    *)                    die 2 "unknown option ${1}" ;;
  esac
done

[[ -n "${target}" ]] || die 2 "--target is required"
target="$(cd -P "$(dirname -- "${target}")" 2>/dev/null && pwd -P)/$(basename -- "${target}")" \
  || die 4 "target directory does not exist"

# ── rollback ────────────────────────────────────────────────────────────────
if [[ "${rollback}" == true ]]; then
  newest="$(ls -1t -- "${target}".bak.* 2>/dev/null | head -n 1 || true)"
  [[ -n "${newest}" ]] || die 7 "no backup of ${target} exists"
  restore="$(mktemp "${target}.restore-XXXXXXXX")"
  trap 'rm -f -- "${restore:-}"' EXIT
  cat -- "${newest}" > "${restore}"
  chmod 600 "${restore}"
  mv -f -- "${restore}" "${target}"
  restore=""
  printf 'APPLY_ROLLED_BACK=%s\n' "${newest}"
  exit 0
fi

[[ -n "${payload}" && -f "${payload}" ]] || die 2 "--payload FILE is required and must exist"

# ── validate the payload (structure only; never evaluate it) ────────────────
command -v node >/dev/null || die 3 "node is required to read the payload safely"

plan="$(node - "${payload}" <<'NODE'
const fs = require('node:fs');
const [file] = process.argv.slice(2);
let payload;
try {
  payload = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`APPLY_ERROR=payload is not valid JSON (${error.message})`);
  process.exit(3);
}
const problems = [];
if (typeof payload.projectSlug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(payload.projectSlug)) problems.push('projectSlug');
if (typeof payload.environment !== 'string' || !['development', 'staging', 'production'].includes(payload.environment)) problems.push('environment');
if (!Number.isInteger(payload.version) || payload.version < 1) problems.push('version');
if (typeof payload.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(payload.checksum)) problems.push('checksum');
if (!payload.values || typeof payload.values !== 'object' || Array.isArray(payload.values)) problems.push('values');
else {
  for (const [key, value] of Object.entries(payload.values)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key)) problems.push(`key:${key}`);
    if (typeof value !== 'string') problems.push(`value:${key}`);
    // A newline in a value would break every dotenv parser downstream.
    if (typeof value === 'string' && /[\r\n]/.test(value)) problems.push(`newline:${key}`);
  }
}
if (problems.length > 0) {
  console.error(`APPLY_ERROR=payload failed validation: ${problems.join(', ')}`);
  process.exit(3);
}
const keys = Object.keys(payload.values).sort();
console.log(JSON.stringify({
  project: payload.projectSlug,
  environment: payload.environment,
  version: payload.version,
  checksum: payload.checksum,
  keys,
  count: keys.length,
  body: keys.map((key) => `${key}=${payload.values[key]}`).join('\n') + '\n',
}));
NODE
)" || exit 3

field() { node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(String(d[process.argv[2]] ?? ""))' "${plan}" "$1"; }

project="$(field project)"; environment="$(field environment)"; version="$(field version)"
checksum="$(field checksum)"; count="$(field count)"

# ── preconditions ───────────────────────────────────────────────────────────
if [[ -n "${expect_project}" && "${project}" != "${expect_project}" ]]; then
  die 4 "payload is for project ${project}, expected ${expect_project}"
fi
if [[ -n "${expect_environment}" && "${environment}" != "${expect_environment}" ]]; then
  die 4 "payload is for environment ${environment}, expected ${expect_environment}"
fi
if ! printf '%s' "${count}" | grep -Eq '^[0-9]+$' || (( count == 0 )); then
  die 3 "payload contains no values"
fi

printf 'APPLY_PLAN project=%s environment=%s version=%s keys=%s count=%s\n' \
  "${project}" "${environment}" "${version}" "$(field keys | tr -d '[]"')" "${count}"

if [[ "${check_only}" == true ]]; then
  printf 'APPLY_VALIDATED=1\n'
  exit 0
fi
if [[ "${dry_run}" == true ]]; then
  printf 'APPLY_DRY_RUN=1\n'
  exit 0
fi

# ── write atomically, keeping the previous file ─────────────────────────────
staged="$(mktemp "${target}.new-XXXXXXXX")"
cleanup() { rm -f -- "${staged:-}" 2>/dev/null || true; }
trap cleanup EXIT

node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(d.body)' "${plan}" > "${staged}"
chmod 600 "${staged}"

# The written file must contain exactly the key count we announced: a partial write
# that still exits 0 is the failure this check exists to prevent.
written="$(grep -c '^[A-Z][A-Z0-9_]*=' "${staged}" || true)"
[[ "${written}" == "${count}" ]] || die 4 "wrote ${written} of ${count} keys"

if [[ -f "${target}" ]]; then
  cp -p -- "${target}" "${target}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
fi
mv -f -- "${staged}" "${target}"
staged=""
printf 'APPLY_WRITTEN=%s mode=600 version=%s checksum=%s\n' "${target}" "${version}" "$(printf '%s' "${checksum}" | cut -c1-12)"

# ── reload and verify ───────────────────────────────────────────────────────
# Reload and health commands run in a subshell so a command that calls `exit` (or
# trips `set -u` on an unset variable) reports a failure here instead of terminating
# this script halfway through an apply.
if [[ -n "${reload_cmd}" ]]; then
  if ! ( eval "${reload_cmd}" ) >/dev/null 2>&1; then
    die 5 "reload command failed: ${reload_cmd}"
  fi
  printf 'APPLY_RELOADED=1\n'
fi

if [[ -n "${health_cmd}" ]]; then
  if ! ( eval "${health_cmd}" ) >/dev/null 2>&1; then
    die 6 "health check failed after applying version ${version}"
  fi
  printf 'APPLY_HEALTHY=1\n'
fi

printf 'APPLY_OK=1 version=%s\n' "${version}"
