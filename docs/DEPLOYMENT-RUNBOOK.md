# Deployment & CI Runbook — what only a repository admin can do

Everything in this document requires **admin credentials on GitHub** or **root on
the server**. The engineering agent that prepared this branch cannot do any of it:
its token returns `403 Resource not accessible by integration` on the environments,
secrets and branch-protection endpoints, because those need the *"Administration"
repository permissions (write)* that a fine-grained/app token does not carry
([Create or update an environment](https://docs.github.com/en/rest/deployments/environments#create-or-update-an-environment)).

Verified facts this runbook is based on, all read from the live repository on
2026-10-15:

| Fact | How verified |
|---|---|
| Repository is **private** | `gh repo view --json isPrivate` → `true` |
| Every CI check fails in ~2 s with **zero steps executed** | `gh pr checks 14` |
| Cause is billing, not code | check-run annotation: *"recent account payments have failed or your spending limit needs to be increased"* |
| `production` environment exists but is **unprotected** | `protection_rules: []`, `deployment_branch_policy: null`, `can_admins_bypass: true` |
| `deploy.yml` ran the deploy job on **every push to main** | workflow trigger block |
| Workflows need 4 secrets named `PRODUCTION_*` | grep over `.github/workflows/*.yml` |
| Server must authenticate back to GitHub | `deploy/scripts/deploy.sh:119` → `git fetch origin "${BRANCH}"` |

Set this once, then every command below works as-is:

```bash
cd /path/to/alolabs.net_ai
REPO=engralaminn-collab/alolabs.net_ai
```

---

## Step 1 — Unblock GitHub Actions (blocks *everything* else)

This is the single highest-value action. Until it is done, **no check on any pull
request can run**, so no code claim can be CI-verified and every merge is
unverified. It cannot be done through the API or CLI — it is a billing setting.

1. Open <https://github.com/settings/billing> (personal account) or
   <https://github.com/organizations/engralaminn-collab/settings/billing> (org).
2. Under **Actions**, confirm a valid payment method and raise the spending limit
   above zero. The annotation names both possible causes: a failed payment *or* a
   spending limit that is too low.
3. Re-run the blocked jobs:

```bash
gh run list --repo "$REPO" --limit 5
gh run rerun --repo "$REPO" <RUN_ID> --failed
```

Private repositories consume **paid** Actions minutes; public repositories do not.
Two alternatives if you do not want to pay for minutes:

- **Self-hosted runner** — free for private repositories. See
  <https://docs.github.com/en/actions/hosting-your-own-runners>.
- **Make the repository public** — free minutes, but this publishes the source of
  a paid platform. **Not recommended** here.

> ⚠️ Do **not** enable required status checks (step 6) before this step succeeds,
> or you will lock yourself out of merging entirely.

---

## Step 2 — Put a real approval gate on the `production` environment

Right now `protection_rules` is empty, so nothing separates a merge from a
production deploy.

**Plan caveat (read this first).** Per the official REST documentation:
*"If you are on a GitHub Free, GitHub Pro, or GitHub Team plan, other deployment
protection rules, such as a wait timer or required reviewers, are only available
for public repositories."* This repository is **private**, so required reviewers
may be unavailable unless you are on GitHub Enterprise.

Check what your plan allows:

```bash
gh api "repos/$REPO/environments/production" --jq '{rules:.protection_rules,branch_policy:.deployment_branch_policy}'
```

**If required reviewers are available**, add yourself as reviewer and restrict the
environment to protected branches:

```bash
MY_ID=$(gh api user --jq .id)
gh api -X PUT "repos/$REPO/environments/production" --input - <<JSON
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": $MY_ID }],
  "deployment_branch_policies": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
JSON
```

`prevent_self_review: false` is deliberate: with a single maintainer, `true` would
make every deployment unapprovable.
Ref: <https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments>

**If they are not available on your plan**, the repository already contains a
plan-independent gate: the `deploy` job in `deploy.yml` now carries

```yaml
if: github.event_name == 'workflow_dispatch' && inputs.confirm_production_deploy == true
```

so a push to `main` still runs every quality and safety gate, but deploying
requires a manual dispatch with an explicit confirmation. Deploy with:

```bash
gh workflow run deploy.yml --repo "$REPO" --ref main \
  -f confirm_production_deploy=true \
  -f migrations_approved=false
```

Once you have confirmed required reviewers actually pause the job, you may delete
that `if:` line to restore auto-deploy.

> ⚠️ Adding required reviewers also gates `backup.yml`, which deploys to the same
> `production` environment on a nightly schedule. A scheduled run will sit waiting
> for approval. If you want unattended backups, give `backup.yml` its own
> environment (e.g. `production-backup`) with a branch policy but no reviewers.

---

## Step 3 — Create the four environment secrets

Use **environment** secrets, not repository secrets: they are only exposed to jobs
declaring `environment: production`, so no other workflow can read your production
SSH key.
Ref: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets>

```bash
gh secret set PRODUCTION_HOST --repo "$REPO" --env production --body "<server-ip-or-hostname>"
gh secret set PRODUCTION_PORT --repo "$REPO" --env production --body "22"
gh secret set PRODUCTION_USER --repo "$REPO" --env production --body "alodeploy"
gh secret set PRODUCTION_SSH_KEY --repo "$REPO" --env production < /path/to/github_actions_private_key
```

The names matter. Earlier revisions of `docs/CI-CD-GUIDE.md` documented
`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` — **no workflow reads those**, and
`PRODUCTION_PORT` was not documented at all even though `deploy.yml` hard-fails
without it. `scripts/validate-workflow-security.mjs` now fails CI if a workflow
references a secret the guide does not mention, so this cannot drift back.

---

## Step 4 — Add a read-only deploy key (server → GitHub)

This is a **different credential** from `PRODUCTION_SSH_KEY` and is easy to miss.
`PRODUCTION_SSH_KEY` authenticates GitHub → server. The deploy key authenticates
server → GitHub, and it is required because `deploy.sh:119` runs
`git fetch origin main` **on the server** against a **private** repository.
Without it the fetch fails and the deploy aborts.

Per the official documentation a deploy key "grants access to a single
repository", is "read-only by default", and the private half stays on the server —
exactly the least privilege needed for a fetch.
Ref: <https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys>

Generate it on the server (step 5 does this for you with `--generate-github-key`),
then register the **public** half. Leave *Allow write access* **unchecked**:

```bash
# copy the printed public key from the server first, then:
gh api -X POST "repos/$REPO/keys" \
  -f title="alolabs-deploy-readonly-$(hostname)" \
  -f key="$(cat github_deploy_key.pub)" \
  -F read_only=true
```

Known limitations, from the same page — worth accepting knowingly:

- Deploy keys have **no expiry date**; rotate them on a schedule.
- They are **not tied to a user**: removing the person who created the key does not
  revoke it.
- They are normally **passphrase-less**, so a compromised server exposes them.
- GitHub recommends a **GitHub App** instead where you want fine-grained,
  expiring, auditable access. That is the better long-term answer and a larger
  change; a read-only deploy key is the correct minimal step now.

Verify from the server:

```bash
sudo -u alodeploy ssh -T git@github.com
sudo -u alodeploy git -C /opt ls-remote origin main
```

---

## Step 5 — Provision the server

Run on the Ubuntu server. **Dry run first** — it prints the full plan and changes
nothing:

```bash
cd /opt   # the repository root; must match APP_DIR in deploy.yml
sudo bash deploy/scripts/setup-deploy-target.sh \
  --app-dir /opt --deploy-user alodeploy \
  --actions-pubkey ./github_actions.pub --generate-github-key
```

Then apply, including sshd hardening:

```bash
sudo bash deploy/scripts/setup-deploy-target.sh \
  --app-dir /opt --deploy-user alodeploy \
  --actions-pubkey ./github_actions.pub --generate-github-key \
  --harden-ssh --apply
```

What it does, and the official guidance behind each part
(<https://ubuntu.com/server/docs/how-to/security/openssh-server/>):

| Action | Why |
|---|---|
| Dedicated non-root `alodeploy` user | The guide previously said `root@your-server-ip` and `/root/.ssh/authorized_keys`. This repo's own `deploy/scripts/security-check.sh:240` reports `PermitRootLogin yes` as **critical** — the documented setup contradicted the project's own gate. |
| `.ssh` 0700, `authorized_keys` 0600, key appended via backup-first write | *"only the authenticated user must have write permissions"*; a truncated `authorized_keys` would lock everyone out. |
| sshd drop-in under `/etc/ssh/sshd_config.d/` | *"By default, Ubuntu's configuration includes `Include /etc/ssh/sshd_config.d/*.conf` at the very top … OpenSSH uses the first value set for most directives, so any settings defined in files within `sshd_config.d/` will override those in the main configuration file."* |
| `sudo sshd -t` on the **whole effective config** before applying, rollback on failure | *"check the configuration after changing it and before restarting"*; *"if your only method of access to a server is SSH, and you make a mistake … you may find you are locked out"*. |
| Read-only `/etc/ssh/sshd_config.original` | The doc's own recommendation: `sudo cp … ; sudo chmod a-w …`. |
| `systemctl reload`, not `restart` | Deliberate deviation: reload (SIGHUP) re-reads config without dropping your live session. |
| Refuses to set `PasswordAuthentication no` unless a key is already authorized | Direct lockout prevention. |
| `DebianBanner no` | The doc's "Disable OS information disclosure through service banner". |
| **No `AllowUsers`/`AllowGroups`** | Adding one naming only `alodeploy` would lock every human administrator out. |
| Scoped sudoers, validated with `visudo -c -f` before install | A malformed sudoers file breaks sudo for **all** users. |

### The sudoers `SETENV` trade-off — read before applying

`deploy.yml` invokes `sudo APP_DIR=/opt BRANCH=main … bash "$TEMP_DIR/deploy.sh"`.
Setting variables on the sudo command line **requires the `SETENV` tag**, or sudo
refuses with *"sorry, you are not allowed to set the following environment
variables"*. The generated rule is therefore:

```
alodeploy ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash /opt/deploy/scripts/deploy.sh
alodeploy ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash /opt/deploy/scripts/backup.sh
alodeploy ALL=(ALL) NOPASSWD: SETENV: /usr/bin/bash /tmp/alo-deploy-*/deploy.sh
```

Residual risk, stated plainly: `SETENV` lets the deploy user attach e.g.
`LD_PRELOAD` to those commands, so **a leaked `PRODUCTION_SSH_KEY` implies root**.
It is still far tighter than the `NOPASSWD: ALL` most setups use. To remove it,
drop `SETENV` and rely on `deploy.sh`'s built-in defaults (`APP_DIR=/opt`,
`BRANCH=main`, `MIGRATIONS_APPROVED=false`) — which means giving up per-dispatch
migration approval.

---

## Step 6 — Branch protection on `main` (do this **last**)

Only after step 1 succeeds, otherwise the required checks can never pass and
nothing can ever merge.

```bash
gh api -X PUT "repos/$REPO/branches/main/protection" \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["TypeScript, tests, lint, and build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

The context string must match the job's `name:` in `ci.yml` exactly.
Ref: <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>

---

## Step 7 — Staging (not yet configured)

The `production` environment exists; there is **no `staging` environment** and no
staging workflow. Per the deployment-boundary rules for this project, staging
should be a separate directory, an isolated database, and a distinct internal port
rather than a second process on the production paths.

Creating the environment is safe to do now:

```bash
gh api -X PUT "repos/$REPO/environments/staging" --input - <<'JSON'
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "deployment_branch_policies": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api -X POST "repos/$REPO/environments/staging/deployment-branch-policies" \
  -f name='arena/**'
```

A `deploy-staging.yml` has deliberately **not** been written yet: it needs a
staging host, and an untestable deploy workflow is worse than none. Say the word
with the staging host details and it will follow.

---

## Verification checklist

```bash
# 1. Actions can run at all
gh run list --repo "$REPO" --limit 3

# 2. Environment protection is in place
gh api "repos/$REPO/environments/production" --jq '.protection_rules'

# 3. Secrets exist (names only; values are never readable back)
gh secret list --repo "$REPO" --env production

# 4. Deploy key is read-only
gh api "repos/$REPO/keys" --jq '.[] | {title, read_only, verified, created_at}'

# 5. All three repository guards pass locally
node scripts/validate-compose.mjs && \
node scripts/validate-route-auth.mjs && \
node scripts/validate-workflow-security.mjs
```

---

## Decisions still required (these block milestones, not deployment)

1. **Payment gateway.** Merchant country is Bangladesh; SSLCommerz is the
   candidate, but settlement, recurring billing and compliance cannot be verified
   from this environment. Blocks Milestone D.
2. **Money representation.** Integer minor units or Prisma `Decimal`? Blocks the
   `Float` → safe-money migration (all of `CostEstimate`, `SubscriptionPlan`,
   `Invoice`, `Payment` currently use `Float`).
3. **Proxy topology.** How many trusted hops sit in front of the app, and is
   `CF-Connecting-IP` authoritative? `src/proxy.ts:getClientIp()` currently trusts
   the **leftmost** `X-Forwarded-For`, which is client-supplied. Guessing wrong
   collapses a shared NAT into one bucket and locks everyone out, so this is not
   being guessed at.
4. **Staging host**, if a staging deploy path is wanted.
