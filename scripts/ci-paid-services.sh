#!/usr/bin/env bash
#
# Resolve whether CI must SKIP paid / externally-billed steps.
#
# This is the single source of truth for the SKIP_PAID_SERVICES policy. It is
# called from .github/workflows/* and is unit-tested from
# __tests__/unit/ci-paid-services.test.ts, so the shell and TypeScript sides
# cannot drift apart.
#
# POLICY — default deny.
#   Paid steps run ONLY on an explicit opt-in. Unset, empty, "true", typos and
#   anything unrecognised all resolve to SKIP. A fork pull request, where
#   repository secrets are not delivered, therefore skips rather than bills.
#   See: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
#
# INPUTS (environment)
#   CI_RUN_PAID_OVERRIDE   "true" forces paid steps ON. Anything else, including
#                          unset, is "no opinion". Wired from the
#                          `run_paid_services` workflow_dispatch input.
#   SKIP_PAID_SERVICES     Repository Variable or Secret, or a workflow `env:`
#                          default. "false", "0", "no" or "off" turns paid steps
#                          ON; anything else means SKIP.
#
# OUTPUT
#   Prints exactly one word to stdout: "true" (skip paid steps) or "false" (run
#   them). Nothing else is written to stdout so callers can capture it safely.
#
set -euo pipefail

# Lower-case and strip surrounding whitespace/quotes.
normalize() {
  local raw="${1-}"
  raw="${raw#"${raw%%[![:space:]]*}"}"   # trim leading whitespace
  raw="${raw%"${raw##*[![:space:]]}"}"   # trim trailing whitespace
  raw="${raw%\"}"; raw="${raw#\"}"
  raw="${raw%\'}"; raw="${raw#\'}"
  printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]'
}

override="$(normalize "${CI_RUN_PAID_OVERRIDE-}")"
flag="$(normalize "${SKIP_PAID_SERVICES-}")"

# 1. An explicit workflow_dispatch opt-in wins.
if [[ "${override}" == "true" ]]; then
  echo "false"
  exit 0
fi

# 2. An explicit repository-level opt-out of skipping wins.
case "${flag}" in
  false|0|no|off)
    echo "false"
    ;;
  *)
    # 3. Default deny: unset, empty, "true", or unrecognised => SKIP.
    echo "true"
    ;;
esac
