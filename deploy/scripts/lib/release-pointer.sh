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
