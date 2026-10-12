#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
# Build high-risk tokens at runtime so this guard does not flag its own source.
loss="loss"; reset="reset"; database="DATABASE"; table="TABLE"; schema="SCHEMA"
patterns=(
  "--accept-data-${loss}"
  "migrate ${reset}"
  "db:${reset}"
  "DROP ${database}"
  "DROP ${table}"
  "DROP ${schema}"
  "TRUNCATE ${table}"
  "CREATE ${database}"
)
pattern="$(IFS='|'; echo "${patterns[*]}")"

if grep -RniE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next -- \
  "${pattern}" "${ROOT}/.github" "${ROOT}/deploy" "${ROOT}/scripts" "${ROOT}/package.json" 2>/dev/null; then
  echo "ERROR: Destructive database operation detected." >&2
  exit 1
fi

echo "Database command safety scan passed."
