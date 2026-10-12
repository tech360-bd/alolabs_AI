#!/usr/bin/env bash
set -Eeuo pipefail
APP_NAME="alolabs-aismh"
APP_USER="alohub"
APP_GROUP="alohub"
INSTALL_DIR="/opt/alolabs/agent-hub"
SOURCE_DIR="${SOURCE_DIR:-/opt/alolabs/source}"
BACKUP_DIR="/var/backups/alolabs"
SERVICE_NAME="alolabs-aismh"
CHECK_MODE=false

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: sudo bash install.sh [--check]"
  exit 0
fi
for arg in "${@:-}"; do
  case "$arg" in --check) CHECK_MODE=true ;; esac
done

log_info()  { echo "[INFO]  $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_error() { echo "[ERROR] $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_ok()    { echo "[OK]    $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
fail() { log_error "$*"; exit 1; }

validate_path() {
  local p="$1" local name="$2"
  [[ -z "$p" ]] && fail "$name is empty"
  [[ "$p" == *..* ]] && fail "$name contains path traversal: $p"
  [[ "$p" != /* ]] && fail "$name must be absolute: $p"
}

log_info "Running pre-flight validation..."
validate_path "$INSTALL_DIR" "INSTALL_DIR"
validate_path "$SOURCE_DIR" "SOURCE_DIR"
validate_path "$BACKUP_DIR" "BACKUP_DIR"
command -v bun >/dev/null 2>&1 || fail "bun is not installed"
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 is not installed"

if [[ "$CHECK_MODE" == "true" ]]; then
  [[ -f "$SOURCE_DIR/package.json" ]] || fail "package.json not found"
  [[ -f "$SOURCE_DIR/bun.lock" ]] || fail "bun.lock not found"
  echo '{"status":"pass","mode":"check"}'
  exit 0
fi

log_info "Creating application user..."
id "$APP_USER" >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin --home "$INSTALL_DIR" --create-home "$APP_USER" || fail "Failed to create user"
log_ok "User ready"

log_info "Creating directories..."
mkdir -p "$INSTALL_DIR/releases" "$INSTALL_DIR/shared/data" "$INSTALL_DIR/shared/uploads" "$INSTALL_DIR/shared/logs" "$BACKUP_DIR"
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
log_ok "Directories created"

log_info "Copying source..."
RELEASE_DIR="$INSTALL_DIR/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$RELEASE_DIR"
cp -r "$SOURCE_DIR/." "$RELEASE_DIR/"
rm -rf "$RELEASE_DIR/node_modules" "$RELEASE_DIR/.next" 2>/dev/null || true
chown -R "$APP_USER:$APP_GROUP" "$RELEASE_DIR"
log_ok "Source copied"

log_info "Installing dependencies..."
cd "$RELEASE_DIR" || fail "Cannot cd"
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun install --frozen-lockfile" "$APP_USER" || fail "Deps failed"
log_ok "Dependencies installed"

log_info "Generating Prisma client..."
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun run db:generate" "$APP_USER" || fail "Prisma failed"
log_ok "Prisma generated"

log_info "Initializing database..."
DB_URL="file:$INSTALL_DIR/shared/data/alolabs.db"
if [[ ! -f "$INSTALL_DIR/shared/data/alolabs.db" ]]; then
  su -s /bin/bash -c "cd '$RELEASE_DIR' && DATABASE_URL='$DB_URL' bun run db:push --skip-generate" "$APP_USER" || fail "DB init failed"
else
  su -s /bin/bash -c "cd '$RELEASE_DIR' && DATABASE_URL='$DB_URL' bun run db:push --skip-generate --accept-data-loss" "$APP_USER" || fail "DB migration failed"
fi
log_ok "Database ready"

log_info "Building application..."
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun run build" "$APP_USER" || fail "Build failed"
log_ok "Build completed"

ln -sfn "$INSTALL_DIR/shared/.env" "$RELEASE_DIR/.env" 2>/dev/null || true
ln -sfn "$INSTALL_DIR/shared/data" "$RELEASE_DIR/db" 2>/dev/null || true
ln -sfn "$INSTALL_DIR/shared/uploads" "$RELEASE_DIR/upload" 2>/dev/null || true
ln -sfn "$RELEASE_DIR/current" "$RELEASE_DIR"
log_ok "Release activated"

if [[ -f "$RELEASE_DIR/scripts/seed.ts" ]]; then
  log_info "Seeding database..."
  su -s /bin/bash -c "cd '$RELEASE_DIR' && DATABASE_URL='$DB_URL' bun run db:seed" "$APP_USER" || log_error "Seed failed"
fi

if [[ -f "$RELEASE_DIR/server-config/$SERVICE_NAME.service" ]]; then
  log_info "Installing systemd service..."
  cp "$RELEASE_DIR/server-config/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
  chown root:root "/etc/systemd/system/$SERVICE_NAME.service"
  chmod 644 "/etc/systemd/system/$SERVICE_NAME.service"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  log_ok "Service installed"
fi

log_info "Starting service..."
systemctl start "$SERVICE_NAME" || fail "Service start failed"
sleep 3
systemctl is-active --quiet "$SERVICE_NAME" || fail "Service not active"
log_ok "Service running"

HEALTH=$(curl -sf --max-time 10 http://localhost:3011/api/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status"'; then
  log_ok "Health check passed"
else
  log_error "Health check failed"
fi

RELEASE_NAME=$(basename "$RELEASE_DIR")
log_ok "Installation complete"
printf '{"status":"installed","release":"%s","user":"%s","service":"%s"}\n' "$RELEASE_NAME" "$APP_USER" "$SERVICE_NAME"
