# From clone to first login

Use a disposable development machine and **an empty database you own**, never a production URL, backup, seed account or `.env`. Requirements: Git, Bash, Node 22.13+ (22.x recommended; package also accepts 24+), npm 10+, Python 3, make and a C++ compiler for native dependencies. This path uses `package-lock.json`; do not alternate npm and Bun installs in one checkout. Deployment separately uses Bun 1.3.4.

```bash
git clone https://github.com/tech360-bd/alolabs_AI.git
cd alolabs_AI
npm ci
umask 077
cp .env.example .env
```

Edit `.env` as data, not a shell script. Generate independent random values for APP_SECRET, JWT_SECRET, STORAGE_SIGNING_SECRET, ENCRYPTION_KEY and CSRF_SECRET (`openssl rand -base64 32`). Leave external services disabled; do not add paid provider credentials for onboarding. Use **one** database path below. Keep its URL and adapter setting consistent between the shell and `.env`.

### Primary: MySQL/MariaDB

**Verification note:** MySQL is the supported production engine, not a promise that this revision can initialize every table on a fresh server. The disposable MySQL 8 full-schema gate failed in [run 44490220529](https://github.com/tech360-bd/alolabs_AI/actions/runs/44490220529). Do not force schema changes past an error. Use the verified SQLite contributor path below while that gate is unresolved.

Ask your local database administrator to provision a dedicated empty **development** database (utf8mb4), and a user permitted to manage its schema. Set `DATABASE_URL` in `.env` to its `mysql://` URL with percent-encoded username/password; leave `PRISMA_SQLITE_ADAPTER` unset. Generate the MySQL client, then create the schema **only in that disposable database**:

```bash
npm run db:generate:mysql
npm run db:push:mysql
```

Schema creation does not create a login. `db:push:mysql` is not the production migration procedure. Changes to an existing database require review, backup and a compatible migration plan. See [production MySQL](PRODUCTION_MYSQL.md) and the `mysql.yml` CI service job for schema/client checks.

### Alternative: local SQLite, including restricted Prisma engine downloads

This is not a production mode. Dependencies must already be installable or cached. Use an absolute URL to avoid working-directory versus Prisma-schema-relative path differences. Put the same URL and `PRISMA_SQLITE_ADAPTER=1` in `.env` for subsequent shells.

```bash
mkdir -p db
export DATABASE_URL="file:$PWD/db/contributor.sqlite" PRISMA_SQLITE_ADAPTER=1
npm run db:generate:client-engine
npm run db:push:sqlite
```

### Provision the first account, then authenticate

Set a fresh email and enter a unique password (at least 12 characters) at the hidden Bash prompt. This trusted local seed also provisions initial workspace records. It does not start the server or reset an existing account's password. `node --env-file` loads the same `.env` for the standalone CLI.

```bash
export SEED_ADMIN_EMAIL='developer@example.test'
read -rs -p 'Local seed password: ' SEED_ADMIN_PASSWORD; echo
export SEED_ADMIN_PASSWORD
node --env-file=.env --import tsx scripts/seed-agentos.ts
unset SEED_ADMIN_PASSWORD
npm run dev
```

Open **http://localhost:3011/login**, authenticate with that email/password and confirm the dashboard persists after reload. A database schema, a seeded user and a logged-in session are three different states.

### Verify separately

- Unit and integration suite: from a clean test checkout with the SQLite client generated, `SKIP_PAID_SERVICES=true npm test`. Browser: no `.env` files in this disposable checkout; `npm ci --prefix tests/browser`, then `(cd tests/browser && npx playwright install --with-deps chromium && npm test)`. The suite creates ephemeral credentials and a database and starts its own loopback server.
- Production build check: in a **separate clean** MySQL development checkout, generate the MySQL client and run `npm run build`. Never set a production connection string to test a build. A SQLite-only build is not production evidence.
- Native compilation fails: check Node version, matching headers, compiler, make and Python. Prisma engine CDN unavailable: use the local SQLite fallback, not a SQLite client against MySQL. Wrong schema or missing tables: verify the selected URL/client pair. Cannot sign in: confirm the seed succeeded in the same DB; do not look for a default password. Port 3011 occupied: stop your own development instance before restarting.
