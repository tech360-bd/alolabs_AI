# ALO Labs AI Social Media Hub — Complete Setup & Run Guide

---

## WHAT IS THIS PROJECT?

ALO Labs AISMH is a full AI-powered Marketing Operating System.

| What | Count |
|------|-------|
| API Routes | 206 |
| Dashboard Panels | 82 |
| UI Components | 48 |
| Database Models | 122 |
| AI Providers Supported | 10 |
| Social Platforms | 13 |
| Code Lines | 91,000+ |

**Tech Stack:** Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma + Redis + Socket.IO + Zustand

---

## METHOD 1: LOCAL DEVELOPMENT (Fastest — 2 minutes)

### Step 1: Extract
```bash
unzip aismh-production.zip
cd aismh-production
```

### Step 2: Install
```bash
bun install
```
### Step 3: Configure
```bash
cp .env.example .env
```

Edit `.env` — set ONLY these 3 for local dev:
```env
DATABASE_URL=file:./db/aismh.db
AUTH_SECRET=dev-secret-change-me-32chars-minimum
JWT_SECRET=dev-jwt-secret-change-me-in-prod
```

### Step 4: Database
```bash
mkdir -p db
bun run db:generate
bun run db:push
```

### Step 5: Run
```bash
bun run dev
```
Open **http://localhost:3000** in your browser.

### Default Login
- Email: `admin@alolabs.com`
- Password: `Admin@123`

---

## METHOD 2: PRODUCTION SERVER (Ubuntu 24.04)

### Prerequisites
```bash
# Ubuntu 24.04 LTS server with:
# - 4+ GB RAM, 20+ GB SSD
# - A domain name pointing to your server IP
```

### Step 1: System Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential

# Node.js 22
sudo apt install -y ca-certificates gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpg-key/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update && sudo apt install -y nodejs

# Bun (faster than npm)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PostgreSQL 17
sudo apt install -y postgresql-17 postgresql-client-17
sudo -u postgres createuser aismh_user -P  # set password
sudo -u postgres createdb aismh -O aismh_user

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server && sudo systemctl start redis-server

# Caddy (auto-SSL reverse proxy)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### Step 2: Deploy Project
```bash
sudo mkdir -p /opt/aismh && cd /opt/aismh
# Extract your zip here
unzip aismh-production.zip

# Install dependencies
bun install

# Configure environment
cp .env.example .env
nano .env  # EDIT — see WHERE TO EDIT section below
```

### Step 3: Switch to PostgreSQL

Edit `prisma/schema.prisma`, change line 7:
```prisma
# FROM:
  provider = "sqlite"
# TO:
  provider = "postgresql"
```

Then in `.env` set:
```env
DATABASE_URL=postgresql://aismh_user:YOUR_PASSWORD@localhost:5432/aismh?schema=public
```

### Step 4: Database Setup
```bash
bun run db:generate
bunx prisma migrate dev --name init
# For future updates:
bunx prisma migrate deploy
```

### Step 5: Build & Start
```bash
bun run build
bun run start
```

### Step 6: Caddy (SSL + Reverse Proxy)
```bash
sudo nano /etc/caddy/Caddyfile
```

Paste this (replace `your-domain.com`):
```
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy auto-generates SSL certificate. Your site is live at **https://your-domain.com**

### Step 7: Systemd Service (auto-restart on crash)
```bash
sudo cp deploy/systemd/alolabs-agent-hub.service /etc/systemd/system/
sudo nano /etc/systemd/system/alolabs-agent-hub.service
# Update the WorkingDirectory and ExecStart paths if needed
sudo systemctl daemon-reload
sudo systemctl enable alolabs-agent-hub
sudo systemctl start alolabs-agent-hub

# Check status
sudo systemctl status alolabs-agent-hub
# View logs
journalctl -u alolabs-agent-hub -f
```

---

## METHOD 3: DOCKER (Simplest — 1 command)

```bash
unzip aismh-production.zip
cd aismh-production
cp .env.example .env
nano .env  # Fill in values

