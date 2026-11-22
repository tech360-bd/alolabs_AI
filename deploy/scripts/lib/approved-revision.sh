# Run inside the provisioned Git checkout. Do not trust a workflow-supplied URL.
fetch_approved_revision() {
  local sha="$1" git_cmd=${2:-git} origin
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  origin=$("$git_cmd" remote get-url origin) || return 1
  case "${origin%.git}" in
    https://github.com/tech360-bd/alolabs_AI|git@github.com:tech360-bd/alolabs_AI|ssh://git@github.com/tech360-bd/alolabs_AI) ;;
    *) echo 'Unexpected deployment origin' >&2; return 1 ;;
  esac
  "$git_cmd" fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main' || return 1
  "$git_cmd" fetch --no-tags origin "$sha" || return 1
  [[ "$("$git_cmd" rev-parse --verify 'FETCH_HEAD^{commit}')" == "$sha" ]] && "$git_cmd" merge-base --is-ancestor "$sha" refs/remotes/origin/main
}
