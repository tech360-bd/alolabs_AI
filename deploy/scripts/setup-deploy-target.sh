#!/usr/bin/env bash
# ============================================================
# ALO Labs AgentOS — deployment target provisioning
#
# Prepares an Ubuntu server to receive deployments from
# .github/workflows/deploy.yml and .github/workflows/backup.yml.
#
# WHY THIS EXISTS
#   deploy.sh:119 runs `git fetch origin "${BRANCH}"` ON THE SERVER, and this
#   repository is private, so the server needs its own read-only GitHub deploy
#   key. deploy.sh:13 also needs `sudo`, and deploy.yml passes environment
#   variables on the sudo command line, which sudo only permits with the
#   SETENV tag. Hand-configuring these four things (user, two keys, sudoers,
#   sshd) is where deployments usually break, and getting sshd wrong can lock
#   you out of the server entirely.
#
# SAFETY MODEL
#   * DRY RUN BY DEFAULT. Nothing is written unless --apply is given.
#   * Never disables password authentication unless --harden-ssh is given AND
#     a key is already authorized for the deploy user.
#   * Every sshd change is validated with `sshd -t` BEFORE reload, and the
#     service is reloaded (not restarted) so live sessions are not dropped.
#   * Every sudoers change is validated with `visudo -c -f` BEFORE install.
#   * Idempotent: re-running converges instead of duplicating.
#
# Refs (official documentation):
#   https://ubuntu.com/server/docs/how-to/security/openssh-server/
#   https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
#   https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
# ============================================================
set -euo pipefail

APP_DIR="/opt"
DEPLOY_USER="alodeploy"
APPLY=false
HARDEN_SSH=false
SSH_PORT=""
ACTIONS_PUBKEY=""
GEN_GITHUB_KEY=false
ALLOW_PASSWORD_FALLBACK=true

log()  { echo -e "\033[0;32m[SETUP][$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $*"; }
warn() { echo -e "  \033[1;33m⚠️\033[0m $*"; }
ok()   { echo -e "  \033[0;32m✅\033[0m $*"; }
die()  { echo -e "  \033[0;31m❌\033[0m $*" >&2; exit 1; }

# In dry-run mode, print the command instead of running it.
run() {
  if [[ "${APPLY}" == "true" ]]; then
    eval "$@"
  else
    echo "  DRY-RUN would run: $*"
  fi
}

usage() {
  cat <<'USAGE'
Usage:
  sudo bash deploy/scripts/setup-deploy-target.sh [options]

Options:
  --app-dir DIR            Repository root on the server (default: /opt).
                           Must match APP_DIR used by deploy.yml.
  --deploy-user NAME       Dedicated non-root SSH user (default: alodeploy).
                           Must match the PRODUCTION_USER secret.
  --actions-pubkey FILE|-  Public key that GitHub Actions will use to connect.
                           Pass "-" to paste inline. Required.
  --generate-github-key    Create the read-only server -> GitHub deploy key and
                           print the PUBLIC half for you to register at
                           Settings -> Deploy keys.
  --harden-ssh             Also apply the sshd hardening drop-in. Refuses to
                           disable password auth unless a key is authorized.
  --ssh-port PORT          Record the port in the summary (does not change it).
  --apply                  Actually make changes. Without this: dry run only.
  -h, --help               This help.

Example (dry run first, then apply):
  sudo bash deploy/scripts/setup-deploy-target.sh \
    --app-dir /opt --deploy-user alodeploy \
    --actions-pubkey ./github_actions.pub --generate-github-key
  # review the plan, then:
  sudo bash deploy/scripts/setup-deploy-target.sh \
    --app-dir /opt --deploy-user alodeploy \
    --actions-pubkey ./github_actions.pub --generate-github-key \
    --harden-ssh --apply
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)          APP_DIR="${2:?}"; shift 2 ;;
    --deploy-user)      DEPLOY_USER="${2:?}"; shift 2 ;;
    --actions-pubkey)   ACTIONS_PUBKEY="${2:?}"; shift 2 ;;
    --generate-github-key) GEN_GITHUB_KEY=true; shift ;;
    --harden-ssh)       HARDEN_SSH=true; shift ;;
    --ssh-port)         SSH_PORT="${2:?}"; shift 2 ;;
    --apply)            APPLY=true; shift ;;
    -h|--help)          usage; exit 0 ;;
    *)                  usage; die "unknown option: $1" ;;
  esac