docker compose -f docker-compose.prod.yml up -d --build
```

This starts: Next.js app + PostgreSQL + Redis + MinIO + Caddy

Check: `docker compose -f docker-compose.prod.yml logs -f`

---

## WHERE TO EDIT THINGS

### All Secrets & Configuration → `.env`

| What You Want | Which File | Where Exactly |
|---|---|---|
| **Database connection** | `.env` | `DATABASE_URL=` line |
| **Login secrets** | `.env` | `AUTH_SECRET=`, `JWT_SECRET=`, `ENCRYPTION_KEY=` |
| **Redis** | `.env` | `REDIS_URL=` |
| **Email sending** | `.env` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| **AI provider** | `.env` | `AI_PROVIDER=`, `AI_API_KEY=`, `AI_MODEL=` |
| **Social OAuth** | `.env` | `OAUTH_TWITTER_CLIENT_ID=`, etc. |
| **WhatsApp** | `.env` | `WHATSAPP_ENABLED=true`, then fill token fields |
| **SMS** | `.env` | `SMS_TWILIO_ACCOUNT_SID=`, etc. |
| **Payments** | `.env` | `PAYMENT_SECRET_KEY=`, `PAYMENT_PUBLIC_KEY=` |
| **S3/Storage** | `.env` | `S3_ENDPOINT=`, `S3_BUCKET=`, `S3_ACCESS_KEY_ID=` |
| **Feature toggles** | `.env` | `FEATURE_AI_ENABLED=`, `FEATURE_WHATSAPP_ENABLED=`, etc. |

### Database Schema → `prisma/schema.prisma`

Edit models, then run:
```bash
bunx prisma migrate dev --name your-change-name
bunx prisma generate
```

### UI Panels → `src/components/panels/`

82 panel files. Each is a React component. Edit any panel to change its UI.
Example: Edit `src/components/panels/settings-panel.tsx` to change the settings page.

### API Routes → `src/app/api/`

206 route files. Each folder has a `route.ts`.
Example: Edit `src/app/api/auth/login/route.ts` to change login logic.

### AI Providers → `src/lib/ai-router/`

| File | What It Does |
|------|--------------|
| `router.ts` | Main router — picks provider, failover logic |
| `openrouter-provider.ts` | OpenRouter integration |
| `ollama-provider.ts` | Local Ollama integration |
| `deepseek-provider.ts` | DeepSeek API |
| `qwen-provider.ts` | Qwen API |
| `mistral-provider.ts` | Mistral API |
| `types.ts` | Shared types |

### Social Platforms → `src/lib/social/`

| File | Platform |
|------|----------|
| `facebook.ts` | Facebook |
| `instagram.ts` | Instagram |
| `twitter.ts` | Twitter/X |
| `linkedin.ts` | LinkedIn |
| `youtube.ts` | YouTube |
| `tiktok.ts` | TikTok |
| `pinterest.ts` | Pinterest |
| `telegram.ts` | Telegram |
| `threads.ts` | Threads |
| `discord.ts` | Discord |
| `google-business.ts` | Google Business Profile |

### Styling → `src/app/globals.css`

Global CSS is in one file. Tailwind classes handle the rest in components.

### App Entry → `src/app/page.tsx`

The main SPA page. All 82 panels render here based on `currentView` state.

### State Management → `src/store/app.ts`

Zustand store. Controls which panel is visible, user state, notifications, etc.

### Auth Logic → `src/lib/auth.ts`

JWT creation, password verification, session handling.

### Middleware → `src/middleware.ts`

Route protection. Controls who can access what.

---

## HOW TO CONNECT SOCIAL PLATFORMS

For each social platform:

1. Go to the platform's Developer Portal (e.g., developers.facebook.com)
2. Create an App
3. Set **OAuth Callback URL** to: `https://your-domain.com/api/social/oauth/PLATFORM/callback`
   - Replace `PLATFORM` with: `facebook`, `twitter`, `linkedin`, `instagram`, `youtube`, `tiktok`, `pinterest`, `telegram`, `threads`, `discord`, `google-business`
