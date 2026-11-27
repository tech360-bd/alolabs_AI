#!/usr/bin/env npx tsx
/**
 * verify:environments — the Environment Manager against a real database.
 *
 * Proves the properties that matter and that a mock cannot: a secret is stored
 * sealed, the API-shaped read returns only a mask, a ciphertext cannot be read for
 * another tenant, versions are immutable snapshots, apply is idempotent, production
 * needs a second identity, and the apply payload round-trips the real value.
 *
 * Everything it creates is deleted before exit. It never touches a production
 * database: `NODE_ENV=production` is refused outright.
 *
 *   PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db \
 *   ALO_KEK_KEYS="{\"1\":\"$(openssl rand -base64 32)\"}" npm run verify:environments
 */

import { randomBytes } from 'node:crypto';
import { db } from '../src/lib/db';
import {
  buildApplyPayload,
  createEnvironment,
  createVersion,
  deleteVariable,
  listVariables,
  requestApply,
  upsertVariable,
  type Actor,
} from '../src/lib/environments/service';

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} — ${detail}`);
};

const COMPANY_A = `env-verify-a-${randomBytes(4).toString('hex')}`;
const COMPANY_B = `env-verify-b-${randomBytes(4).toString('hex')}`;
const SECRET_VALUE = `sk-verify-${randomBytes(16).toString('hex')}`;

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to run against NODE_ENV=production');
  if (!process.env.ALO_KEK_KEYS && !process.env.ALO_KEK) {
    process.env.ALO_KEK_KEYS = JSON.stringify({ '1': randomBytes(32).toString('base64') });
    console.log('  ..   no key supplied; generated an ephemeral KEK for this run');
  }

  const author: Actor = { userId: 'user-author', companyId: COMPANY_A, role: 'super_admin' };
  const reviewer: Actor = { userId: 'user-reviewer', companyId: COMPANY_A, role: 'super_admin' };
  const outsider: Actor = { userId: 'user-outsider', companyId: COMPANY_B, role: 'super_admin' };
  const environmentIds: string[] = [];

  try {
    const staging = await createEnvironment(author, { projectSlug: 'verify-project', name: 'staging' });
    const production = await createEnvironment(author, { projectSlug: 'verify-project', name: 'production' });
    environmentIds.push(staging.id, production.id);
    check('environment created per project', staging.name === 'staging' && staging.companyId === COMPANY_A, `${staging.name}/${production.name}`);

    let duplicateRefused = false;
    await createEnvironment(author, { projectSlug: 'verify-project', name: 'staging' }).catch(() => {
      duplicateRefused = true;
    });
    check('duplicate environment refused', duplicateRefused, duplicateRefused ? '409 path' : 'was allowed');

    await upsertVariable(author, staging.id, { key: 'LOG_LEVEL', value: 'info', secret: false });
    const saved = await upsertVariable(author, staging.id, { key: 'OPENAI_API_KEY', value: SECRET_VALUE, secret: true });
    check('secret is returned masked', saved.masked !== SECRET_VALUE && String(saved.masked).endsWith(SECRET_VALUE.slice(-4)), String(saved.masked));

    const stored = await db.environmentSecret.findFirst({ where: { environmentId: staging.id, key: 'OPENAI_API_KEY' } });
    const serialised = JSON.stringify(stored);
    check('no plaintext in the stored row', !!stored && !serialised.includes(SECRET_VALUE) && stored.algorithm === 'aes-256-gcm', `kekId=${stored?.kekId}`);

    const listed = await listVariables(author, staging.id);
    const listedSecret = listed.find((entry) => entry.key === 'OPENAI_API_KEY');
    check('listing never returns the value', listedSecret?.value === null && !!listedSecret?.masked, 'value=null');

    let leakBlocked = false;
    await listVariables(outsider, staging.id).catch(() => {
      leakBlocked = true;
    });
    check('another tenant cannot read the environment', leakBlocked, leakBlocked ? 'not found' : 'leaked');

    const version = await createVersion(author, staging.id, { changeSummary: 'initial' });
    check('version published as draft outside production', version.status === 'draft' && version.version === 1, version.status);

    await upsertVariable(author, production.id, { key: 'SENTRY_DSN', value: 'https://key@sentry.example/1', secret: true });
    const prodVersion = await createVersion(author, production.id, { changeSummary: 'prod snapshot' });
    check('production version waits for approval', prodVersion.status === 'pending_approval', prodVersion.status);

    const prodVersion2 = await createVersion(author, production.id, { changeSummary: 'with dsn' });

    let approvalRequired = false;
    await requestApply(author, production.id, { version: prodVersion2.version, idempotencyKey: 'verify-no-approval' }).catch((error: { code?: string }) => {
      approvalRequired = error?.code === 'approval-required';
    });
    check('applying an unapproved production version is refused', approvalRequired, approvalRequired ? '409 approval-required' : 'was allowed');

    let sameUserRefused = false;
    await requestApply(author, production.id, { version: prodVersion2.version, idempotencyKey: 'verify-self-approve', approve: true }).catch((error: { code?: string }) => {
      sameUserRefused = error?.code === 'same-user-approval';
    });
    check('the author cannot approve their own production change', sameUserRefused, sameUserRefused ? '409 same-user-approval' : 'was allowed');

    const firstApply = await requestApply(reviewer, production.id, { version: prodVersion2.version, idempotencyKey: 'verify-apply-1', approve: true });
    const replay = await requestApply(reviewer, production.id, { version: prodVersion2.version, idempotencyKey: 'verify-apply-1', approve: true });
    check('apply is idempotent', firstApply.applyId === replay.applyId && replay.replayed === true, `${firstApply.status} / replayed=${replay.replayed}`);

    const applyRow = await db.environmentApply.findUnique({ where: { id: firstApply.applyId } });
    check('apply is queued, never claimed successful', applyRow?.status === 'queued' && applyRow.requestedBy === 'user-reviewer', String(applyRow?.status));

    const payload = await buildApplyPayload(reviewer, production.id, prodVersion2.version);
    check('apply payload round-trips the real secret', payload.values.SENTRY_DSN === 'https://key@sentry.example/1', `${Object.keys(payload.values).length} keys, ${payload.keys.join(',')}`);

    const rollback = await createVersion(author, production.id, { changeSummary: 'rollback to v1', rollbackOf: prodVersion.version });
    check('rollback creates a new version instead of rewriting history', rollback.version === prodVersion2.version + 1, `v${rollback.version} rolls back v${prodVersion.version}`);

    const before = await db.environmentSecret.count({ where: { environmentId: staging.id } });
    await upsertVariable(author, staging.id, { key: 'OPENAI_API_KEY', value: 'plain-now', secret: false });
    const after = await db.environmentSecret.count({ where: { environmentId: staging.id } });
    check('a key that stops being secret loses its sealed copy', before === 1 && after === 0, `${before} -> ${after}`);

    await deleteVariable(author, staging.id, 'LOG_LEVEL');
    const remaining = await listVariables(author, staging.id);
    check('variable deletion removes it from the working set', !remaining.some((entry) => entry.key === 'LOG_LEVEL'), `${remaining.length} left`);
  } finally {
    for (const environmentId of environmentIds) {
      await db.environmentApply.deleteMany({ where: { environmentId } }).catch(() => {});
      await db.environmentConfigVersion.deleteMany({ where: { environmentId } }).catch(() => {});
      await db.environmentSecret.deleteMany({ where: { environmentId } }).catch(() => {});
      await db.environmentVariable.deleteMany({ where: { environmentId } }).catch(() => {});
      await db.projectEnvironment.deleteMany({ where: { id: environmentId } }).catch(() => {});
    }
    await db.auditEvent.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } }).catch(() => {});
    await db.notification.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } }).catch(() => {});
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\nverify:environments — ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('verify:environments failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
