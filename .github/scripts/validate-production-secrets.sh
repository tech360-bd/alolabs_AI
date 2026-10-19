#!/usr/bin/env bash
#
# Validate the GitHub Actions "production bridge" configuration before any job
# tries to reach the server.
#
# The caller passes `secrets.PRODUCTION_HOST`, `secrets.PRODUCTION_USER`,
# `secrets.PRODUCTION_SSH_KEY` and `secrets.PRODUCTION_PORT` in as environment
# variables of the same name.
#
# Design rules:
#   * A value is never printed, echoed, logged or written to `$GITHUB_STEP_SUMMARY`.
#     Only the secret *name* and the reason it is unusable are reported, so this
#     script is safe to run on a public repository.
#   * Every problem is reported in one pass, not one per run. A single red build
#     tells the operator everything that is wrong.
#   * Run details stay readable through the API even when raw job logs are not
#     (this repository has seen `gh run view --log-failed` return EOF), so the
#     findings are emitted as a workflow annotation and into the step summary.
#
# Exit status: 0 when all four values are present and well formed, 1 otherwise.

set -uo pipefail

REPO="${GITHUB_REPOSITORY:-tech360-bd/alolabs_AI}"
ENVIRONMENT_NAME="production"

missing=()   # "NAME<TAB>expected value" entries
invalid=()   # human-readable descriptions of malformed values

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

# Escape a string for a GitHub workflow command message.
annotation_escape() {
  local text="$1"
  text="${text//'%'/'%25'}"
  text="${text//$'\r'/'%0D'}"
  text="${text//$'\n'/'%0A'}"
  printf '%s' "${text}"
}

# True when the value starts or ends with whitespace (spaces, tabs, newlines).
# Both a leading space and a trailing newline survive a copy/paste into the
# GitHub secret form and then silently break the SSH action.
has_edge_whitespace() {
  local value="$1"
  [[ "${value}" =~ ^[[:space:]] ]] || [[ "${value}" =~ [[:space:]]$ ]]
}

expect() {
  # expect NAME VALUE "expected value description"
  [[ -n "$2" ]] && return 0
  missing+=("$1"$'\t'"$3")
  return 0
}

# ---------------------------------------------------------------------------
# presence
# ---------------------------------------------------------------------------

host="${PRODUCTION_HOST-}"
user="${PRODUCTION_USER-}"
key="${PRODUCTION_SSH_KEY-}"
port="${PRODUCTION_PORT-}"

expect PRODUCTION_HOST "${host}" "server hostname or IP address, e.g. 203.0.113.10"
expect PRODUCTION_USER "${user}" "SSH login user on the server, e.g. aloedu"
expect PRODUCTION_SSH_KEY "${key}" "full private key file (OpenSSH or PEM), not a path"
expect PRODUCTION_PORT "${port}" "SSH port as a number, e.g. 22"

# ---------------------------------------------------------------------------
# shape of each provided value
# ---------------------------------------------------------------------------

if [[ -n "${host}" ]]; then
  if has_edge_whitespace "${host}"; then
    invalid+=("PRODUCTION_HOST has leading/trailing whitespace or a trailing newline")
  elif [[ "${host}" =~ ^[^:]+:[0-9]+$ ]]; then
    invalid+=("PRODUCTION_HOST contains a port; put the port in PRODUCTION_PORT instead")
  elif [[ ! "${host}" =~ ^[A-Za-z0-9._:-]+$ ]]; then
    invalid+=("PRODUCTION_HOST must be a bare hostname or IP address (no scheme, path or user@ prefix)")
  fi
fi

