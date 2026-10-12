#!/usr/bin/env bash
# ============================================================
# Name:        install.sh
# Description: Full Ubuntu 22.04 server installation for ALO Labs Agent Hub.
#              Installs all required dependencies: Bun, Node.js 22, PM2,
#              Docker, Caddy, and configures the firewall.
# Usage:       sudo bash scripts/install.sh
#              (must be run as root or with sudo)
# ============================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

# ── Project directory ───────────────────────────────────────────
# Derive the project root from the script location (scripts/install.sh → ..)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ============================================================
# 1. System Update
# ============================================================
info "Updating system packages..."
apt-get update -y && apt-get upgrade -y \
    || error "Failed to update system packages"
success "System packages updated"

# ============================================================
# 2. Install Basic Tools
# ============================================================
install_basic_tools() {
    info "Installing basic tools (curl, git, sqlite3, unzip)..."
    apt-get install -y curl git sqlite3 unzip \
        || error "Failed to install basic tools"
    success "Basic tools installed"
}

# Check if tools are already installed; skip if present
if command -v curl &>/dev/null && command -v git &>/dev/null \
    && command -v sqlite3 &>/dev/null && command -v unzip &>/dev/null; then
    warn "Basic tools already installed — skipping"
else
    install_basic_tools
fi

# ============================================================
# 3. Install Bun
# ============================================================
install_bun() {
    info "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash \
        || error "Failed to install Bun"
    # Source the shell profile so 'bun' is available in this session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    success "Bun installed: $(bun --version)"
}

if command -v bun &>/dev/null; then
    warn "Bun already installed ($(bun --version)) — skipping"
else
    install_bun
fi

# ============================================================
# 4. Install Node.js 22 via NodeSource
# ============================================================
install_node() {
    info "Installing Node.js 22 via NodeSource..."
    # Install NodeSource setup script dependencies
    apt-get install -y ca-certificates gnupg \
        || error "Failed to install NodeSource prerequisites"

    # Add NodeSource repository for Node.js 22
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
        || error "Failed to add NodeSource GPG key"

    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
        || error "Failed to add NodeSource repository"

    apt-get update -y \
        || error "Failed to update apt after adding NodeSource"

    apt-get install -y nodejs \
        || error "Failed to install Node.js"

    success "Node.js installed: $(node --version)"
}

if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
    if [[ "$NODE_MAJOR" -ge 22 ]]; then
        warn "Node.js $(node --version) already installed — skipping"
    else
        warn "Node.js $(node --version) found but v22+ required — reinstalling"
        install_node
    fi
else
    install_node
fi

# ============================================================
# 5. Install PM2 Globally
# ============================================================
install_pm2() {
    info "Installing PM2 globally..."
    npm install -g pm2 \
        || error "Failed to install PM2"
    success "PM2 installed: $(pm2 --version)"
}

if command -v pm2 &>/dev/null; then
    warn "PM2 already installed ($(pm2 --version)) — skipping"
else
    install_pm2
fi

# ============================================================
# 6. Install Docker
# ============================================================
install_docker() {
    info "Installing Docker..."
    apt-get install -y docker.io docker-compose-plugin \
        || error "Failed to install Docker"
    # Enable Docker service
    systemctl enable docker \
        || error "Failed to enable Docker service"
    systemctl start docker \
        || error "Failed to start Docker service"
    success "Docker installed: $(docker --version)"
}

if command -v docker &>/dev/null; then
    warn "Docker already installed ($(docker --version)) — skipping"
else
    install_docker
fi

# ============================================================
# 7. Install Caddy
# ============================================================
install_caddy() {
    info "Installing Caddy..."
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https \
        || error "Failed to install Caddy prerequisites"

    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
        || error "Failed to add Caddy GPG key"

    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null \
        || error "Failed to add Caddy repository"

    apt-get update -y \
        || error "Failed to update apt after adding Caddy repo"

    apt-get install -y caddy \
        || error "Failed to install Caddy"

    success "Caddy installed: $(caddy version)"
}

if command -v caddy &>/dev/null; then
    warn "Caddy already installed ($(caddy version)) — skipping"
else
    install_caddy
fi

# ============================================================
# 8. Configure Firewall (UFW)
# ============================================================
info "Configuring firewall (UFW)..."
if command -v ufw &>/dev/null; then
    # Allow essential ports: SSH (22), HTTP (80), HTTPS (443)
    ufw allow 22/tcp   || error "Failed to allow port 22"
    ufw allow 80/tcp   || error "Failed to allow port 80"
    ufw allow 443/tcp  || error "Failed to allow port 443"

    # Enable firewall (use --force to avoid interactive prompt)
    echo "y" | ufw enable \
        || error "Failed to enable UFW"
    success "Firewall configured (SSH, HTTP, HTTPS open)"
else
    warn "UFW not found — skipping firewall configuration"
fi

# ============================================================
# 9. Create Project Directories
# ============================================================
info "Creating project directories..."
mkdir -p "${PROJECT_DIR}/storage" \
         "${PROJECT_DIR}/backups" \
         "${PROJECT_DIR}/db" \
         "${PROJECT_DIR}/logs" \
    || error "Failed to create project directories"
success "Project directories created"

# ============================================================
# 10. Verify All Installations
# ============================================================
info "Verifying installations..."
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Installation Summary${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "  Bun:     $(bun --version 2>/dev/null || echo -e "${RED}NOT FOUND${NC}")"
echo -e "  Node.js: $(node --version 2>/dev/null || echo -e "${RED}NOT FOUND${NC}")"
echo -e "  PM2:     $(pm2 --version 2>/dev/null || echo -e "${RED}NOT FOUND${NC}")"
echo -e "  Docker:  $(docker --version 2>/dev/null || echo -e "${RED}NOT FOUND${NC}")"
echo -e "  Caddy:   $(caddy version 2>/dev/null || echo -e "${RED}NOT FOUND${NC}")"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
success "Server installation complete!"
info "Project directory: ${PROJECT_DIR}"
info "Next step: run 'bash scripts/build.sh' to build the application"
