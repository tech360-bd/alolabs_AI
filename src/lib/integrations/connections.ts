/**
 * CRM connection verification — the only place a stored CRM credential is
 * decrypted and used for egress.
 *
 * Rules enforced here (see docs/AGENTOS_CREDENTIAL_SECURITY.md):
 *  - Every read is tenant-scoped: `{ id, companyId }` in one query, so a
 *    company can never probe or verify another tenant's credential.
 *  - The plaintext secret exists only in memory for the duration of the call.
 *  - Results are sanitised: status, host, HTTP status, latency and a short
 *    reason. Never the token, the Authorization header or the full URL.
 *  - `lastVerifiedAt` moves ONLY on a successful verification. A failure stores
 *    the failure status but never advances the "last verified" timestamp, so a
 *    stored URL + key can never look healthy on its own.
 */
import { db } from '@/lib/db';
import { decryptField, isFieldEncryptionConfigured } from '@/lib/security/field-encryption';
import { isAllowedIntegrationUrl } from './types';
import {
  ALO_LEAD_API_ID,
  aloLeadApiListRecentLeads,
  aloLeadApiVerify,
  type CrmFailureKind,
  type CrmLead,
  type LeadCapabilities,
} from './connectors/crm/alo-lead-api';

export const CRM_INTEGRATION_TYPE = ALO_LEAD_API_ID;

export type CrmConnectionState =
  | 'connected'
  | CrmFailureKind
  | 'not_configured'
  | 'not_found';

export interface ConnectionVerification {
  credentialId: string;
  companyId: string;
  state: CrmConnectionState;
  /** ISO timestamp of THIS check (success or failure). */
  checkedAt: string;
  /** ISO timestamp of the last successful verification (never advanced on failure). */
  lastVerifiedAt: string | null;
  /** Hostname only — never the full URL, never credentials. */
  endpointHost: string | null;
  httpStatus?: number;
  latencyMs: number;
  message: string;
  permissions?: string[];
}

interface LoadedCredential {
  id: string;
  companyId: string;
  baseUrl: string | null;
  encryptedSecret: string | null;
  settings: string;
  lastVerifiedAt: Date | null;
}

async function loadCredential(companyId: string, credentialId: string): Promise<LoadedCredential | null> {
  return db.integrationCredential.findFirst({
    where: { id: credentialId, companyId, integrationType: CRM_INTEGRATION_TYPE },
    select: { id: true, companyId: true, baseUrl: true, encryptedSecret: true, settings: true, lastVerifiedAt: true },
  });
}

/** Parse `settings.model` (server-side model pinning); ignores anything else. */
export function readPinnedModel(settings: string): string | undefined {
  try {
    const parsed = JSON.parse(settings || '{}') as { model?: unknown };
    return typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function sanitizeReason(message: string, baseUrl: string | null, secret: string | null): string {
  let out = message;
  if (secret) out = out.split(secret).join('[redacted]');
  if (baseUrl) out = out.split(baseUrl).join(hostOf(baseUrl) ?? '[crm]');
  return out.slice(0, 300);
}

async function recordVerification(
  credential: LoadedCredential,
  state: CrmConnectionState,
  details: { httpStatus?: number; latencyMs: number; error?: string },
): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.integrationCredential.update({
      where: { id: credential.id },
      data: {
        status: state,
        ...(state === 'connected' ? { lastVerifiedAt: now } : {}),
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId: credential.companyId,
        action: 'company.integration.verify',
        resource: 'integration-credential',
        resourceId: credential.id,
        details: JSON.stringify({
          state,
          httpStatus: details.httpStatus ?? null,
          latencyMs: details.latencyMs,
          ...(details.error ? { error: details.error.slice(0, 300) } : {}),
        }),
      },
    });
  });
}

function result(
  credential: LoadedCredential,
  state: CrmConnectionState,
  startedAt: number,
  extra: Partial<ConnectionVerification> & { message: string },
): ConnectionVerification {
  return {
    credentialId: credential.id,
    companyId: credential.companyId,
    state,
    checkedAt: new Date().toISOString(),
    lastVerifiedAt: credential.lastVerifiedAt?.toISOString() ?? null,
    endpointHost: hostOf(credential.baseUrl),
    latencyMs: Date.now() - startedAt,
    ...extra,
  };
}

/**
 * Perform an authenticated, read-only verification against the stored CRM.
 * `callerCompanyId` is the authenticated tenant — never taken from the body.
 */
