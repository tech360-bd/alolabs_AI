/**
 * Weekly open-source AI discovery
 * ALO Labs AgentOS — Phase 12.
 *
 * WHAT THIS DOES
 * --------------
 * Once a week, compare the model/provider landscape the platform knows about
 * against the *live* catalogues of the free providers it is configured with,
 * and write a reviewable report. It notifies; it never activates.
 *
 * Hard rules enforced in code:
 *   • Read-only. No provider config, model assignment, routing policy or
 *     production model is ever changed by this module.
 *   • No new production model is adopted automatically — a *newer* release is
 *     reported as a recommendation only.
 *   • Every external call is gated: only configured providers are queried, and
 *     a provider that fails is reported as `unreachable`, never guessed.
 *   • Licence and free-tier facts come from the local catalogue and the
 *     provider's own `/models` payload; nothing is invented. When a fact is
 *     unknown it is reported as `unknown`.
 *
 * Output is persisted two ways, both additive:
 *   1. `Metric` rows (`ai.model-discovery.<provider>`) so the existing
 *      observability dashboards can chart discovery counts.
 *   2. A JSON report under `docs/discovery/` (or `$DISCOVERY_REPORT_DIR`) so a
 *      human can review licences and hardware requirements before adoption.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPEN_SOURCE_MODELS } from '@/lib/open-source-models';
import { FREE_PROVIDER_CATALOGUES, freeProviderSpecsFromEnvironment } from '@/lib/ai-router/free-provider-specs';
import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';

export interface DiscoveredModel {
  provider: string;
  modelId: string;
  /** True when the platform already routes to this model id. */
  alreadyKnown: boolean;
  /** Open-weight family when the id maps to a catalogued open model. */
  family: string | null;
  license: string | null;
  contextLength: number | null;
  capabilities: string[];
  /** Free-tier status is `quota_based` unless the adapter enforces $0 pricing. */
  freeStatus: 'verified_zero_price' | 'quota_based' | 'unknown';
}

export interface ProviderDiscovery {
  provider: string;
  status: 'ok' | 'unreachable' | 'not_configured';
  source: string;
  models: DiscoveredModel[];
  error?: string;
}

export interface WeeklyDiscoveryReport {
  generatedAt: string;
  /** Catalogue version the comparison ran against. */
  catalogueSize: number;
  providers: ProviderDiscovery[];
  /** Models seen live that the platform does not route yet. */
  newModels: DiscoveredModel[];
  /** Models the platform routes that the provider no longer advertises. */
  deprecatedModels: Array<{ provider: string; modelId: string }>;
  /** Open-weight catalogue entries with permissive licences, for review. */
  permissiveOpenWeight: Array<{ id: string; name: string; license: string; family: string }>;
  recommendations: Array<{ type: 'adopt' | 'review' | 'retire' | 'security'; detail: string }>;
  /** Explicit limitations of this run — never omitted. */
  limitations: string[];
}

const PERMISSIVE_LICENSES = ['apache-2.0', 'mit', 'bsd-3-clause', 'bsd-2-clause', 'openrail'];

function normaliseLicense(license: string): string {
  return license.trim().toLowerCase();
}

function isPermissive(license: string): boolean {
  const value = normaliseLicense(license);
  return PERMISSIVE_LICENSES.some((permitted) => value.startsWith(permitted));
}

/** Map a provider model id onto a catalogued open-weight model, if any. */
function matchOpenModel(modelId: string): (typeof OPEN_SOURCE_MODELS)[number] | null {
  const needle = modelId.toLowerCase();
  // Longest catalogue id that appears in the live id wins, so
  // "qwen3-32b-instruct" prefers "qwen3-32b" over "qwen".
  const candidates = OPEN_SOURCE_MODELS
    .filter((model) => needle.includes(model.id.toLowerCase()))
    .sort((a, b) => b.id.length - a.id.length);
  return candidates[0] ?? null;
}

/**
 * Query a configured provider's `/models` endpoint. Read-only; short timeout;
 * failures are reported, never thrown.
 */
