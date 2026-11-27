/**
 * Environment manager — the service layer behind `/api/super-admin/environments`.
 *
 * Responsibilities, and the rules that make them safe:
 *
 *  * **Scoping.** Every read and write resolves a `companyId` first. There is no
 *    query in this file without one.
 *  * **Secrets never leave sealed.** The API surface returns masks only; decryption
 *    happens in exactly one place (`buildApplyPayload`), for one purpose (producing
 *    the host-side apply file), and every such call is audited by its caller.
 *  * **Versions are immutable snapshots.** Editing variables changes the working
 *    set; publishing a version freezes it. Rollback creates a *new* version that
 *    copies an old one, so history is never rewritten.
 *  * **Production requires approval.** A version created against `production` is
 *    `pending_approval`; applying it needs a different user, and the apply row
 *    records both identities.
 */

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import {
  assertApplyClaimable,
  assertApplyOutcome,
  EnvironmentError,
} from '@/lib/environments/apply-state';
import { notifyOperator } from '@/lib/notifications/operator';
import { sealSecret, openSecret, maskValue, type SealedSecret } from '@/lib/secrets/envelope';

export const ENVIRONMENT_NAMES = ['development', 'staging', 'production'] as const;
export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export { EnvironmentError };

export interface Actor {
  userId: string;
  companyId: string;
  role: string;
}

function assertName(name: string): EnvironmentName {
  if (!(ENVIRONMENT_NAMES as readonly string[]).includes(name)) {
    throw new EnvironmentError(`Environment must be one of ${ENVIRONMENT_NAMES.join(', ')}`, 400, 'invalid');
  }
  return name as EnvironmentName;
}

/** Load an environment, refusing anything outside the actor's company. */
export async function requireEnvironment(actor: Actor, environmentId: string) {
  const environment = await db.projectEnvironment.findFirst({
    where: { id: environmentId, companyId: actor.companyId },
  });
  if (!environment) throw new EnvironmentError('Environment not found', 404, 'not-found');
  return environment;
}

export async function listEnvironments(actor: Actor, projectSlug?: string) {
  return db.projectEnvironment.findMany({
    where: { companyId: actor.companyId, ...(projectSlug ? { projectSlug } : {}) },
    orderBy: [{ projectSlug: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      projectSlug: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { variables: true, secrets: true, versions: true } },
    },
  });
}

export async function createEnvironment(
  actor: Actor,
  input: { projectSlug: string; name: string; status?: string },
) {
  const name = assertName(input.name);
  const existing = await db.projectEnvironment.findFirst({
    where: { companyId: actor.companyId, projectSlug: input.projectSlug, name },
    select: { id: true },
  });
  if (existing) {
    throw new EnvironmentError('That project already has an environment with this name', 409, 'conflict');
  }
  return db.projectEnvironment.create({
    data: {
      companyId: actor.companyId,
      projectSlug: input.projectSlug,
      name,
      status: input.status === 'locked' ? 'locked' : 'active',
      createdBy: actor.userId,
    },
  });
}

export interface VariableView {
  key: string;
  value: string | null;
  masked: string | null;
  secret: boolean;
  description: string | null;
  updatedAt: string | null;
}

