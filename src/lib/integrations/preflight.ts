/**
 * Staging readiness preflight for the CRM follow-up workflow.
 *
 * Answers one question, server-side and without guessing:
 *   "Is everything the five-lead workflow needs actually configured and usable?"
 *
 * It never decrypts a credential unless `verify: true` is requested, and it
 * never returns a secret, a full URL or a provider key. Missing pieces are
 * reported as blockers so an operator sees exactly what to configure instead
 * of discovering it when a run fails.
 */
import { db } from '@/lib/db';
import { isFieldEncryptionConfigured } from '@/lib/security/field-encryption';
import { isAllowedIntegrationUrl } from './types';
import { CRM_INTEGRATION_TYPE, readPinnedModel, verifyCrmConnection } from './connections';
import { CRM_FOLLOWUP_REQUIRED_LEADS, followupTimeoutMs } from './workflows/lead-followup';

export type PreflightStatus = 'pass' | 'fail' | 'missing';

export interface PreflightCheck {
  id: string;
  label: string;
  status: PreflightStatus;
  detail: string;
}

/**
 * Provider probe seam: production uses the AI router; tests may inject a probe
 * to model "an AI provider is configured" without pretending a model ran.
 */
export type ProviderProbe = () => Promise<{ providers: string[]; models: string[] }>;

export interface PreflightReport {
  /**
   * Did the preflight itself run successfully? This says NOTHING about whether
   * the workflow can execute — see `workflow_execution_ready`.
   */
  preflight_status: 'ok' | 'error';
  /**
   * DEPRECATED alias of `workflow_execution_ready`, kept byte-for-byte equal so
   * an old client cannot read `ready: true` while execution is impossible.
   */
  ready: boolean;
  /**
   * True only when every dependency (CRM connection, URL, credential,
   * verification, AI provider, model) is present. Never true on partial config.
   */
  workflow_execution_ready: boolean;
  checkedAt: string;
  credentialId: string | null;
  /** True when a live CRM verification was performed as part of this check. */
  liveVerified: boolean;
  checks: PreflightCheck[];
  /** One entry per failing/missing check — the explicit missing dependencies. */
  missing_dependencies: Array<{ id: string; label: string; status: PreflightStatus; detail: string }>;
  blockers: string[];
  /**
   * Where the provider readiness came from. `injected_simulated` means a test
   * seam supplied the answer — such a report can never justify a real staging
   * claim.
   */
  provider_probe: 'router' | 'injected_simulated';
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * A provider counts as available only if a REAL health check succeeds. Merely
 * being registered/initialized is not enough: an env-configured provider with
 * no reachable endpoint (e.g. GitHub Models without a token) must not make the
 * workflow look executable.
 */
async function healthCheckWithin(provider: { healthCheck(): Promise<{ isHealthy: boolean }> }, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      provider.healthCheck(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('provider health check timed out')), timeoutMs);
      }),
    ]);
    return Boolean(result?.isHealthy);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function defaultProviderProbe(companyId: string): Promise<{ providers: string[]; models: string[] }> {
  const { ensureRouterSynced } = await import('@/lib/ai-router');
  // Preflight is a readiness decision, so it must not read a stale provider
  // registry: force a re-sync before deciding whether any provider is ready.
  const router = await ensureRouterSynced({ force: true });
  const candidates = (await router.getReadyProviderSummaries())
    .filter((p) => p.companyId === undefined || p.companyId === companyId);
  const checked = await Promise.all(candidates.map(async (summary) => {
    const provider = router.getProvider(summary.provider);
    if (!provider) return null;
    const healthy = await healthCheckWithin(provider, 4_000);
    return healthy ? summary : null;
  }));
  const available = checked.filter((summary): summary is NonNullable<typeof summary> => summary !== null);
  return {
    providers: available.map((p) => p.provider),
    models: available.flatMap((p) => p.models),
  };
}

