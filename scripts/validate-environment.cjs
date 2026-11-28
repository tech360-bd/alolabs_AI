'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const { parseEnvConfig } = require('./parse-env-config.cjs');

const PLACEHOLDER_RE = /^(?:change.?me|replace[-_]|example|ci-only|your[-_])/i;

function isValidPort(raw) {
  if (raw === undefined || raw === '') return true;
  if (!/^\d{1,5}$/.test(String(raw).trim())) return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function validateEnvironment(env, options = {}) {
  const production = Boolean(options.production ?? (env.NODE_ENV === 'production'));
  const bad = [];
  const problem = (key, reason) => bad.push(`${key}: ${reason}`);

  try {
    const url = new URL(env.DATABASE_URL);
    const allowedProtocols = production ? ['mysql:', 'mariadb:'] : ['mysql:', 'mariadb:', 'file:'];
    if (
      !allowedProtocols.includes(url.protocol) ||
      (production && (!url.hostname || url.pathname.length < 2))
    ) {
      problem('DATABASE_URL', 'expected mysql://host/database or mariadb://host/database (file: is local development only)');
    }
    if (production && url.password && /replace[_-]?(?:with|me)|replace_with_db_password/i.test(decodeURIComponent(url.password))) {
      problem('DATABASE_URL', 'replace the example credential');
    }
  } catch {
    problem('DATABASE_URL', 'missing or invalid');
  }

  if (!isValidPort(env.PORT)) {
    problem('PORT', 'must be an integer between 1 and 65535');
  }
  if (!isValidPort(env.APP_PORT)) {
    problem('APP_PORT', 'must be an integer between 1 and 65535');
  }
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== '' && !['true', 'false', '1', '0'].includes(String(env.TRUST_PROXY))) {
    problem('TRUST_PROXY', 'must be one of true, false, 1, or 0');
  }

  if (production) {
    if (env.PRISMA_SQLITE_ADAPTER === '1' || env.PRISMA_SQLITE_ADAPTER === 'true') {
      problem('PRISMA_SQLITE_ADAPTER', 'must not select SQLite in production');
    }

    const requiredSecrets = ['JWT_SECRET', 'APP_SECRET', 'ENCRYPTION_KEY', 'CSRF_SECRET'];
    const seenSecrets = new Map();
    for (const key of requiredSecrets) {
      const value = env[key];
      if (!value || value.length < 32 || PLACEHOLDER_RE.test(value)) {
        problem(key, 'set a unique secret of at least 32 characters');
        continue;
      }
      const prior = seenSecrets.get(value);
      if (prior) {
        problem(key, `must be independent from ${prior} (do not reuse secrets)`);
      } else {
        seenSecrets.set(value, key);
      }
    }

    try {
      const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
      if (appUrl.protocol !== 'https:') throw new Error('https required');
    } catch {
      problem('NEXT_PUBLIC_APP_URL', 'set the public HTTPS origin');
    }

    if (env.ALLOWED_ORIGINS !== undefined && String(env.ALLOWED_ORIGINS).trim() !== '') {
      const origins = String(env.ALLOWED_ORIGINS)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      for (const origin of origins) {
        if (origin === '*') {
          problem('ALLOWED_ORIGINS', 'wildcard "*" is prohibited in production');
          break;
        }
        try {
          const parsed = new URL(origin);
          if (parsed.protocol !== 'https:') {
            problem('ALLOWED_ORIGINS', 'all production origins must use https://');
            break;
          }
        } catch {
          problem('ALLOWED_ORIGINS', 'contains an invalid origin URL format');
          break;
        }
      }
    }
  }

  return { ok: bad.length === 0, problems: bad, production };
}

if (require.main === module) {
  const selected = process.env.ENV_FILE || ['.env.production', '.env.config', '.env'].find(fs.existsSync);
  const env = { ...(selected ? parseEnvConfig(fs.readFileSync(selected, 'utf8')) : {}), ...process.env };
  const production = env.NODE_ENV === 'production' || process.argv.includes('--production');
  const result = validateEnvironment(env, { production });
  for (const message of result.problems) console.error(message);
  if (!result.ok) process.exitCode = 1;
  else {
    console.log(
      `Environment syntax and ${result.production ? 'production' : 'development'} requirements passed (values withheld; connectivity not tested).`,
    );
  }
}

module.exports = { validateEnvironment };
