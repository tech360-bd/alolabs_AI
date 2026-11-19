#!/usr/bin/env bash
# Read-only gate. Environment approval never substitutes for a verified build.
set -euo pipefail
[[ "${APPROVED_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
for workflow in ci.yml mysql.yml backup-portability.yml security.yml; do
  # Use the most recent completed/in-flight attempt, not any older green retry.
  conclusion=$(gh api --method GET "repos/${GITHUB_REPOSITORY:?}/actions/workflows/$workflow/runs" \
    -f head_sha="$APPROVED_SHA" -f branch=main -f per_page=100 | jq -er --arg sha "$APPROVED_SHA" '
      [.workflow_runs[] | select(.head_sha == $sha and .head_branch == "main" and (.event == "push" or .event == "workflow_dispatch"))]
      | max_by([.run_number,.run_attempt]) | if .status == "completed" then .conclusion else "not completed" end')
  [[ "$conclusion" == success ]] || { echo "Release blocked: $workflow did not pass for the approved SHA" >&2; exit 1; }
done
