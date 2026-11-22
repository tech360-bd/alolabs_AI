#!/usr/bin/env bash
# Exercise the real activation/EXIT handler, not the production deploy entrypoint.
set -euo pipefail
source deploy/scripts/lib/release-pointer.sh
STATE=$(mktemp -d); trap 'rm -rf "$STATE"' EXIT
PREVIOUS=$STATE/old; next=$STATE/new; PM2_NAME=simulated; CURRENT_COMMIT=old
mkdir "$PREVIOUS" "$next"; touch "$PREVIOUS/ecosystem.config.js" "$next/ecosystem.config.js"
record(){ echo "$1" >> "$STATE/history"; }
pm2(){
  case $1 in
    describe) [[ -e "$STATE/running" ]] ;;
    delete) rm -f "$STATE/running" ;;
    start) [[ "$fault" != pm2 || "$2" != "$next/ecosystem.config.js" ]] || return 1; dirname "$2" > "$STATE/running" ;;
  esac
}
verify_serving(){ [[ -f "$STATE/running" && $(cat "$STATE/running") == "$1" && ( "$fault" != health || "$1" == "$PREVIOUS" ) ]]; }
for fault in dependency build environment migration pm2 health interrupt; do
  switch_release "$STATE" "$PREVIOUS"; echo "$PREVIOUS" > "$STATE/running"
  set +e
  (
    set -e; activated=false; completed=false
    trap 'finish_release "$?" "$activated" "$completed"' EXIT; trap 'exit 143' TERM
    case "$fault" in dependency|build|environment|migration) exit 1 ;; esac
    touch "$STATE/activation-pending"; activated=true
    activate_release "$STATE" "$next" "$PM2_NAME"
    if [[ "$fault" == interrupt ]]; then kill -TERM "$BASHPID"; fi
    completed=true
  ); rc=$?
  set -e
  [[ "$rc" != 0 && $(readlink "$STATE/current") == "$PREVIOUS" && ! -e "$STATE/activation-pending" ]]; verify_serving "$PREVIOUS"
done
[[ $(grep -c '^rolled_back$' "$STATE/history") == 3 ]]
[[ $(grep -c '^staging_failed$' "$STATE/history") == 4 ]]
# Kernel lock releases automatically on process exit; no stale PID-file deletion.
(exec 9>"$STATE/lock"; flock -n 9; if flock -n "$STATE/lock" true; then exit 1; fi)
flock -n "$STATE/lock" true