if [[ -n "${user}" ]]; then
  if has_edge_whitespace "${user}"; then
    invalid+=("PRODUCTION_USER has leading/trailing whitespace or a trailing newline")
  elif [[ ! "${user}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    invalid+=("PRODUCTION_USER contains characters that are not valid in a login name (no user@host)")
  fi
fi

if [[ -n "${port}" ]]; then
  if has_edge_whitespace "${port}"; then
    invalid+=("PRODUCTION_PORT has leading/trailing whitespace or a trailing newline")
  elif [[ ! "${port}" =~ ^[0-9]{1,5}$ ]] || (( 10#${port} < 1 || 10#${port} > 65535 )); then
    invalid+=("PRODUCTION_PORT must be a number between 1 and 65535")
  fi
fi

if [[ -n "${key}" ]]; then
  if [[ "${key}" == *$'\r'* ]]; then
    invalid+=("PRODUCTION_SSH_KEY contains CR characters (Windows/CRLF line endings); save it with LF line endings")
  elif [[ "${key}" != *"PRIVATE KEY"* ]]; then
    invalid+=("PRODUCTION_SSH_KEY does not look like a private key; paste the whole key file, not a path or a fingerprint")
  elif [[ "${key}" != *"-----END"*"PRIVATE KEY-----"* ]]; then
    invalid+=("PRODUCTION_SSH_KEY is truncated: the BEGIN header is present but the END footer is not")
  fi
fi

# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------

if (( ${#missing[@]} == 0 && ${#invalid[@]} == 0 )); then
  echo "Production SSH configuration is present and well formed."
  printf '  %-22s set (%s)\n' PRODUCTION_HOST "hostname/IP" \
                                 PRODUCTION_USER "login user" \
                                 PRODUCTION_SSH_KEY "private key" \
                                 PRODUCTION_PORT "port"
  exit 0
fi

problems=()
for entry in "${missing[@]}"; do
  problems+=("- \`${entry%%$'\t'*}\` is not set (expected: ${entry#*$'\t'})")
done
for entry in "${invalid[@]}"; do
  problems+=("- ${entry}")
done

echo "Production deployment configuration is incomplete:"
printf '%s\n' "${problems[@]}"

# --- annotation (survives even when raw job logs are unavailable) -----------
summary_line="$(printf '%s; ' "${problems[@]}")"

# --- step summary ----------------------------------------------------------
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
{
  echo "## Production deployment configuration is incomplete"
  echo
  echo "The \`deploy\` job stopped before contacting the server, so nothing on"
  echo "production was changed by this run."
  echo
  echo "### What is wrong"
  echo
  printf '%s\n' "${problems[@]}"
  echo
  echo "### Where to set it"
  echo
  echo "This repository has a GitHub **environment** named \`${ENVIRONMENT_NAME}\` and the"
  echo "deploy/backup jobs run in it (\`environment: ${ENVIRONMENT_NAME}\`). Values are read"
  echo "from the environment first; repository-level values are used only when the"
  echo "environment does not define the same name, and **an environment secret that"
  echo "exists but is empty shadows a populated repository secret**. Delete the empty"
  echo "entry before adding a repository-level one."
  echo
  echo "Environment secrets (recommended — matches \`environment: ${ENVIRONMENT_NAME}\`):"
  echo
  echo '```bash'
  echo "gh secret set PRODUCTION_HOST  --env ${ENVIRONMENT_NAME} --repo ${REPO} --body '203.0.113.10'"
  echo "gh secret set PRODUCTION_USER  --env ${ENVIRONMENT_NAME} --repo ${REPO} --body 'aloedu'"
  echo "gh secret set PRODUCTION_PORT  --env ${ENVIRONMENT_NAME} --repo ${REPO} --body '22'"
  echo "gh secret set PRODUCTION_SSH_KEY --env ${ENVIRONMENT_NAME} --repo ${REPO} < ~/.ssh/alo_deploy_ed25519"
  echo '```'
  echo
  echo "Or in the UI: **Settings → Environments → ${ENVIRONMENT_NAME} → Environment secrets**."
  echo
  echo "### Requirements for the values"
  echo
  echo "| Secret | Value |"
  echo "| --- | --- |"
  echo "| \`PRODUCTION_HOST\` | Bare hostname or IP of the server. No \`https://\`, no path, no \`user@\`, no \`:port\`. |"
  echo "| \`PRODUCTION_USER\` | Login name only, e.g. \`aloedu\`. |"
  echo "| \`PRODUCTION_SSH_KEY\` | The **entire** private key file, including the \`-----BEGIN\`/\`-----END\` lines, LF line endings, **no passphrase**. |"
  echo "| \`PRODUCTION_PORT\` | SSH port as digits, e.g. \`22\`. |"
  echo
  echo "No value may have a leading space, trailing space or trailing newline; those"
  echo "survive copy/paste and fail opaquely inside the SSH action."
  echo
  echo "### Server side"
  echo
  echo "- The public half of the key must be in \`~/.ssh/authorized_keys\` for"
  echo "  \`\$PRODUCTION_USER\` on the server."
  echo "- \`ssh\` must be reachable from GitHub-hosted runners on \`\$PRODUCTION_PORT\`."
  echo "- The operator account needs passwordless \`sudo -n\` for the deploy script"
  echo "  (\`deploy/scripts/deploy.sh\`) and the backup script."
  echo "- \`PRODUCTION_APP_DIR\` is an optional **repository variable** (not a secret)"
  echo "  pointing at the checkout, e.g. \`/opt\`. It may be left unset; the workflow"
  echo "  then probes \`/opt\` and \`/home/aloedu/alolabs_AI\`."
  echo
  echo "### How to confirm without deploying"
  echo
  echo '```bash'
  echo "gh workflow run 'Production database-safe deployment' --repo ${REPO} --ref main"
  echo "gh run watch --repo ${REPO}"
  echo '```'
  echo
  echo "The configuration job passes first and the deploy job then runs the real"
  echo "safety-gated deployment."
} >> "${GITHUB_STEP_SUMMARY}"
fi

echo "::error title=Production SSH secrets are missing or malformed::$(annotation_escape "${summary_line%; }")"
exit 1