export async function runCrmPreflight(params: {
  companyId: string;
  credentialId?: string;
  verify?: boolean;
  /** Test seam; production defaults to the AI router. */
  providerProbe?: ProviderProbe;
}): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const blockers: string[] = [];
  let preflightStatus: 'ok' | 'error' = 'ok';

  const add = (check: PreflightCheck) => {
    checks.push(check);
    if (check.status !== 'pass') blockers.push(`${check.label}: ${check.detail}`);
  };

  // 1. Connection selection (tenant-scoped).
  const credential = params.credentialId
    ? await db.integrationCredential.findFirst({
        where: { id: params.credentialId, companyId: params.companyId, integrationType: CRM_INTEGRATION_TYPE },
        select: { id: true, name: true, baseUrl: true, encryptedSecret: true, secretFingerprint: true, status: true, lastVerifiedAt: true, settings: true },
      })
    : await db.integrationCredential.findFirst({
        where: { companyId: params.companyId, integrationType: CRM_INTEGRATION_TYPE },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, baseUrl: true, encryptedSecret: true, secretFingerprint: true, status: true, lastVerifiedAt: true, settings: true },
      });

  if (!credential) {
    add({
      id: 'crm_connection',
      label: 'CRM connection',
      status: 'missing',
      detail: params.credentialId
        ? 'No such CRM connection exists for this tenant'
        : 'No crm.alo-lead-api connection is stored for this tenant',
    });
    // The remaining CRM checks cannot pass without a connection; still report AI
    // readiness so one preflight call lists every blocker.
  } else {
    add({ id: 'crm_connection', label: 'CRM connection', status: 'pass', detail: `Connection "${credential.name}" (${credential.id})` });

    if (!credential.baseUrl) {
      add({ id: 'crm_base_url', label: 'CRM base URL', status: 'missing', detail: 'No base URL is configured' });
    } else {
      const guard = isAllowedIntegrationUrl(credential.baseUrl);
      add({
        id: 'crm_base_url',
        label: 'CRM base URL',
        status: guard.allowed ? 'pass' : 'fail',
        detail: guard.allowed
          ? `Host ${hostOf(credential.baseUrl)} is allowed by the egress policy`
          : `Host refused by the egress policy (${guard.reason ?? 'blocked'})`,
      });
    }

    if (!credential.encryptedSecret || !credential.secretFingerprint) {
      add({ id: 'crm_credential', label: 'CRM credential', status: 'missing', detail: 'No stored credential fingerprint' });
    } else if (!isFieldEncryptionConfigured()) {
      add({ id: 'crm_credential', label: 'CRM credential', status: 'fail', detail: 'ENCRYPTION_KEY/APP_SECRET is not configured, so the credential cannot be decrypted' });
    } else {
      add({ id: 'crm_credential', label: 'CRM credential', status: 'pass', detail: 'Credential is stored encrypted (fingerprint present)' });
    }

    if (params.verify) {
      const verification = await verifyCrmConnection({ companyId: params.companyId, credentialId: credential.id });
      add({
        id: 'crm_verification',
        label: 'Live CRM verification',
        status: verification.state === 'connected' ? 'pass' : verification.state === 'not_configured' ? 'missing' : 'fail',
        detail: `${verification.state}: ${verification.message}`,
      });
      if (verification.lastVerifiedAt) {
        add({ id: 'crm_last_verified', label: 'Last successful verification', status: 'pass', detail: verification.lastVerifiedAt });
      }
    } else if (credential.status === 'connected' && credential.lastVerifiedAt) {
      add({
        id: 'crm_verification',
        label: 'CRM verification',
        status: 'pass',
        detail: `Last verified ${credential.lastVerifiedAt.toISOString()} (live re-check not requested)`,
      });
    } else {
      add({
        id: 'crm_verification',
        label: 'CRM verification',
        status: credential.lastVerifiedAt ? 'fail' : 'missing',
        detail: credential.lastVerifiedAt
          ? `Current status is "${credential.status}"; last successful verification was ${credential.lastVerifiedAt.toISOString()}`
          : `Connection status is "${credential.status}" and it has never been verified`,
      });
    }
  }

  // 2. AI provider readiness (server-side router; no keys in the output).
  let providerNames: string[] = [];
  let providerModels: string[] = [];
  try {
    const result = params.providerProbe
      ? await params.providerProbe()
      : await defaultProviderProbe(params.companyId);
    providerNames = result.providers;
    providerModels = result.models;
    add({
      id: 'ai_provider',
      label: 'AI provider',
      status: providerNames.length > 0 ? 'pass' : 'missing',
      detail: providerNames.length > 0
        ? `Available provider(s): ${providerNames.join(', ')}`
        : 'No AI provider is configured or reachable on the server',
    });
  } catch {
    preflightStatus = 'error';
    add({ id: 'ai_provider', label: 'AI provider', status: 'fail', detail: 'Provider registry could not be loaded' });
  }

  // 3. Model pinning (server-side only).
  const pinned = readPinnedModel(credential?.settings ?? '') ?? (process.env.CRM_FOLLOWUP_MODEL?.trim() || undefined);
  if (!pinned) {
    add({
      id: 'ai_model',
      label: 'AI model',
      status: providerNames.length > 0 ? 'pass' : 'missing',
      detail: providerNames.length > 0
        ? 'No model pinned; the router default model will be used'
        : 'No model pinned and no provider is available',
    });
  } else {
    const supported = providerModels.includes(pinned);
    add({
      id: 'ai_model',
      label: 'AI model',
      status: supported ? 'pass' : 'fail',
      detail: supported
        ? `Pinned model "${pinned}" is offered by an available provider`
        : `Pinned model "${pinned}" is not offered by any available provider`,
    });
  }

  // 4. Workflow limits (constants + timeout, not operator input).
  add({
    id: 'workflow_limits',
    label: 'Workflow limits',
    status: 'pass',
    detail: `Exactly ${CRM_FOLLOWUP_REQUIRED_LEADS} leads required; execution budget ${Math.round(followupTimeoutMs() / 1000)}s; deliveries disabled`,
  });

  const workflowExecutionReady = blockers.length === 0;
  return {
    preflight_status: preflightStatus,
    // Kept identical to workflow_execution_ready on purpose: a preflight that
    // "ran fine" must never be confused with "execution is possible".
    ready: workflowExecutionReady,
    workflow_execution_ready: workflowExecutionReady,
    checkedAt: new Date().toISOString(),
    credentialId: credential?.id ?? null,
    liveVerified: Boolean(params.verify && credential),
    checks,
    missing_dependencies: checks
      .filter((check) => check.status !== 'pass' && check.id !== 'workflow_limits')
      .map((check) => ({ id: check.id, label: check.label, status: check.status, detail: check.detail })),
    blockers,
    provider_probe: params.providerProbe ? 'injected_simulated' : 'router',
  };
}
