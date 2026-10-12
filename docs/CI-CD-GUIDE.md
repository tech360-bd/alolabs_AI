# ALO Labs AIOS — CI/CD Pipeline Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** DevOps engineers and developers

---

## Table of Contents

1. [GitHub Actions Workflows Overview](#1-github-actions-workflows-overview)
2. [CI Pipeline (Lint, Type-Check, Build)](#2-ci-pipeline)
3. [Docker Build and Push](#3-docker-build-and-push)
4. [Production Deployment Workflow](#4-production-deployment-workflow)
5. [Rollback Procedure](#5-rollback-procedure)
6. [Security Scanning Workflow](#6-security-scanning-workflow)
7. [Automated Backup Workflow](#7-automated-backup-workflow)
8. [Branch Strategy](#8-branch-strategy)
9. [Secret Management](#9-secret-management)
10. [Required GitHub Secrets List](#10-required-github-secrets-list)
11. [Local CI Simulation](#11-local-ci-simulation)

---

## 1. GitHub Actions Workflows Overview

The CI/CD system uses GitHub Actions with the following workflow hierarchy:

```
┌──────────────────────────────────────────────────┐
│                  Push / PR                        │
│            (any branch)                           │
│                    ▼                               │
│           ┌────────────────┐                      │
│           │  CI Pipeline   │                      │
│           │  (required)    │                      │
│           └───────┬────────┘                      │
│                   │                                │
│         ┌─────────┼─────────┐                     │
│         ▼         ▼         ▼                      │
│   ┌──────────┐ ┌──────┐ ┌──────────────┐         │
│   │ Security │ │Docker│ │   Deploy     │         │
│   │  Scan    │ │Build │ │  (main only) │         │
│   └──────────┘ └──────┘ └──────┬───────┘         │
│                               ▼                    │
│                     ┌────────────────┐             │
│                     │ Automated      │             │
│                     │ Backup         │             │
│                     └────────────────┘             │
└──────────────────────────────────────────────────┘
```

### Workflow Files Location

```
.github/
└── workflows/
    ├── ci.yml                 # Lint, type-check, build
    ├── docker.yml             # Docker build and push
    ├── deploy.yml             # Production deployment
    ├── security-scan.yml      # Security scanning
    └── backup.yml             # Pre-deployment backup
```

---

## 2. CI Pipeline (Lint, Type-Check, Build)

### Workflow: `ci.yml`

Triggered on every push and pull request.

```yaml
name: CI

on:
  push:
    branches: [main, develop, 'feature/**']
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.2.5'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run ESLint
        run: bun run lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.2.5'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate Prisma client
        run: bun run db:generate

      - name: Type check
        run: bunx tsc --noEmit

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.2.5'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate Prisma client
        run: bun run db:generate

      - name: Build application
        run: bun run build
        env:
          NODE_ENV: production

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: .next/standalone/
          retention-days: 7
```

### CI Pipeline Steps

| Step | Command | Purpose |
|---|---|---|
| **Install** | `bun install --frozen-lockfile` | Install dependencies |
| **Lint** | `bun run lint` | ESLint code quality |
| **Type Check** | `bunx tsc --noEmit` | TypeScript type validation |
| **Prisma Generate** | `bun run db:generate` | Generate Prisma client |
| **Build** | `bun run build` | Next.js production build |

---

## 3. Docker Build and Push

### Workflow: `docker.yml`

```yaml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  docker:
    name: Build and Push Docker Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64
```

### Docker Image Tags

| Tag | When Created | Example |
|---|---|---|
| `main` | Every push to `main` | `ghcr.io/alolabs/agent-hub:main` |
| `v1.0.0` | Git tag `v1.0.0` | `ghcr.io/alolabs/agent-hub:v1.0.0` |
| `sha-abc1234` | Every push | `ghcr.io/alolabs/agent-hub:sha-abc1234` |

---

## 4. Production Deployment Workflow

### Workflow: `deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  backup:
    name: Pre-Deployment Backup
    runs-on: ubuntu-latest
    steps:
      - name: Create backup on server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh \
              --id "pre-deploy-${GITHUB_SHA::0:8}" --quiet

  deploy:
    name: Deploy Application
    needs: [backup]
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/alolabs/agent-hub
            sudo bash deploy/scripts/deploy.sh --branch main

      - name: Verify deployment
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            sudo bash /opt/alolabs/agent-hub/deploy/scripts/health-check.sh --json
```

### Deployment Process

The `deploy.sh` script (at `deploy/scripts/deploy.sh`) performs:

1. **Pre-flight checks** (root user, directory exists, user exists)
2. **Save current commit** for rollback
3. **Pull latest code** from `origin/main`
4. **Install dependencies** (`bun install --frozen-lockfile`)
5. **Run database migrations** (`bun run db:push`)
6. **Build application** (`NODE_ENV=production bun run build`)
7. **Restart service** with health check (up to 3 retries, 60s timeout)
8. **Record deployment** in `logs/deployments.log`

---

## 5. Rollback Procedure

### Automatic Rollback

If the deployment health check fails after 3 retries, the deploy script exits with an error. The previous commit is saved at `.deploy-previous-commit`.

### Manual Rollback

```bash
# On the production server:
sudo bash /opt/alolabs/agent-hub/deploy/scripts/rollback.sh
```

The rollback script:
1. Reads the previous commit from `.deploy-previous-commit`
2. Resets git to that commit
3. Rebuilds the application
4. Restarts the service
5. Verifies health

### Rollback to Specific Backup

```bash
# If you need to rollback to a specific backup
sudo bash /opt/alolabs/agent-hub/deploy/scripts/restore.sh \
  --backup-id pre-deploy-abc12345
```

### Emergency Rollback (No Script)

```bash
# 1. Find the previous working commit
cd /opt/alolabs/agent-hub
PREVIOUS=$(cat .deploy-previous-commit)

# 2. Reset to it
sudo -u alohub git reset --hard ${PREVIOUS}

# 3. Rebuild
sudo -u alohub NODE_ENV=production bun run build

# 4. Restart
sudo systemctl restart alolabs-agent-hub

# 5. Verify
sleep 5 && curl -sf http://127.0.0.1:3004/api/health
```

---

## 6. Security Scanning Workflow

### Workflow: `security-scan.yml`

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday 6 AM

jobs:
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Audit dependencies
        run: bun pm audit 2>&1 || true

  codeql:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: typescript
      - uses: github/codeql-action/analyze@v3

  trivy-scan:
    name: Trivy Container Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
```

---

## 7. Automated Backup Workflow

### Workflow: `backup.yml`

```yaml
name: Automated Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:      # Manual trigger

jobs:
  backup:
    name: Create Backup
    runs-on: ubuntu-latest
    steps:
      - name: Create backup on server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh \
              --id "ci-$(date +%Y%m%d_%H%M%S)" --quiet

      - name: Verify backup
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            LATEST=$(ls -t /opt/alolabs/agent-hub/backups/ | head -1)
            echo "Latest backup: $LATEST"
            cat /opt/alolabs/agent-hub/backups/$LATEST/MANIFEST.json
```

---

## 8. Branch Strategy

```
main (protected)
  │
  ├── develop
  │     ├── feature/auth-redesign
  │     ├── feature/ai-routing-v2
  │     └── bugfix/login-timeout
  │
  ├── hotfix/critical-security-fix
  └── release/v0.3.0
```

| Branch | Purpose | CI | Deploy |
|---|---|---|---|
| `main` | Production-ready code | Full CI + Deploy | Automatic to production |
| `develop` | Integration branch | Full CI | No |
| `feature/**` | Feature development | Lint + TypeCheck | No |
| `hotfix/**` | Critical production fixes | Full CI + Deploy | Automatic to production |
| `release/**` | Release preparation | Full CI | No (merge to main triggers) |

### Branch Protection Rules (main)

- Require PR reviews (1 minimum)
- Require CI to pass
- Require up-to-date branch
- No force pushes
- Require signed commits (optional)

---

## 9. Secret Management

### Principles

1. **Never commit secrets to Git** — use GitHub Secrets
2. **Rotate secrets regularly** — at least quarterly
3. **Use least-privilege** — SSH keys with restricted commands
4. **Audit access** — review who has repository access monthly

### GitHub Secrets vs Environment Variables

| Secret Type | Storage | Access |
|---|---|---|
| **CI/CD Secrets** (SSH keys, tokens) | GitHub Secrets | GitHub Actions only |
| **Application Secrets** (DB passwords, API keys) | Server `.env` | Server only |
| **Monitoring Secrets** | Server `.env` + monitoring stack | Server + Grafana |

---

## 10. Required GitHub Secrets List

| Secret | Required | Description |
|---|---|---|
| `DEPLOY_HOST` | **Yes** | Production server IP or hostname |
| `DEPLOY_USER` | **Yes** | SSH username (e.g., `root` or `alohub`) |
| `DEPLOY_SSH_KEY` | **Yes** | SSH private key for deployment |
| `GITHUB_TOKEN` | Auto | GitHub provides automatically |
| `DOCKER_REGISTRY_USER` | Optional | Container registry username |
| `DOCKER_REGISTRY_TOKEN` | Optional | Container registry token |

### Setting Up SSH Deploy Key

```bash
# 1. Generate a deploy key pair
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy

# 2. Add the public key to the server
ssh-copy-id -i ~/.ssh/github_deploy.pub root@your-server-ip

# 3. Restrict the key to deployment commands only
# On the server, in /root/.ssh/authorized_keys:
command="cd /opt/alolabs/agent-hub && sudo bash deploy/scripts/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA... github-deploy

# 4. Add the private key to GitHub Secrets
# GitHub → Settings → Secrets → Actions → New repository secret
# Name: DEPLOY_SSH_KEY
# Value: (paste the content of ~/.ssh/github_deploy)
```

---

## 11. Local CI Simulation

### Run Full CI Locally

```bash
# 1. Lint
bun run lint

# 2. Type check
bunx tsc --noEmit

# 3. Build
NODE_ENV=production bun run build

# 4. Run tests (if configured)
bunx vitest run
```

### Run CI in Docker (Exact Reproduction)

```bash
# Build and run CI in Docker
docker build -f Dockerfile -t alolabs-ci .
docker run --rm alolabs bun run lint
docker run --rm alolabs bunx tsc --noEmit
```

### Pre-Commit Hook

```bash
# Install husky
bun add -d husky
bunx husky init

# Add pre-commit hook
echo "bun run lint && bunx tsc --noEmit" > .husky/pre-commit
chmod +x .husky/pre-commit
```

### Lint-Staged (Faster Commits)

```bash
bun add -d lint-staged

# Add to package.json:
# "lint-staged": {
#   "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
# }

# Update pre-commit hook:
echo "bunx lint-staged" > .husky/pre-commit
```

---

## CI/CD Checklist

- [ ] GitHub Secrets configured (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`)
- [ ] SSH deploy key generated and added to server
- [ ] Branch protection rules enabled on `main`
- [ ] CI pipeline passes on a test PR
- [ ] Deployment workflow tested on a staging branch
- [ ] Rollback procedure tested
- [ ] Backup workflow verified
- [ ] Security scanning workflow enabled
- [ ] Pre-commit hooks installed for developers