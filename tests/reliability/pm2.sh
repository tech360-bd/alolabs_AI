#!/usr/bin/env bash
# Disposable process manager, fake release artifacts, no dotenv or database.
set -euo pipefail
source deploy/scripts/lib/release-pointer.sh
t=$(mktemp -d); export PM2_HOME="$t/pm2"; unset DATABASE_URL NODE_OPTIONS
trap 'pm2 kill >/dev/null 2>&1 || true; rm -rf "$t"' EXIT
# Unique Unix-domain socket, inaccessible outside this private temporary directory.
export FIXTURE_SOCKET="$t/http.sock"
for version in old new bad; do
  mkdir "$t/$version"
  cat >"$t/$version/server.js" <<'JS'
const fs=require('node:fs');const http=require('node:http'); const id=require('node:path').basename(__dirname);
const socket=process.env.FIXTURE_SOCKET;
if(fs.existsSync(socket))fs.unlinkSync(socket);
http.createServer((_,res)=>{res.writeHead(id==='bad'?503:200);res.end(id)}).listen(socket);
JS
  cat >"$t/$version/ecosystem.config.js" <<'JS'
module.exports={apps:[{name:'release-fixture',cwd:__dirname,script:__dirname+'/server.js',exec_mode:'fork',instances:1}]};
JS
done
verify_serving() {
  local expected="${1##*/}" result
  for ((i=0;i<20;i++)); do
    result=$(curl -fsS --max-time 1 --unix-socket "$FIXTURE_SOCKET" http://localhost/ 2>/dev/null) && [[ "$result" == "$expected" ]] && return 0
    sleep .1
  done
  return 1
}
activate_release "$t" "$t/old" release-fixture >/dev/null
# A failed build does not call activation. A process restart must still work.
if (exit 1); then exit 1; fi
pm2 restart release-fixture >/dev/null; verify_serving "$t/old"
activate_release "$t" "$t/new" release-fixture >/dev/null
if activate_release "$t" "$t/bad" release-fixture >/dev/null; then exit 1; fi
activate_release "$t" "$t/new" release-fixture >/dev/null
pm2 restart release-fixture >/dev/null; verify_serving "$t/new"
