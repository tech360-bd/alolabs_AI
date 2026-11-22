# Linux deployment host. Temporary symlink and current live on the same mount.
switch_release() {
  local dir=$1 target=$2 tmp
  [[ -d "$target" && ( ! -e "$dir/current" || -L "$dir/current" ) ]] || return 1
  tmp=$(mktemp -d "$dir/.switch-XXXXXXXX") || return 1
  ln -s "$target" "$tmp/current" && mv -Tf "$tmp/current" "$dir/current" && rmdir "$tmp"
}

# Caller defines verify_serving to bind readiness to the expected process.
activate_release() {
  local state=$1 target=$2 process_name=$3
  [[ -f "$target/ecosystem.config.js" ]] || return 1
  switch_release "$state" "$target" || return 1
  # In fork mode startOrReload retains the previous absolute pm_exec_path.
  # Re-register ONLY this process, from its retained ecosystem definition.
  if pm2 describe "$process_name" >/dev/null 2>&1; then
    pm2 delete "$process_name" >/dev/null || return 1
  fi
  pm2 start "$target/ecosystem.config.js" --only "$process_name" && verify_serving "$target"
}

# EXIT handler shared with the fault-injection rehearsal. The deploy caller sets
# STATE, PREVIOUS, PM2_NAME, commit IDs, activation flags and record().
finish_release() {
  local status=$1 activated=$2 completed=$3
  trap - EXIT INT TERM HUP
  if [[ "$activated" == true && "$completed" != true ]]; then
    if activate_release "$STATE" "$PREVIOUS" "$PM2_NAME"; then
      record rolled_back "$CURRENT_COMMIT"
      rm -f "$STATE/activation-pending"
    else
      record rollback_failed unknown
      echo 'CRITICAL: rollback not verified; operator intervention required' >&2
    fi
    exit 1
  elif [[ "$completed" != true ]]; then record staging_failed "$CURRENT_COMMIT"; fi
  exit "$status"
}
