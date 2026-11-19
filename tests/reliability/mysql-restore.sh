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
url=$(node -e 'process.stdout.write("mysql://root:"+encodeURIComponent(process.env.MYSQL_PWD)+"@127.0.0.1:3306/alo_backup_ci")')
touch "$t/.env"
APP_DIR="$t" DATABASE_URL="$url" bash deploy/scripts/backup.sh
snapshots=("$t"/backups/*); [[ ${#snapshots[@]} == 1 ]]
bash deploy/scripts/verify-backup-checksums.sh "${snapshots[0]}"
gzip -cd "${snapshots[0]}/database.sql.gz" | "${client[@]}" alo_recovery_ci
[[ $("${client[@]}" -N -B alo_recovery_ci -e 'SELECT id FROM evidence') == 42 ]]
