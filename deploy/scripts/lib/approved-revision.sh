# Run inside the provisioned Git checkout. Do not trust a workflow-supplied URL.
fetch_approved_revision() {
  local sha="$1" origin
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  origin=$(git remote get-url origin) || return 1
  case "${origin%.git}" in
    https://github.com/tech360-bd/alolabs_AI|git@github.com:tech360-bd/alolabs_AI|ssh://git@github.com/tech360-bd/alolabs_AI) ;;
    *) echo 'Unexpected deployment origin' >&2; return 1 ;;
  esac
  git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main' || return 1
  [[ "$(git rev-parse --verify "${sha}^{commit}")" == "$sha" ]] && git merge-base --is-ancestor "$sha" refs/remotes/origin/main
}
