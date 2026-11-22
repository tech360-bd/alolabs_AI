#!/usr/bin/env bash
set -euo pipefail
source deploy/scripts/lib/release-pointer.sh
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
mkdir "$t/old" "$t/new"
printf 'old\n' > "$t/old/artifact"; switch_release "$t" "$t/old"
if switch_release "$t" "$t/missing"; then exit 1; fi
[[ $(cat "$t/current/artifact") == old ]]
printf 'new\n' > "$t/new/artifact"; switch_release "$t" "$t/new"; [[ $(cat "$t/current/artifact") == new ]]
switch_release "$t" "$t/old"; [[ $(cat "$t/current/artifact") == old ]]