export async function verifyCrmConnection(params: {
  companyId: string;
  credentialId: string;
}): Promise<ConnectionVerification> {
  const startedAt = Date.now();
  const credential = await loadCredential(params.companyId, params.credentialId);
  if (!credential) {
    return {
      credentialId: params.credentialId,
      companyId: params.companyId,
      state: 'not_found',
      checkedAt: new Date().toISOString(),
      lastVerifiedAt: null,
      endpointHost: null,
      latencyMs: Date.now() - startedAt,
      message: 'No CRM connection with that id exists for this tenant',
    };
  }

  if (!credential.baseUrl || !credential.encryptedSecret) {
    await recordVerification(credential, 'not_configured', { latencyMs: Date.now() - startedAt, error: 'missing base URL or credential' });
    return result(credential, 'not_configured', startedAt, {
      message: 'Connection has no base URL or stored credential',
    });
  }

  if (!isFieldEncryptionConfigured()) {
    await recordVerification(credential, 'sync_failed', { latencyMs: Date.now() - startedAt, error: 'encryption key not configured' });
    return result(credential, 'sync_failed', startedAt, {
      message: 'Cannot decrypt the stored credential: ENCRYPTION_KEY is not configured',
    });
  }

  const guard = isAllowedIntegrationUrl(credential.baseUrl);
  if (!guard.allowed) {
    await recordVerification(credential, 'unreachable', { latencyMs: Date.now() - startedAt, error: 'egress policy refused target' });
    return result(credential, 'unreachable', startedAt, {
      httpStatus: undefined,
      message: `CRM target refused by egress policy (${guard.reason ?? 'blocked'})`,
    });
  }

  let secret: string;
  try {
    secret = decryptField(credential.encryptedSecret);
  } catch {
    await recordVerification(credential, 'sync_failed', { latencyMs: Date.now() - startedAt, error: 'credential could not be decrypted' });
    return result(credential, 'sync_failed', startedAt, {
      message: 'Stored CRM credential could not be decrypted (wrong key or corrupted row)',
    });
  }

  const outcome = await aloLeadApiVerify({
    companyId: credential.companyId,
    credential: { baseUrl: credential.baseUrl, apiKey: secret },
    timeoutMs: 10_000,
  });
  secret = '';

  if (outcome.ok) {
    await recordVerification(credential, 'connected', { httpStatus: outcome.httpStatus, latencyMs: Date.now() - startedAt });
    return result(credential, 'connected', startedAt, {
      httpStatus: outcome.httpStatus,
      message: 'CRM reachable, credential accepted and leads:read granted',
      lastVerifiedAt: new Date().toISOString(),
      permissions: outcome.data.capabilities.permissions,
    });
  }

  const message = sanitizeReason(outcome.message, credential.baseUrl, secret);
  await recordVerification(credential, outcome.kind, {
    ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
    latencyMs: Date.now() - startedAt,
    error: message,
  });
  return result(credential, outcome.kind, startedAt, {
    ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
    message,
  });
}

/**
 * Read recent leads for the workflow. Fails closed: any non-success outcome is
 * returned with its category and the caller must not fabricate data.
 */
export async function readCrmLeads(params: {
  companyId: string;
  credentialId: string;
  limit: number;
}): Promise<
  | { ok: true; leads: CrmLead[]; capabilities: LeadCapabilities; latencyMs: number }
  | { ok: false; state: CrmConnectionState; message: string; httpStatus?: number }
> {
  const startedAt = Date.now();
  const credential = await loadCredential(params.companyId, params.credentialId);
  if (!credential) return { ok: false, state: 'not_found', message: 'No CRM connection with that id exists for this tenant' };
  if (!credential.baseUrl || !credential.encryptedSecret) {
    return { ok: false, state: 'not_configured', message: 'Connection has no base URL or stored credential' };
  }
  if (!isFieldEncryptionConfigured()) {
    return { ok: false, state: 'sync_failed', message: 'ENCRYPTION_KEY is not configured; credential cannot be used' };
  }
  const guard = isAllowedIntegrationUrl(credential.baseUrl);
  if (!guard.allowed) {
    return { ok: false, state: 'unreachable', message: `CRM target refused by egress policy (${guard.reason ?? 'blocked'})` };
  }

  let secret: string;
  try {
    secret = decryptField(credential.encryptedSecret);
  } catch {
    return { ok: false, state: 'sync_failed', message: 'Stored CRM credential could not be decrypted' };
  }

  const outcome = await aloLeadApiListRecentLeads(
    { companyId: credential.companyId, credential: { baseUrl: credential.baseUrl, apiKey: secret }, timeoutMs: 15_000 },
    { limit: params.limit },
  );
  secret = '';

  if (!outcome.ok) {
    return {
      ok: false,
      state: outcome.kind,
      message: sanitizeReason(outcome.message, credential.baseUrl, null),
      ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
    };
  }
  return {
    ok: true,
    leads: outcome.data.leads,
    capabilities: outcome.data.capabilities,
    latencyMs: Date.now() - startedAt,
  };
}