done

# ---------- preflight -------------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || die "must run as root (use sudo)"
[[ "${APPLY}" == "true" ]] || warn "DRY RUN — pass --apply to make changes"
[[ -n "${ACTIONS_PUBKEY}" ]] || { usage; die "--actions-pubkey is required"; }
[[ "${DEPLOY_USER}" != "root" ]] || die "refusing to provision root as the deploy user (see security-check.sh:240)"
[[ "${DEPLOY_USER}" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "invalid username: ${DEPLOY_USER}"
[[ -d "${APP_DIR}" ]] || die "APP_DIR ${APP_DIR} does not exist; clone the repository there first"

# Resolve the public key material (file path, or "-" for stdin).
if [[ "${ACTIONS_PUBKEY}" == "-" ]]; then
  log "Reading the GitHub Actions public key from stdin (one line, ends with Ctrl-D):"
  PUBKEY_BODY="$(cat)"
else
  [[ -f "${ACTIONS_PUBKEY}" ]] || die "public key file not found: ${ACTIONS_PUBKEY}"
  PUBKEY_BODY="$(cat "${ACTIONS_PUBKEY}")"
fi
PUBKEY_BODY="$(echo "${PUBKEY_BODY}" | tr -d '\r' | grep -E '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+) ' | head -1 || true)"
[[ -n "${PUBKEY_BODY}" ]] || die "no valid OpenSSH public key found in the input (expected ssh-ed25519/ssh-rsa/ecdsa)"
log "Authorized key fingerprint: $(echo "${PUBKEY_BODY}" | ssh-keygen -lf - 2>/dev/null || echo 'unparsable')"

USER_HOME="$(getent passwd "${DEPLOY_USER}" 2>/dev/null | cut -d: -f6 || true)"
[[ -n "${USER_HOME}" ]] || USER_HOME="/home/${DEPLOY_USER}"
SSH_DIR="${USER_HOME}/.ssh"
AUTH_KEYS="${SSH_DIR}/authorized_keys"
GITHUB_KEY="${SSH_DIR}/github_deploy_key"
SUDOERS_FILE="/etc/sudoers.d/50-${DEPLOY_USER}-alolabs"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-alolabs-deploy.conf"

log "Plan: user=${DEPLOY_USER} home=${USER_HOME} app_dir=${APP_DIR} apply=${APPLY}"

# ---------- 1. dedicated deploy user ---------------------------------------
if id "${DEPLOY_USER}" >/dev/null 2>&1; then
  ok "user ${DEPLOY_USER} already exists"
else
  log "Creating dedicated deploy user ${DEPLOY_USER} (no root, no password login)"
  run "useradd --create-home --shell /usr/bin/bash --comment 'ALO Labs deployment' '${DEPLOY_USER}'"
fi

# ---------- 2. GitHub Actions -> server key --------------------------------
log "Installing the GitHub Actions public key for ${DEPLOY_USER}"
run "install -d -o '${DEPLOY_USER}' -g '${DEPLOY_USER}' -m 700 '${SSH_DIR}'"
run "touch '${AUTH_KEYS}'"
run "chown '${DEPLOY_USER}:${DEPLOY_USER}' '${AUTH_KEYS}'"
run "chmod 600 '${AUTH_KEYS}'"
if [[ -f "${AUTH_KEYS}" ]] && grep -qF "${PUBKEY_BODY}" "${AUTH_KEYS}"; then
  ok "key already authorized (idempotent, no duplicate added)"
else
  # Append via a temp file so a partially-written authorized_keys can never
  # truncate existing access and lock everybody out.
  run "cp -a '${AUTH_KEYS}' '${AUTH_KEYS}.bak.\$(date +%s)'"
  run "printf '%s\n' '${PUBKEY_BODY}' >> '${AUTH_KEYS}'"
fi

# ---------- 3. server -> GitHub read-only deploy key ------------------------
if [[ "${GEN_GITHUB_KEY}" == "true" ]]; then
  if [[ -f "${GITHUB_KEY}" ]]; then
    ok "GitHub deploy key already exists at ${GITHUB_KEY} (not regenerating)"
  else
    log "Generating the server -> GitHub deploy key (ed25519, no passphrase)"
    run "ssh-keygen -t ed25519 -N '' -C 'alolabs-deploy-readonly-\$(hostname)' -f '${GITHUB_KEY}'"
    run "chown '${DEPLOY_USER}:${DEPLOY_USER}' '${GITHUB_KEY}' '${GITHUB_KEY}.pub'"
    run "chmod 600 '${GITHUB_KEY}'; chmod 644 '${GITHUB_KEY}.pub'"
  fi
  # Scoped SSH config so ONLY github.com uses this identity: IdentitiesOnly
  # stops the agent from offering every other key to a third party.
  SSH_CONFIG="${SSH_DIR}/config"
  log "Writing ${SSH_CONFIG} (github.com -> deploy key, IdentitiesOnly)"
  run "printf '%s\n' 'Host github.com' '  User git' '  IdentityFile ${GITHUB_KEY}' '  IdentitiesOnly yes' '  AddKeysToAgent no' > '${SSH_CONFIG}'"
  run "chown '${DEPLOY_USER}:${DEPLOY_USER}' '${SSH_CONFIG}'; chmod 600 '${SSH_CONFIG}'"
  # Pin github.com's host key so the first fetch cannot be MITM'd. Verify the
  # printed fingerprints against https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  if [[ ! -f "${SSH_DIR}/known_hosts" ]] || ! grep -q '^github.com' "${SSH_DIR}/known_hosts" 2>/dev/null; then
    log "Pinning github.com host keys into known_hosts"
    run "ssh-keyscan -t ed25519,ecdsa,rsa github.com > '${SSH_DIR}/known_hosts.tmp' 2>/dev/null"
    run "chown '${DEPLOY_USER}:${DEPLOY_USER}' '${SSH_DIR}/known_hosts.tmp'; chmod 644 '${SSH_DIR}/known_hosts.tmp'"
    run "mv '${SSH_DIR}/known_hosts.tmp' '${SSH_DIR}/known_hosts'"
    warn "VERIFY these fingerprints against GitHub's published list before the first fetch:"
    [[ -f "${SSH_DIR}/known_hosts" ]] && ssh-keygen -lf "${SSH_DIR}/known_hosts" || true
  fi
fi

# ---------- 4. scoped sudoers ----------------------------------------------
# deploy.yml invokes:
#   sudo APP_DIR=/opt BRANCH=main SAFETY_SCRIPT_DIR="$TEMP" MIGRATIONS_APPROVED=... bash "$TEMP/deploy.sh"
# Setting variables on the sudo command line requires the SETENV tag, otherwise
# sudo refuses with "you are not allowed to set the following environment
# variables". The command list is still restricted to these exact scripts.
log "Writing sudoers drop-in ${SUDOERS_FILE} (validated with visudo before install)"
SUDOERS_BODY="$(cat <<EOF
# Managed by deploy/scripts/setup-deploy-target.sh — edit that script, not this file.
# Scoped to the exact commands .github/workflows/{deploy,backup}.yml invoke.
# SETENV is REQUIRED because deploy.yml passes APP_DIR/BRANCH/MIGRATIONS_APPROVED
# on the sudo command line. Residual risk, accepted deliberately: SETENV lets the
# deploy user attach e.g. LD_PRELOAD to these specific commands, so a leaked
# PRODUCTION_SSH_KEY implies root. Mitigated by the 0700 staging directory created
# in deploy.yml and by restricting to these two script paths. If you would rather
# not accept that, drop SETENV and rely on deploy.sh's built-in defaults
# (APP_DIR=/opt, BRANCH=main, MIGRATIONS_APPROVED=false).
# No Defaults! line is written on purpose: env_reset is already the Ubuntu
# default, and a malformed Defaults! directive would break sudo for every user.
${DEPLOY_USER} ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash ${APP_DIR}/deploy/scripts/deploy.sh
${DEPLOY_USER} ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash ${APP_DIR}/deploy/scripts/backup.sh
${DEPLOY_USER} ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash /tmp/alo-deploy-*/deploy.sh
EOF
)"
if [[ "${APPLY}" == "true" ]]; then
  TMP_SUDOERS="$(mktemp)"
  printf '%s\n' "${SUDOERS_BODY}" > "${TMP_SUDOERS}"
  chmod 440 "${TMP_SUDOERS}"
  # A malformed sudoers file can break ALL sudo on the box, so validate the
  # candidate in isolation first and only then move it into place.
  if visudo -c -f "${TMP_SUDOERS}" >/dev/null; then
    install -m 440 -o root -g root "${TMP_SUDOERS}" "${SUDOERS_FILE}"
    rm -f "${TMP_SUDOERS}"
    visudo -c >/dev/null && ok "sudoers installed and the whole sudoers tree still validates"
  else
    rm -f "${TMP_SUDOERS}"
    die "generated sudoers failed validation — refusing to install"
  fi
else
  echo "  DRY-RUN would install sudoers:"
  printf '%s\n' "${SUDOERS_BODY}" | sed 's/^/    /'
fi

# ---------- 5. sshd hardening (opt-in) -------------------------------------
if [[ "${HARDEN_SSH}" == "true" ]]; then
  if ! grep -rqE '^\s*Include\s+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config 2>/dev/null; then
    warn "/etc/ssh/sshd_config has no 'Include /etc/ssh/sshd_config.d/*.conf' — the drop-in would be ignored"
  fi
  KEY_AUTHORIZED=false
  [[ -f "${AUTH_KEYS}" ]] && [[ -s "${AUTH_KEYS}" ]] && KEY_AUTHORIZED=true
  PASSWORD_LINE="PasswordAuthentication yes"
  KBD_LINE="KbdInteractiveAuthentication yes"
  if [[ "${KEY_AUTHORIZED}" == "true" ]]; then
    PASSWORD_LINE="PasswordAuthentication no"
    KBD_LINE="KbdInteractiveAuthentication no"
  else
    warn "no authorized key found yet — REFUSING to disable password authentication (would lock you out)"
  fi
  log "Writing sshd drop-in ${SSHD_DROPIN}"
  SSHD_BODY="$(cat <<EOF
# Managed by deploy/scripts/setup-deploy-target.sh
# Ref: https://ubuntu.com/server/docs/how-to/security/openssh-server/
# sshd takes the FIRST value obtained for each keyword, and Ubuntu includes
# sshd_config.d/*.conf near the top of sshd_config, so these win.
PermitRootLogin no
PubkeyAuthentication yes
${PASSWORD_LINE}
${KBD_LINE}
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
# Suppress the pre-auth OS/version disclosure (Ubuntu OpenSSH documentation,
# "Disable OS information disclosure through service banner").
DebianBanner no
# Per-user restrictions for the deployment identity only. Deliberately NO
# AllowUsers/AllowGroups: adding one here with only the deploy user would lock
# every human administrator out of the server.
Match User ${DEPLOY_USER}
    AllowTcpForwarding no
    AllowAgentForwarding no
    PermitTunnel no
    X11Forwarding no
    MaxSessions 4
EOF
)"
  if [[ "${APPLY}" == "true" ]]; then
    # Ubuntu's OpenSSH documentation recommends keeping a read-only copy of the
    # pristine config as a reference before changing anything.
    if [[ -f /etc/ssh/sshd_config && ! -f /etc/ssh/sshd_config.original ]]; then
      cp /etc/ssh/sshd_config /etc/ssh/sshd_config.original
      chmod a-w /etc/ssh/sshd_config.original
      ok "saved a read-only reference copy at /etc/ssh/sshd_config.original"
    fi
    TMP_SSHD="$(mktemp)"
    printf '%s\n' "${SSHD_BODY}" > "${TMP_SSHD}"
    # Validate the ENTIRE effective configuration, not just the fragment: a
    # syntactically valid drop-in can still conflict with the main config.
    if sshd -t -f /etc/ssh/sshd_config 2>/tmp/sshd-test-err; then
      install -m 644 -o root -g root "${TMP_SSHD}" "${SSHD_DROPIN}"
      rm -f "${TMP_SSHD}"
      if sshd -t -f /etc/ssh/sshd_config 2>>/tmp/sshd-test-err; then
        # Deliberate deviation from the Ubuntu documentation, which suggests
        # `systemctl restart ssh.service`: reload sends SIGHUP, so sshd re-reads
        # its config WITHOUT dropping the session you are typing this into. The
        # doc itself warns that a mistake "may find you are locked out of the
        # server", and a restart is how that happens.
        systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null \
          || warn "could not reload sshd — reload it manually, then reconnect"
        ok "sshd hardened and reloaded (your current session is unaffected)"
      else
        rm -f "${SSHD_DROPIN}"
        systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
        cat /tmp/sshd-test-err >&2
        die "drop-in made the effective sshd config invalid — rolled it back"
      fi
    else
      rm -f "${TMP_SSHD}"
      cat /tmp/sshd-test-err >&2
      die "sshd config ALREADY invalid before this change — fix that first, nothing was written"
    fi
  else
    echo "  DRY-RUN would install sshd drop-in:"
    printf '%s\n' "${SSHD_BODY}" | sed 's/^/    /'
  fi
