#!/usr/bin/env bash
set -euo pipefail
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
APPROVED_SHA=$(printf '%040d' 1); export APPROVED_SHA GITHUB_REPOSITORY=fixture/test
cat >"$t/gh" <<'MOCK'
#!/usr/bin/env bash
case "$MODE" in
 missing) echo '{"workflow_runs":[]}';;
 *) printf '{"workflow_runs":[{"head_sha":"%s","head_branch":"main","event":"push","run_number":2,"run_attempt":1,"status":"completed","conclusion":"%s"}]}' "$APPROVED_SHA" "$MODE";;
esac
MOCK
chmod +x "$t/gh"; export PATH="$t:$PATH"
MODE=success bash .github/scripts/require-release-checks.sh
for mode in failure missing; do if MODE=$mode bash .github/scripts/require-release-checks.sh; then exit 1; fi; done