async function probeProvider(
  spec: { id: string; label: string; baseUrl: string; apiKey: string; source: string },
  timeoutMs: number,
): Promise<ProviderDiscovery> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${spec.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${spec.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        provider: spec.id,
        status: 'unreachable',
        source: spec.source,
        models: [],
        error: `HTTP ${response.status}`,
      };
    }
    const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const known = new Set((FREE_PROVIDER_CATALOGUES[spec.id] ?? []).map((model) => model.id));
    const models: DiscoveredModel[] = rows
      .map((row) => (typeof row.id === 'string' ? row.id : null))
      .filter((id): id is string => Boolean(id))
      .map((modelId) => {
        const openModel = matchOpenModel(modelId);
        return {
          provider: spec.id,
          modelId,
          alreadyKnown: known.has(modelId),
          family: openModel?.family ?? null,
          license: openModel?.license ?? null,
          contextLength:
            typeof (rows.find((row) => row.id === modelId)?.context_length) === 'number'
              ? (rows.find((row) => row.id === modelId)!.context_length as number)
              : openModel?.contextLength ?? null,
          capabilities: openModel?.capabilities ?? [],
          // Quota-based vendors never claim $0 pricing here; only adapters with
          // a strict upstream pricing gate are `verified_zero_price`.
          freeStatus: 'quota_based' as const,
        };
      });
    return { provider: spec.id, status: 'ok', source: spec.source, models };
  } catch (error) {
    return {
      provider: spec.id,
      status: 'unreachable',
      source: spec.source,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the weekly report. Pure with respect to the database when
 * `persist: false` (used by unit tests and dry runs).
 */
export async function buildWeeklyDiscoveryReport(options: {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  now?: Date;
} = {}): Promise<WeeklyDiscoveryReport> {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const specs = freeProviderSpecsFromEnvironment(env);
  const discoveries = await Promise.all(specs.map((spec) => probeProvider(spec, timeoutMs)));

  const newModels: DiscoveredModel[] = [];
  for (const discovery of discoveries) {
    for (const model of discovery.models) {
      if (!model.alreadyKnown) newModels.push(model);
    }
  }

  // Deprecation check compares the *configured* catalogue against what the
  // provider currently advertises. Only providers that answered are compared.
  const deprecatedModels: Array<{ provider: string; modelId: string }> = [];
  for (const discovery of discoveries) {
    if (discovery.status !== 'ok') continue;
    const live = new Set(discovery.models.map((model) => model.modelId));
    for (const configured of FREE_PROVIDER_CATALOGUES[discovery.provider] ?? []) {
      if (!live.has(configured.id)) deprecatedModels.push({ provider: discovery.provider, modelId: configured.id });
    }
  }

  const permissiveOpenWeight = OPEN_SOURCE_MODELS
    .filter((model) => isPermissive(model.license))
    .map((model) => ({ id: model.id, name: model.name, license: model.license, family: model.family }));

  const recommendations: WeeklyDiscoveryReport['recommendations'] = [];
  for (const model of newModels.slice(0, 40)) {
    recommendations.push({
      type: 'review',
      detail: `${model.provider} advertises "${model.modelId}" which the platform does not route yet. Verify licence, tool-calling and commercial terms before adding it to a provider catalogue.`,
    });
  }
  for (const stale of deprecatedModels) {
    recommendations.push({
      type: 'retire',
      detail: `${stale.provider} no longer lists "${stale.modelId}". Route it away or confirm the endpoint still serves it.`,
    });
  }
  for (const discovery of discoveries.filter((row) => row.status === 'unreachable')) {
    recommendations.push({
      type: 'security',
      detail: `${discovery.provider} could not be reached (${discovery.error ?? 'unknown error'}). Its free-tier status is unknown; do not treat it as verified-free.`,
    });
  }

  const limitations: string[] = [];
  if (specs.length === 0) {
    limitations.push('No free provider credentials are configured in this environment, so no live catalogue was queried.');
  }
  limitations.push(
    'Licence and hardware facts for open-weight models come from the local catalogue (src/lib/open-source-models.ts), not from a live licence feed.',
  );
  limitations.push(
    'A model reported as new is a candidate for review only. Nothing is registered, routed or activated by this job.',
  );
  limitations.push(
    'Free-tier quotas are operator-verified facts. This job does not infer a zero-price tier from a model id.',
  );

  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    catalogueSize: OPEN_SOURCE_MODELS.length,
    providers: discoveries,
    newModels,
    deprecatedModels,
    permissiveOpenWeight,
    recommendations,
    limitations,
  };
}

/** Persist the report to a reviewable file and record metrics. Never mutates config. */
export async function persistWeeklyDiscoveryReport(
  report: WeeklyDiscoveryReport,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ filePath: string; metricsWritten: number }> {
  const env = options.env ?? process.env;
  const directory = env.DISCOVERY_REPORT_DIR?.trim() || join(process.cwd(), 'docs', 'discovery');
  const stamp = report.generatedAt.slice(0, 10);
  const filePath = join(directory, `model-discovery-${stamp}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  let metricsWritten = 0;
  for (const provider of report.providers) {
    try {
      await db.metric.create({
        data: {
          name: `ai.model-discovery.${provider.provider}`,
          value: provider.models.length,
          labels: JSON.stringify({ status: provider.status, newModels: report.newModels.filter((m) => m.provider === provider.provider).length }),
          unit: 'models',
          metricType: 'ai_discovery',
        },
      });
      metricsWritten += 1;
    } catch {
      // Metrics are observability, never a reason to fail the report.
    }
  }

  await writeAuditEvent({
    action: 'ai.model_discovery.completed',
    resource: 'model_discovery_report',
    details: {
      generatedAt: report.generatedAt,
      providers: report.providers.map((provider) => ({ provider: provider.provider, status: provider.status, models: provider.models.length })),
      newModels: report.newModels.length,
      deprecatedModels: report.deprecatedModels.length,
      filePath,
      activatedAnyModel: false,
    },
  }).catch(() => undefined);

  return { filePath, metricsWritten };
}

/** Entry point used by the cron job. */
export async function runWeeklyModelDiscovery(env: NodeJS.ProcessEnv = process.env): Promise<{
  generatedAt: string;
  providersQueried: number;
  newModels: number;
  deprecatedModels: number;
  filePath: string;
}> {
  const report = await buildWeeklyDiscoveryReport({ env });
  const { filePath } = await persistWeeklyDiscoveryReport(report, { env });
  return {
    generatedAt: report.generatedAt,
    providersQueried: report.providers.filter((provider) => provider.status !== 'not_configured').length,
    newModels: report.newModels.length,
    deprecatedModels: report.deprecatedModels.length,
    filePath,
  };
}
