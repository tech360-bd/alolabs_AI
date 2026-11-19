#!/usr/bin/env bash
set -euo pipefail
source deploy/scripts/lib/approved-revision.sh
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
git() { if [[ "$1" == fetch ]]; then [[ ${fail_fetch:-false} != true ]] || return 1; command git fetch --no-tags . '+refs/heads/main:refs/remotes/origin/main'; else command git "$@"; fi; }
cd "$t"; git init -qb main; git config user.name Test; git config user.email test@localhost
git commit -qm first --allow-empty; approved=$(git rev-parse HEAD); git commit -qm second --allow-empty
git remote add origin https://github.com/tech360-bd/alolabs_AI.git
# Use an isolated local transport without modifying the configured remote identity.

fetch_approved_revision "$approved"; fetch_approved_revision "$approved"
for invalid in '' main "$(printf 'f%.0s' {1..40})"; do if fetch_approved_revision "$invalid"; then exit 1; fi; done
if fail_fetch=true fetch_approved_revision "$approved"; then exit 1; fi
# An existing object with no ancestry on main is not an approved target.
orphan=$(git -c user.name=Test -c user.email=test@localhost commit-tree "HEAD^{tree}" -m unrelated)
if fetch_approved_revision "$orphan"; then exit 1; fi
git remote set-url origin https://github.com/example/unexpected; if fetch_approved_revision "$approved"; then exit 1; fi
