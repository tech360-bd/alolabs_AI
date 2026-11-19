# Linux deployment host. Temporary symlink and current live on the same mount.
switch_release() {
  local dir=$1 target=$2 tmp
  [[ -d "$target" && ( ! -e "$dir/current" || -L "$dir/current" ) ]] || return 1
  tmp=$(mktemp -d "$dir/.switch-XXXXXXXX") || return 1
  ln -s "$target" "$tmp/current" && mv -Tf "$tmp/current" "$dir/current" && rmdir "$tmp"
}