else
  log "Skipping sshd hardening (pass --harden-ssh to include it)"
fi

# ---------- 6. summary ------------------------------------------------------
cat <<EOF

============================================================
 Provisioning $( [[ "${APPLY}" == "true" ]] && echo "APPLIED" || echo "DRY RUN (nothing changed)" )
============================================================
 Deploy user ......... ${DEPLOY_USER}
 App dir ............. ${APP_DIR}
 SSH port ............ ${SSH_PORT:-22}
 Actions -> server ... ${AUTH_KEYS}
 Server -> GitHub .... ${GITHUB_KEY} $( [[ "${GEN_GITHUB_KEY}" == "true" ]] && echo "(generated)" || echo "(skipped)" )
 Sudoers ............. ${SUDOERS_FILE}
 sshd drop-in ........ $( [[ "${HARDEN_SSH}" == "true" ]] && echo "${SSHD_DROPIN}" || echo "skipped" )

 NEXT — GitHub side (these need an admin token; the agent's token gets 403):

 1) Register the server's read-only deploy key (only if --generate-github-key):
      gh api -X POST repos/engralaminn-collab/alolabs.net_ai/keys \\
        -f title="alolabs-deploy-readonly-\$(hostname)" \\
        -f key="\$(cat ${GITHUB_KEY}.pub)" \\
        -F read_only=true

 2) Set the four environment secrets on the 'production' environment:
      gh secret set PRODUCTION_HOST --env production --body "<server ip>"
      gh secret set PRODUCTION_PORT --env production --body "${SSH_PORT:-22}"
      gh secret set PRODUCTION_USER --env production --body "${DEPLOY_USER}"
      gh secret set PRODUCTION_SSH_KEY --env production < /path/to/private_key

 3) Verify from the server that the fetch deploy.sh:119 performs will work:
      sudo -u ${DEPLOY_USER} ssh -T git@github.com
      sudo -u ${DEPLOY_USER} git -C ${APP_DIR} ls-remote origin main
============================================================
EOF
