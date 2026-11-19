'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const { parseEnvConfig } = require('./parse-env-config.cjs');
const selected = process.env.ENV_FILE || ['.env.production', '.env.config', '.env'].find(fs.existsSync);
const env = { ...(selected ? parseEnvConfig(fs.readFileSync(selected, 'utf8')) : {}), ...process.env };
const production = env.NODE_ENV === 'production' || process.argv.includes('--production');
const bad = [];
function problem(key, reason) { bad.push(`${key}: ${reason}`); }
try {
  const url = new URL(env.DATABASE_URL);
  if (!['mysql:', 'file:'].includes(url.protocol) || (production && (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2))) problem('DATABASE_URL', 'expected mysql://host/database (file: is local development only)');
  if (production && /replace[_-]?(?:with|me)|replace_with_db_password/i.test(decodeURIComponent(url.password))) problem('DATABASE_URL', 'replace the example credential');
} catch { problem('DATABASE_URL', 'missing or invalid'); }
if (production) {
  if (env.PRISMA_SQLITE_ADAPTER === '1') problem('PRISMA_SQLITE_ADAPTER', 'must not select SQLite in production');
  for (const key of ['JWT_SECRET', 'APP_SECRET', 'ENCRYPTION_KEY']) {
    if (!env[key] || env[key].length < 32 || /^(?:change.?me|replace[-_]|example)/i.test(env[key])) problem(key, 'set a unique secret of at least 32 characters');
  }
  try { if (new URL(env.NEXT_PUBLIC_APP_URL).protocol !== 'https:') throw Error(); }
  catch { problem('NEXT_PUBLIC_APP_URL', 'set the public HTTPS origin'); }
}
for (const message of bad) console.error(message);
if (bad.length) process.exitCode = 1;
else console.log(`Environment syntax and ${production ? 'production' : 'development'} requirements passed (values withheld; connectivity not tested).`);