4. Copy the **Client ID** and **Client Secret**
5. Paste into `.env`:
   ```env
   OAUTH_TWITTER_CLIENT_ID=your_id_here
   OAUTH_TWITTER_CLIENT_SECRET=your_secret_here
   ```
6. In the AISMH dashboard, go to **Settings** → **Social Accounts** → **Connect**

### WhatsApp Setup
1. Create a Meta Business Account
2. Add WhatsApp to your Meta app
3. Set Webhook URL: `https://your-domain.com/api/whatsapp/webhook`
4. Set `.env`: `WHATSAPP_ENABLED=true` + all WHATSAPP_* fields

---

## HOW TO USE AI

### Option A: OpenRouter (Recommended — no self-hosting)
1. Sign up at https://openrouter.ai
2. Get API key
3. In `.env`:
   ```env
   AI_PROVIDER=openrouter
   AI_API_KEY=sk-or-v1-your-key
   AI_MODEL=anthropic/claude-3.5-sonnet
   ```

### Option B: Ollama (Free, Local, Private)
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3
```
```env
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=llama3
```

### Option C: Any Other Provider
Set `AI_PROVIDER=` to: `deepseek`, `qwen`, `mistral`, `gemma`, `phi`, `llama`, or `zai`
Then set the corresponding API key env var.

---

## MINI SERVICES (Realtime + Queue)

These are separate services for WebSocket and background jobs.

### Start Realtime Service (Socket.IO on port 3003)
```bash
cd mini-services/realtime-service
bun install
bun run dev   # development
```

### Start Queue Service (port 3004)
```bash
cd mini-services/queue-service
bun install
bun run dev   # development
```

### Production (use systemd or pm2)
```bash
pm2 start mini-services/realtime-service/index.ts --name realtime
pm2 start mini-services/queue-service/index.ts --name queue
```

---

## MONITORING (Optional)

```bash
cd monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

- **Grafana**: http://your-server:3001 (admin/admin)
- **Prometheus**: http://your-server:9090

Pre-built dashboards for: API performance, AI usage, system resources, social media, queue status.

---

## SEEDING DATA

```bash
bunx tsx scripts/seed-agenthub.ts
bunx tsx scripts/seed-crm.ts
bunx tsx scripts/seed-enterprise.ts
bunx tsx scripts/seed-v3.ts
```

---

## ALL COMMANDS REFERENCE

| Task | Command |
|------|--------|
| Install dependencies | `bun install` |
| Start dev server | `bun run dev` |
| Build for production | `bun run build` |
| Start production | `bun run start` |
| Generate Prisma client | `bun run db:generate` |
| Push DB schema (dev) | `bun run db:push` |
| Run migrations (prod) | `bunx prisma migrate deploy` |
| Open DB GUI | `bunx prisma studio` |
| Lint code | `bun run lint` |
| Run tests | `bun run test` |
| Health check | `curl http://127.0.0.1:3000/api/health` |
| Create backup | `curl -X POST http://127.0.0.1:3000/api/backups/create -H "Authorization: Bearer TOKEN"` |
| Docker deploy | `docker compose -f docker-compose.prod.yml up -d --build` |

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| `Prisma Client not generated` | Run `bun run db:generate` |
| `Database connection failed` | Check `DATABASE_URL` in `.env`, ensure DB is running |
| `AUTH_SECRET not set` | Add `AUTH_SECRET=...` to `.env` (min 32 chars) |
| `Port 3000 in use` | `lsof -i :3000` then `kill -9 PID` |
| `Module not found` | `rm -rf node_modules && bun install` |
| `Build error` | `rm -rf .next && bun run build` |
| Redis connection error | `redis-cli ping` — should return `PONG` |
| Social OAuth not working | Check callback URL matches `.env` config |
| WhatsApp not receiving | Check webhook URL is HTTPS, verify token |

---

## SECURITY CHECKLIST (Before Going Live)