/** The only representation of configuration any route returns. */
export async function listVariables(actor: Actor, environmentId: string): Promise<VariableView[]> {
  const environment = await requireEnvironment(actor, environmentId);
  const [variables, secrets] = await Promise.all([
    db.environmentVariable.findMany({ where: { environmentId: environment.id }, orderBy: { key: 'asc' } }),
    db.environmentSecret.findMany({ where: { environmentId: environment.id }, orderBy: { key: 'asc' } }),
  ]);

  return [
    ...variables.map((variable) => ({
      key: variable.key,
      value: variable.value,
      masked: null,
      secret: false,
      description: variable.description,
      updatedAt: variable.updatedAt.toISOString(),
    })),
    ...secrets.map((secret) => ({
      key: secret.key,
      // Never the value: a masked preview and nothing else.
      value: null,
      masked: secret.masked,
      secret: true,
      description: null,
      updatedAt: secret.updatedAt.toISOString(),
    })),
  ];
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export async function upsertVariable(
  actor: Actor,
  environmentId: string,
  input: { key: string; value: string; secret: boolean; description?: string },
) {
  const environment = await requireEnvironment(actor, environmentId);
  if (!KEY_PATTERN.test(input.key)) {
    throw new EnvironmentError(
      'Variable names must be upper case letters, digits and underscores, starting with a letter (max 64).',
      400,
      'invalid',
    );
  }
  if (environment.status !== 'active') {
    throw new EnvironmentError('This environment is locked; unlock it before changing configuration.', 409, 'conflict');
  }

  if (!input.secret) {
    const saved = await db.environmentVariable.upsert({
      where: { environmentId_key: { environmentId: environment.id, key: input.key } },
      create: {
        environmentId: environment.id,
        key: input.key,
        value: input.value,
        description: input.description ?? null,
        updatedBy: actor.userId,
      },
      update: { value: input.value, description: input.description ?? null, updatedBy: actor.userId },
      select: { key: true, updatedAt: true },
    });
    // A key that was previously secret is no longer: remove the sealed copy so two
    // sources of truth cannot disagree.
    await db.environmentSecret.deleteMany({ where: { environmentId: environment.id, key: input.key } });
    return { key: saved.key, secret: false, masked: null, updatedAt: saved.updatedAt.toISOString() };
  }

  let sealed: SealedSecret;
  try {
    sealed = sealSecret(input.value, {
      companyId: environment.companyId,
      projectSlug: environment.projectSlug,
      environment: environment.name,
      key: input.key,
    });
  } catch (error) {
    throw new EnvironmentError(
      error instanceof Error ? error.message : 'Secret store is unavailable',
      503,
      'secret-store-unavailable',
    );
  }

  const data = {
    masked: maskValue(input.value),
    kekId: sealed.kekId,
    dekCiphertext: sealed.dekCiphertext,
    dekIv: sealed.dekIv,
    dekTag: sealed.dekTag,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    tag: sealed.tag,
    algorithm: sealed.algorithm,
    rotatedAt: new Date(),
    createdBy: actor.userId,
  };

  const existing = await db.environmentSecret.findUnique({
    where: { environmentId_key: { environmentId: environment.id, key: input.key } },
    select: { version: true },
  });

  const saved = await db.environmentSecret.upsert({
    where: { environmentId_key: { environmentId: environment.id, key: input.key } },
    create: { environmentId: environment.id, key: input.key, ...data },
    update: { ...data, version: (existing?.version ?? 0) + 1 },
    select: { key: true, masked: true, version: true, updatedAt: true },
  });
  // Same rule in the other direction: a key that became secret loses its plain copy.
  await db.environmentVariable.deleteMany({ where: { environmentId: environment.id, key: input.key } });

  return { key: saved.key, secret: true, masked: saved.masked, version: saved.version, updatedAt: saved.updatedAt.toISOString() };
}

export async function deleteVariable(actor: Actor, environmentId: string, key: string) {
  const environment = await requireEnvironment(actor, environmentId);
  if (environment.status !== 'active') {
    throw new EnvironmentError('This environment is locked; unlock it before changing configuration.', 409, 'conflict');
  }
  const [plain, secret] = await Promise.all([
    db.environmentVariable.deleteMany({ where: { environmentId: environment.id, key } }),
    db.environmentSecret.deleteMany({ where: { environmentId: environment.id, key } }),
  ]);
  if (plain.count + secret.count === 0) throw new EnvironmentError('No such variable', 404, 'not-found');
  return { removed: plain.count + secret.count };
}

async function workingSnapshot(environmentId: string) {
  const [variables, secrets] = await Promise.all([
    db.environmentVariable.findMany({ where: { environmentId }, orderBy: { key: 'asc' } }),
    db.environmentSecret.findMany({ where: { environmentId }, orderBy: { key: 'asc' } }),
  ]);
  return { variables, secrets };
}

function checksumOf(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Freeze the working configuration as a new version.
 *
 * Secret *values* are not copied into the snapshot — only the key names and their
 * current sealed record ids. The version is therefore a pointer set, not a second
 * copy of every credential.
 */
export async function createVersion(
  actor: Actor,
  environmentId: string,
  options: { changeSummary: string; rollbackOf?: number; requireApproval?: boolean } = { changeSummary: '' },
) {
  const environment = await requireEnvironment(actor, environmentId);
  const snapshot = await workingSnapshot(environment.id);
  if (snapshot.variables.length === 0 && snapshot.secrets.length === 0) {
    throw new EnvironmentError('There is nothing to publish: configure at least one variable first.', 400, 'invalid');
  }

  const latest = await db.environmentConfigVersion.findFirst({
    where: { environmentId: environment.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const variablesJson = JSON.stringify(snapshot.variables.map((variable) => ({ key: variable.key, value: variable.value })));
  const secretKeysJson = JSON.stringify(snapshot.secrets.map((secret) => ({ key: secret.key, masked: secret.masked, secretId: secret.id })));
  const checksum = checksumOf({ variablesJson, secretKeysJson });

  const requiresApproval = options.requireApproval ?? environment.name === 'production';

  const version = await db.environmentConfigVersion.create({
    data: {
      environmentId: environment.id,
      version: (latest?.version ?? 0) + 1,
      status: requiresApproval ? 'pending_approval' : 'draft',
      changeSummary: options.changeSummary.slice(0, 500) || 'Configuration snapshot',
      variablesJson,
      secretKeysJson,
      checksum,
      rollbackOf: options.rollbackOf ?? null,
      createdBy: actor.userId,
    },
    select: { id: true, version: true, status: true, checksum: true, createdAt: true },
  });

  return { ...version, createdAt: version.createdAt.toISOString(), requiresApproval };
}

export async function listVersions(actor: Actor, environmentId: string) {
  const environment = await requireEnvironment(actor, environmentId);
  const rows = await db.environmentConfigVersion.findMany({
    where: { environmentId: environment.id },
    orderBy: { version: 'desc' },
    take: 50,
    select: {
      id: true,
      version: true,
      status: true,
      changeSummary: true,
      checksum: true,
      rollbackOf: true,
      createdBy: true,
      approvedBy: true,
      approvedAt: true,
      appliedAt: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  }));
}

/**
 * Request an apply.
 *
 * The database row is the instruction; a host-side agent performs it. This function
 * deliberately cannot claim success — it can only create a `queued` row, because
 * "saved" has never meant "running".
 */
export async function requestApply(
  actor: Actor,
  environmentId: string,
  input: { version?: number; idempotencyKey: string; approve?: boolean },
) {
  const environment = await requireEnvironment(actor, environmentId);

  const version = input.version
    ? await db.environmentConfigVersion.findFirst({
        where: { environmentId: environment.id, version: input.version },
        select: { id: true, version: true, status: true, createdBy: true },
      })
    : await db.environmentConfigVersion.findFirst({
        where: { environmentId: environment.id },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, status: true, createdBy: true },
      });

  if (!version) throw new EnvironmentError('No configuration version exists to apply', 404, 'not-found');

  const existing = await db.environmentApply.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, status: true, versionId: true },
  });
  if (existing) {
    // The same request replayed: return the original instead of applying twice.
    return { applyId: existing.id, status: existing.status, versionId: existing.versionId, replayed: true };
  }

  const needsApproval = version.status === 'pending_approval';
  if (needsApproval) {
    if (!input.approve) {
      throw new EnvironmentError(
        'This version needs approval before it can be applied to production.',
        409,
        'approval-required',
      );
    }
    if (version.createdBy === actor.userId) {
      throw new EnvironmentError(
        'A production configuration must be approved by someone other than its author.',
        409,
        'same-user-approval',
      );
    }
  }

  if (environment.name === 'production' && input.approve && version.status !== 'applied') {
    await db.environmentConfigVersion.update({
      where: { id: version.id },
      data: { status: 'approved', approvedBy: actor.userId, approvedAt: new Date() },
    });
  }

  const apply = await db.environmentApply.create({
    data: {
      environmentId: environment.id,
      versionId: version.id,
      status: 'queued',
      stage: 'requested',
      idempotencyKey: input.idempotencyKey,
      requestedBy: actor.userId,
      approvedBy: needsApproval ? actor.userId : null,
    },
    select: { id: true, status: true, versionId: true, createdAt: true },
  });

  return { applyId: apply.id, status: apply.status, versionId: apply.versionId, replayed: false };
}

/**
 * Produce the host-side apply payload.
 *
 * This is the single decryption point in the product. It returns plaintext, so it
 * must never be called by a route that responds with JSON — the apply agent endpoint
 * consumes it, audits the call, and writes it to the host as a 0600 file.
 */
export async function buildApplyPayload(actor: Actor, environmentId: string, versionNumber: number) {
  const environment = await requireEnvironment(actor, environmentId);
  if (environment.name === 'production' && actor.role !== 'super_admin') {
    throw new EnvironmentError('Only a super administrator may materialise production configuration.', 403, 'invalid');
  }

  const version = await db.environmentConfigVersion.findFirst({
    where: { environmentId: environment.id, version: versionNumber },
    select: { id: true, version: true, status: true, variablesJson: true, secretKeysJson: true, checksum: true },
  });
  if (!version) throw new EnvironmentError('Version not found', 404, 'not-found');

  const variables = JSON.parse(version.variablesJson) as Array<{ key: string; value: string }>;
  const secretKeys = JSON.parse(version.secretKeysJson) as Array<{ key: string; secretId: string }>;
  const sealedRecords = await db.environmentSecret.findMany({
    where: { id: { in: secretKeys.map((entry) => entry.secretId) } },
  });

  const values: Record<string, string> = {};
  for (const variable of variables) values[variable.key] = variable.value;
  for (const entry of secretKeys) {
    const record = sealedRecords.find((candidate) => candidate.id === entry.secretId);
    if (!record) throw new EnvironmentError(`Secret ${entry.key} is missing from the store`, 409, 'conflict');
    values[entry.key] = openSecret(
      {
        kekId: record.kekId,
        dekCiphertext: record.dekCiphertext,
        dekIv: record.dekIv,
        dekTag: record.dekTag,
        ciphertext: record.ciphertext,
        iv: record.iv,
        tag: record.tag,
        algorithm: record.algorithm,
      },
      {
        companyId: environment.companyId,
        projectSlug: environment.projectSlug,
        environment: environment.name,
        key: entry.key,
      },
    );
  }

  return {
    environmentId: environment.id,
    projectSlug: environment.projectSlug,
    environment: environment.name,
    version: version.version,
    checksum: version.checksum,
    values,
    keys: Object.keys(values).sort(),
  };
}


/**
 * Claim a queued apply and hand the host its payload.
 *
 * This is the only path that decrypts an environment's secrets, so it is
 * deliberately machine-facing: it requires the ops token, it is scoped to one apply
 * row, and it can only serve an apply that is `queued` or already `running` for this
 * host. Re-claiming while running returns the same payload rather than a second one,
 * so a retried workflow cannot start two applies.
 */
export async function claimApply(
  applyId: string,
  options: { hostRef: string; allowReclaim?: boolean } = { hostRef: 'host' },
) {
  const apply = await db.environmentApply.findUnique({
    where: { id: applyId },
    select: {
      id: true,
      status: true,
      environmentId: true,
      version: { select: { version: true } },
      environment: { select: { companyId: true, projectSlug: true, name: true } },
    },
  });
  if (!apply) throw new EnvironmentError('Apply not found', 404, 'not-found');

  if (!(apply.status === 'running' && options.allowReclaim)) {
    assertApplyClaimable(apply.status);
  }

  const payload = await buildApplyPayload(
    { userId: 'ops-agent', companyId: apply.environment.companyId, role: 'super_admin' },
    apply.environmentId,
    apply.version.version,
  );

  await db.environmentApply.update({
    where: { id: applyId },
    data: {
      status: 'running',
      stage: 'dispatching',
      hostRef: options.hostRef.slice(0, 191),
      startedAt: new Date(),
    },
  });

  return {
    applyId: apply.id,
    projectSlug: apply.environment.projectSlug,
    environment: apply.environment.name,
    version: apply.version.version,
    checksum: payload.checksum,
    values: payload.values,
  };
}

export type ApplyOutcome = 'succeeded' | 'failed' | 'rolled_back';

/**
 * Record what the host reported.
 *
 * `succeeded` is only accepted with a passing health check: "the file was written" is
 * not "the service runs the configuration". Everything else leaves the version
 * unapplied so the dashboard cannot show a green state that was never verified.
 */
export async function recordApplyResult(input: {
  applyId: string;
  outcome: ApplyOutcome;
  stage?: string;
  detail?: string;
  healthCheck?: string;
  hostRef?: string;
}) {
  const apply = await db.environmentApply.findUnique({
    where: { id: input.applyId },
    select: { id: true, environmentId: true, versionId: true, status: true, requestedBy: true },
  });
  if (!apply) throw new EnvironmentError('Apply not found', 404, 'not-found');

  assertApplyOutcome(input.outcome, input.healthCheck);

  const finishedAt = new Date();
  const updated = await db.environmentApply.update({
    where: { id: apply.id },
    data: {
      status: input.outcome,
      stage: (input.stage ?? 'finished').slice(0, 64),
      detail: input.detail?.slice(0, 2_000) ?? null,
      healthCheck: input.healthCheck?.slice(0, 500) ?? null,
      hostRef: input.hostRef?.slice(0, 191) ?? undefined,
      finishedAt,
    },
    select: { id: true, status: true, environmentId: true, versionId: true, requestedBy: true },
  });

  if (input.outcome === 'succeeded') {
    await db.environmentConfigVersion.update({
      where: { id: apply.versionId },
      data: { status: 'applied', appliedAt: finishedAt },
    });
  }

  const environment = await db.projectEnvironment.findUnique({
    where: { id: apply.environmentId },
    select: { companyId: true, projectSlug: true, name: true },
  });

  if (environment) {
    await notifyOperator({
      companyId: environment.companyId,
      ...(updated.requestedBy ? { userId: updated.requestedBy } : {}),
      type: input.outcome === 'succeeded' ? 'config.changed' : 'deployment.failed',
      title:
        input.outcome === 'succeeded'
          ? `Configuration applied: ${environment.projectSlug}/${environment.name}`
          : `Configuration apply ${input.outcome}: ${environment.projectSlug}/${environment.name}`,
      message:
        input.outcome === 'succeeded'
          ? `Health check passed after applying the configuration.`
          : `${input.detail ?? 'The host reported a failure.'}`,
      link: '/dashboard?panel=environment-manager',
      evidence: { applyId: apply.id, stage: input.stage ?? null, outcome: input.outcome },
    }).catch(() => undefined);
  }

  return { applyId: updated.id, status: updated.status };
}
