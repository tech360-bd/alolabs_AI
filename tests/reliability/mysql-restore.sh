#!/usr/bin/env bash
# CI only. Create two NEW schemas in the job's ephemeral MySQL container.
set -euo pipefail
set +x
[[ "${GITHUB_ACTIONS:-}" == true && "${MYSQL_DATABASE:-}" == alolabs_test && "${MYSQL_USER:-}" == agentos_ci ]] || exit 2
export MYSQL_PWD=${MYSQL_ROOT_PASSWORD:?missing CI service password}
client=(mysql --protocol=tcp -h 127.0.0.1 -P 3306 -u root)
"${client[@]}" <<'SQL'
CREATE DATABASE alo_backup_ci;
CREATE DATABASE alo_recovery_ci;
CREATE TABLE alo_backup_ci.evidence (id INT PRIMARY KEY);
INSERT INTO alo_backup_ci.evidence VALUES (42);
SQL
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
# The URL is only in the environment of the backup, never in the argv/file.
url=$(node <<'JS'
const mysql=require('mysql2/promise'),{randomBytes}=require('node:crypto');
(async()=>{
  const admin=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.MYSQL_PWD});
  const user='restore@probe', pass=randomBytes(20).toString('hex')+'!$#%&@:/';
  try {
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?",[user,pass]);
    await admin.query("GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES ON alo_backup_ci.* TO ?@'%'",[user]);
    await admin.query("GRANT PROCESS, SHOW_ROUTINE ON *.* TO ?@'%'",[user]);
    process.stdout.write(`mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@127.0.0.1:3306/alo_backup_ci`);
  } finally { await admin.end(); }
})().catch(()=>{console.error('Isolated dump account initialization failed');process.exitCode=1;});
JS
)
touch "$t/.env"
APP_DIR="$t" DATABASE_URL="$url" bash deploy/scripts/backup.sh
snapshots=("$t"/backups/*); [[ ${#snapshots[@]} == 1 ]]
bash deploy/scripts/verify-backup-checksums.sh "${snapshots[0]}"
gzip -cd "${snapshots[0]}/database.sql.gz" | "${client[@]}" alo_recovery_ci
[[ $("${client[@]}" -N -B alo_recovery_ci -e 'SELECT id FROM evidence') == 42 ]]