- [ ] `.env` file exists with ALL secrets set
- [ ] `.env` is NOT in git
- [ ] `NODE_ENV=production`
- [ ] `AUTH_SECRET` is 48+ random characters
- [ ] `JWT_SECRET` is different from `AUTH_SECRET`
- [ ] Database password is strong
- [ ] App binds to `127.0.0.1` (not `0.0.0.0`)
- [ ] Caddy handles SSL (HTTPS only)
- [ ] Firewall: only ports 80, 443 open
- [ ] `HEALTH_CHECK_TOKEN` and `METRICS_TOKEN` are set
- [ ] Unused OAuth credentials removed from `.env`

---

## PROJECT FILE MAP (What's In The Zip)

```
aismh-production/
├── .env.example              ← COPY TO .env AND EDIT
├── .env                      ← YOUR SECRETS (create from .env.example)
├── SETUP_GUIDE.md           ← THIS FILE
├── package.json              ← Dependencies
├── bun.lock                  ← Lock file
├── next.config.ts            ← Next.js config (standalone)
├── tsconfig.json
├── tailwind.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── components.json           ← shadcn/ui config
├── vitest.config.ts          ← Test config
├── Dockerfile                ← Multi-stage Docker
├── docker-compose.yml        ← Dev Docker
├── docker-compose.prod.yml   ← Production Docker
├── Caddyfile                 ← Reverse proxy
├── .gitignore
├── .dockerignore
│
├── prisma/
│   └── schema.prisma         ← 122 database models
│
├── src/
│   ├── app/
│   │   ├── layout.tsx        ← Root layout
│   │   ├── page.tsx          ← Main SPA (all 82 panels)
│   │   ├── globals.css       ← Global styles
│   │   └── api/              ← 206 API routes
│   │       ├── auth/         ← Login, logout, MFA, OAuth
│   │       ├── social/       ← 13 social platforms
│   │       ├── whatsapp/     ← WhatsApp integration
│   │       ├── email/        ← Email SMTP/IMAP
│   │       ├── sms/          ← SMS campaigns
│   │       ├── seo/          ← SEO management
│   │       ├── crm/          ← Contacts, deals, pipelines
│   │       ├── billing/      ← Subscriptions, invoices
│   │       ├── llm/          ← AI model routing
│   │       ├── rag/          ← RAG engine
│   │       ├── agents/       ← AI agents
│   │       ├── workflows/    ← Workflow automation
│   │       ├── media/        ← Media library
│   │       ├── storage/      ← File uploads
│   │       └── workers/      ← Background jobs
│   ├── components/
│   │   ├── ui/               ← 48 shadcn/ui components
│   │   ├── panels/           ← 82 dashboard panels
│   │   ├── pages/            ← Login page
│   │   └── agent-hub-shell.tsx  ← Main app shell
│   ├── lib/
│   │   ├── ai-router/        ← 10 AI providers
│   │   ├── social/           ← 13 social platform SDKs
│   │   ├── email/            ← SMTP, IMAP, templates
│   │   ├── whatsapp/         ← WhatsApp Business API
│   │   ├── security/         ← Rate limiting, CSRF, sessions
│   │   ├── storage/          ← S3-compatible file storage
│   │   ├── workers/          ← Background job system
│   │   ├── realtime/         ← Socket.IO client/server
│   │   ├── db.ts             ← Prisma database client
│   │   ├── auth.ts           ← Authentication logic
│   │   └── redis.ts          ← Redis client
│   ├── hooks/                ← React hooks
│   ├── store/app.ts          ← Zustand state
│   └── middleware.ts         ← Route protection
│
├── mini-services/
│   ├── realtime-service/     ← Socket.IO (port 3003)
│   └── queue-service/        ← Job queue (port 3004)
│
├── deploy/
│   ├── scripts/              ← Install, deploy, backup, SSL
│   ├── systemd/              ← Service file
│   ├── nginx/                ← NGINX config (alternative)
│   └── docker/               ← MariaDB config
│
├── monitoring/              ← Grafana + Prometheus configs
├── docs/                     ← 13 documentation files
├── scripts/                  ← 11 database seed scripts
├── public/                   ← PWA manifest, icons, service worker
└── .github/workflows/        ← 6 CI/CD pipelines
```

---

**Built by ALO Labs**