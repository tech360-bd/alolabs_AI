#!/usr/bin/env bash
# Independent transport rehearsal. No access to a deployment key or real host.
set -euo pipefail
t=$(mktemp -d "$HOME/.alo-test-XXXXXXXX"); pid=''
trap 'if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || :; wait "$pid" 2>/dev/null || :; fi; rm -rf "$t"' EXIT
for k in host client other; do ssh-keygen -q -t ed25519 -N '' -f "$t/$k"; done
port=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
cat >"$t/config" <<CONFIG
ListenAddress 127.0.0.1
Port $port
HostKey $t/host
PidFile $t/pid
AuthorizedKeysFile $t/client.pub
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes yes
Subsystem sftp internal-sftp
CONFIG
/usr/sbin/sshd -D -f "$t/config" -E "$t/server.log" & pid=$!
for ((i=0;i<40;i++)); do [[ -e "$t/pid" ]] && break; sleep .05; done
opts=(-F /dev/null -i "$t/client" -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile="$t/trust")
for key in unknown other host; do
  : >"$t/trust"
  if [[ "$key" != unknown ]]; then printf '[127.0.0.1]:%s %s\n' "$port" "$(cat "$t/$key.pub")" >"$t/trust"; fi
  for transport in ssh scp; do
    ok=false
    if [[ "$transport" == ssh ]]; then ssh "${opts[@]}" -p "$port" 127.0.0.1 true 2>/dev/null && ok=true
    else scp "${opts[@]}" -P "$port" "$t/client.pub" "127.0.0.1:$t/received" 2>/dev/null && ok=true; fi
    if [[ "$key" == host ]]; then [[ "$ok" == true ]] || { tail -5 "$t/server.log" >&2; exit 1; }; else [[ "$ok" == false && ! -e "$t/received" ]]; fi
  done
done
cmp "$t/client.pub" "$t/received"
