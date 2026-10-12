#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Rollback Script
# Points current symlink to previous release and restarts.
# Usage: sudo bash rollback.sh
# ============================================================
set -Eeuo pipefail

APP_USER="alohub"
INSTALL_DIR="/opt/alolabs/agent-hub"
SERVICE_NAME="alolabs-aismh"

log_info()  { echo "[INFO]  $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_error() { echo "[ERROR] $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_ok()    { echo "[OK]    $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: sudo bash rollback.sh"
  echo "Rolls back to the previous release."
  exit 0
fi

# ─── Find Current Release ──────────────────────────────────
if [[ ! -L "$INSTALL_DIR/current" ]]; then
  log_error "No current symlink found at $INSTALL_DIR/current"
  echo '{"status":"error","message":"No current release"}'
  exit 1
fi

CURRENT_RELEASE=$(readlink -f "$INSTALL_DIR/current")
log_info "Current release: $(basename "$CURRENT_RELEASE")"

# ─── Find Previous Release ─────────────────────────────────
PREVIOUS=$(ls -1d "$INSTALL_DIR/releases/"* 2>/dev/null | sort | tail -n 2 | head -n 1)
if [[ -z "$PREVIOUS" || "$PREVIOUS" == "$CURRENT_RELEASE" ]]; then
  log_error "No previous release available for rollback"
  echo '{"status":"error","message":"No previous release available"}'
  exit 1
fi

log_info "Rolling back to: $(basename "$PREVIOUS")"

# ─── Switch Symlink ───────────────────────────────────────
ln -sfn "$PREVIOUS" "$INSTALL_DIR/current"
log_ok "Symlink switched"

# ─── Restart Service ───────────────────────────────────────
log_info "Restarting $SERVICE_NAME..."
systemctl restart "$SERVICE_NAME"
sleep 5

# ─── Health Check ───────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME"; then
  HEALTH=$(curl -sf --max-time 10 "http://localhost:3011/api/health" 2>/dev/null || echo "")
  if echo "$HEALTH" | grep -q '"status"'; then
    log_ok "Rollback successful — service is healthy"
    echo "{"
    echo "  \"status\": \"rolled_back\","
    echo "  \"from\": \"$(basename "$CURRENT_RELEASE")\","
    echo "  \"to\": \"$(basename "$PREVIOUS")\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    echo "}"
    exit 0
  fi
fi

log_error "Service is unhealthy after rollback"
echo '{"status":"error","message":"Service unhealthy after rollback"}'
exit 1
