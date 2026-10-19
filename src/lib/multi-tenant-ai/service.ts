import { randomUUID } from 'node:crypto';
import type { AIEmbeddingRequest, AIEmbeddingResponse, AIRequest, AIResponse, AIStreamChunk } from '@/lib/ai-router/types';
import { ensureRouterSynced } from '@/lib/ai-router';
import { isTrustedLocalProviderConfig } from '@/lib/ai-provider-catalog';
import { routerNameForConfig, type ProviderConfigRecord } from '@/lib/ai-router/provider-registry';
import { AIRouterError, AIModelNotFoundError } from '@/lib/ai-router/types';
import { db } from '@/lib/db';
import { agentCompanyScope } from '@/lib/agent-access';
import {
  assessCandidate,
  estimateTokens,
  orderEligibleCandidates,
  ROUTING_PROFILE_DEFINITIONS,
  type CandidateModel,
  type DataClassification,
  type ModelRoutingProfile,
  type RoutingEligibility,
} from './policy';

export interface CompanyAIActor {
  companyId: string;
  userId: string;
  role: string;
}

export interface CompanyAIRequestOptions {
  profile: ModelRoutingProfile;
  dataClassification?: 'confidential' | 'restricted';
  agentId?: string;
  departmentId?: string;
  workflowId?: string;
  runId?: string;
  taskId?: string;
  maxTokens?: number;
  /** Server-generated correlation key; never sourced from browser JSON. */
  requestId?: string;
}

export class CompanyAIError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) {
    super(message);
    this.name = 'CompanyAIError';
  }
}

const MAX_ROUTE_ATTEMPTS = 4;

interface PolicySnapshot {
  preferLocal: boolean;
  allowVerifiedFree: boolean;
  allowPaid: boolean;
  externalDataAllowed: boolean;
  maxOutputTokens: number;
  allowedProviderConfigIds: string[];
  fallbackBehavior: string;
}

interface PreparedRouting {
  requestId: string;
  profile: ModelRoutingProfile;
  classification: DataClassification;
  policy: PolicySnapshot;
  company: { id: string; status: string; paidApiAllowed: boolean };
  budget: { monthlyTokenBudget: number; dailyTokenBudget: number; maxPaidBudgetUsd: number; paidApiAllowed: boolean; autoBillingEnabled: boolean };
  companySettings: { externalDataProcessingApproved: boolean; confidentialDataExternalAllowed: boolean };
  candidates: CandidateModel[];
  rejected: Array<{ providerConfigId: string | null; modelId: string; reason: string }>;
  usage: { monthTokens: number; dayTokens: number; monthPaidUsd: number };
  employeeDailyTokenBudget: number | null;
}

function parseList(raw: string | null | undefined): string[] {
  try {
    const result = JSON.parse(raw || '[]') as unknown;
    return Array.isArray(result) ? result.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function modelCost(candidate: CandidateModel, tokens: number): number | null {
  if (candidate.costPerMillionTokens === undefined) return null;
  return tokens * candidate.costPerMillionTokens / 1_000_000;
}

function errorCodeOf(error: unknown): string {
  if (error instanceof AIModelNotFoundError) return 'MODEL_NOT_FOUND';
  if (error instanceof AIRouterError) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'UPSTREAM_UNAUTHORIZED';
    if (error.statusCode === 429) return 'RATE_LIMITED';
    if (error.statusCode && error.statusCode >= 500) return 'UPSTREAM_ERROR';
    return error.retryable ? 'RETRYABLE_UPSTREAM_ERROR' : 'PROVIDER_ERROR';
  }
  if (error instanceof Error && /timeout|abort|timed out/i.test(error.message)) return 'TIMEOUT';
  return 'MODEL_EXECUTION_FAILED';
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Provider request failed';
  return message.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1…').slice(0, 400);
}

function isProfile(value: string): value is ModelRoutingProfile {
  return Object.hasOwn(ROUTING_PROFILE_DEFINITIONS, value);
}

function quoteSafeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

/** Create a running attempt and its audit event before any provider request. */
async function startAttempt(input: {
  requestId: string;
  actor: CompanyAIActor;
  options: CompanyAIRequestOptions;
  candidate: CandidateModel;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd?: number | null;
}): Promise<string> {
  const row = await db.$transaction(async (transaction) => {
    const usage = await transaction.modelUsageRecord.create({
      data: {
        requestId: input.requestId,
        correlationId: input.requestId,
        companyId: input.actor.companyId,
        departmentId: input.options.departmentId ?? null,
        userId: input.actor.userId,
        agentId: input.options.agentId ?? null,
        workflowId: input.options.workflowId ?? null,
        providerConfigId: input.candidate.providerConfigId || null,
        provider: input.candidate.routerName,
        model: input.candidate.modelId,
        profile: input.options.profile,
        status: 'running',
        inputTokens: input.estimatedInputTokens,
        outputTokens: 0,
        totalTokens: 0,
        usageSource: 'unknown',
        estimatedCostUsd: input.estimatedCostUsd ?? null,
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        companyId: input.actor.companyId,
        action: 'ai.model_attempt.started',
        resource: 'model-usage-record',
        resourceId: usage.id,
        requestId: input.requestId,
        details: quoteSafeJson({ profile: input.options.profile, provider: input.candidate.routerName, model: input.candidate.modelId, estimatedInputTokens: input.estimatedInputTokens, estimatedOutputTokens: input.estimatedOutputTokens }),
      },
    });
    return usage;
  });
  return row.id;
}

async function finishAttempt(input: {
  recordId: string;
  requestId: string;
  actor: CompanyAIActor;
  candidate: CandidateModel;
  status: 'success' | 'failure' | 'blocked' | 'deferred';
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider_reported' | 'locally_estimated' | 'unknown';
  latencyMs?: number;
  estimatedCostUsd?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  rateLimitResponse?: boolean;
}): Promise<void> {
  await db.$transaction(async (transaction) => {
    await transaction.modelUsageRecord.update({
      where: { id: input.recordId },
      data: {
        status: input.status,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.inputTokens + input.outputTokens,
        usageSource: input.usageSource,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        latencyMs: input.latencyMs ?? null,
        rateLimitResponse: input.rateLimitResponse ?? false,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        companyId: input.actor.companyId,
        action: `ai.model_attempt.${input.status}`,
        resource: 'model-usage-record',
        resourceId: input.recordId,
        requestId: input.requestId,
        details: quoteSafeJson({ provider: input.candidate.routerName, model: input.candidate.modelId, status: input.status, inputTokens: input.inputTokens, outputTokens: input.outputTokens, usageSource: input.usageSource, estimatedCostUsd: input.estimatedCostUsd ?? null, errorCode: input.errorCode ?? null }),
      },
    });
  });
}

async function recordDeferred(input: {
  requestId: string;
  actor: CompanyAIActor;
  options: CompanyAIRequestOptions;
  providerConfigId?: string | null;
  provider?: string | null;
  model?: string | null;
  estimatedTokens: number;
  code: string;
  reason: string;
  status?: 'blocked' | 'deferred';
}): Promise<void> {
  await db.$transaction(async (transaction) => {
    const row = await transaction.modelUsageRecord.create({
      data: {
        requestId: input.requestId,
        correlationId: input.requestId,
        companyId: input.actor.companyId,
        departmentId: input.options.departmentId ?? null,
        userId: input.actor.userId,
        agentId: input.options.agentId ?? null,
        workflowId: input.options.workflowId ?? null,
        providerConfigId: input.providerConfigId ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        profile: input.options.profile,
        status: input.status ?? 'deferred',
        inputTokens: input.estimatedTokens,
        outputTokens: 0,
        totalTokens: 0,
        usageSource: 'unknown',
        errorCode: input.code,
        errorMessage: input.reason.slice(0, 500),
        completedAt: new Date(),
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        companyId: input.actor.companyId,
        action: `ai.request.${input.status ?? 'deferred'}`,
        resource: 'model-usage-record',
        resourceId: row.id,
        requestId: input.requestId,
        details: quoteSafeJson({ profile: input.options.profile, code: input.code, reason: input.reason, estimatedTokens: input.estimatedTokens }),
      },
    });
  });
}

async function validateAttribution(actor: CompanyAIActor, options: CompanyAIRequestOptions): Promise<number | null> {
  let employeeDailyTokenBudget: number | null = null;
  if (options.agentId) {
    const agent = await db.agent.findFirst({
      where: { id: options.agentId, ...agentCompanyScope(actor.companyId, 'execute') },
      select: { id: true, departmentId: true },
    });
    if (!agent) throw new CompanyAIError('Agent is not executable by this company', 404, 'NOT_FOUND');
    let identity: { departmentId: string; status: string; resourceLimits: string } | null;
    try {
      identity = await db.aIEmployeeIdentity.findFirst({
        where: { companyId: actor.companyId, agentDbId: agent.id },
        select: { departmentId: true, status: true, resourceLimits: true },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2021') identity = null;
      else throw error;
    }
    if (identity) {
      if (identity.departmentId !== agent.departmentId) throw new CompanyAIError('AI employee department assignment is inconsistent', 403, 'AI_EMPLOYEE_ASSIGNMENT_MISMATCH');
      if (identity.status === 'suspended' || identity.status === 'retired') throw new CompanyAIError(`AI employee identity is ${identity.status}`, 403, 'AI_EMPLOYEE_INACTIVE');
      if (!['provisioned', 'tested', 'active'].includes(identity.status)) throw new CompanyAIError('AI employee lifecycle status is invalid', 403, 'AI_EMPLOYEE_INVALID_STATUS');
      let limits: unknown;
      try { limits = JSON.parse(identity.resourceLimits); } catch { limits = null; }
      const dailyBudget = limits && typeof limits === 'object' && !Array.isArray(limits)
        ? (limits as Record<string, unknown>).dailyTokenBudget
        : null;
      if (!Number.isSafeInteger(dailyBudget) || (dailyBudget as number) < 1 || (dailyBudget as number) > 10_000_000) {
        throw new CompanyAIError('AI employee daily token budget policy is invalid', 403, 'AI_EMPLOYEE_INVALID_RESOURCE_POLICY');
      }
      employeeDailyTokenBudget = dailyBudget as number;
    }
  }
  if (options.departmentId) {
    const department = await db.department.findFirst({ where: { id: options.departmentId, companyId: actor.companyId }, select: { id: true } });
    if (!department) throw new CompanyAIError('Department is not available to this company', 404, 'NOT_FOUND');
  }
  return employeeDailyTokenBudget;
}

async function buildPreparedRouting(input: {
  actor: CompanyAIActor;
  options: CompanyAIRequestOptions;
  requiredContextTokens: number;
}): Promise<PreparedRouting> {
  if (!isProfile(input.options.profile)) throw new CompanyAIError('Unsupported routing profile', 400, 'INVALID_PROFILE');
  const employeeDailyTokenBudget = await validateAttribution(input.actor, input.options);
  const requestId = input.options.requestId ?? `ai_${randomUUID()}`;
  const classification: DataClassification = input.options.dataClassification === 'restricted' ? 'restricted' : 'confidential';
  const [company, companySettings, companyBudget, routingRow] = await Promise.all([
    db.company.findUnique({ where: { id: input.actor.companyId }, select: { id: true, status: true, paidApiAllowed: true } }),
    db.companySettings.findUnique({ where: { companyId: input.actor.companyId }, select: { externalDataProcessingApproved: true, confidentialDataExternalAllowed: true } }),
    db.companyBudget.findUnique({ where: { companyId: input.actor.companyId } }),
    db.modelRoutingPolicy.findFirst({ where: { companyId: input.actor.companyId, profile: input.options.profile } }),
  ]);
  if (!company || company.status !== 'active') throw new CompanyAIError('Company is not active', 403, 'COMPANY_INACTIVE', requestId);

  const profileDefinition = ROUTING_PROFILE_DEFINITIONS[input.options.profile];
  const policy: PolicySnapshot = {
    preferLocal: routingRow?.preferLocal ?? true,
    allowVerifiedFree: routingRow?.allowVerifiedFree ?? profileDefinition.allowsVerifiedFree,
    allowPaid: routingRow?.allowPaid ?? false,
    externalDataAllowed: routingRow?.externalDataAllowed ?? false,
    maxOutputTokens: routingRow?.maxOutputTokens ?? profileDefinition.defaultMaxOutputTokens,
    allowedProviderConfigIds: parseList(routingRow?.allowedProviderConfigIds),
    fallbackBehavior: routingRow?.fallbackBehavior ?? 'defer',
  };
  const budget = {
    monthlyTokenBudget: companyBudget?.monthlyTokenBudget ?? 1_000_000,
    dailyTokenBudget: companyBudget?.dailyTokenBudget ?? 50_000,
    maxPaidBudgetUsd: companyBudget?.maxPaidBudgetUsd ?? 0,
    paidApiAllowed: companyBudget?.paidApiAllowed ?? false,
    autoBillingEnabled: companyBudget?.autoBillingEnabled ?? false,
  };
  const settings = {
    externalDataProcessingApproved: companySettings?.externalDataProcessingApproved ?? false,
    confidentialDataExternalAllowed: companySettings?.confidentialDataExternalAllowed ?? false,
  };
  const externalDataAllowed = policy.externalDataAllowed && settings.externalDataProcessingApproved &&
    (classification === 'confidential' || classification === 'restricted'
      ? settings.confidentialDataExternalAllowed
      : true);
  const paidAllowed = policy.allowPaid && input.options.profile === 'approved_paid' && company.paidApiAllowed &&
    budget.paidApiAllowed && budget.maxPaidBudgetUsd > 0 && !budget.autoBillingEnabled;
  const tokens = Math.max(1, input.requiredContextTokens);
  const now = new Date();
  const [monthUsage, dayUsage, monthCost] = await Promise.all([
    db.modelUsageRecord.aggregate({ where: { companyId: input.actor.companyId, status: 'success', createdAt: { gte: startOfUtcMonth(now) } }, _sum: { totalTokens: true } }),
    db.modelUsageRecord.aggregate({ where: { companyId: input.actor.companyId, status: 'success', createdAt: { gte: startOfUtcDay(now) } }, _sum: { totalTokens: true } }),
    db.modelUsageRecord.aggregate({ where: { companyId: input.actor.companyId, status: { in: ['success', 'running'] }, createdAt: { gte: startOfUtcMonth(now) } }, _sum: { estimatedCostUsd: true } }),
  ]);
  const usage = {
    monthTokens: monthUsage._sum.totalTokens ?? 0,
    dayTokens: dayUsage._sum.totalTokens ?? 0,
    monthPaidUsd: monthCost._sum.estimatedCostUsd ?? 0,
  };

  const allowedIds = policy.allowedProviderConfigIds.length ? policy.allowedProviderConfigIds : undefined;
  const providerRows = await db.aIProviderConfig.findMany({
    where: {
      isEnabled: true,
      OR: [{ companyId: input.actor.companyId }, { companyId: null }],
      ...(allowedIds ? { id: { in: allowedIds } } : {}),
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  }) as ProviderConfigRecord[];
  const configIds = providerRows.map((row) => row.id);
  const [permissions, verifications, quotaSnapshots] = await Promise.all([
    configIds.length ? db.companyModelPermission.findMany({ where: { companyId: input.actor.companyId, providerConfigId: { in: configIds } } }) : Promise.resolve([]),
    configIds.length ? db.aIProviderVerification.findMany({ where: { providerConfigId: { in: configIds } }, orderBy: { verifiedAt: 'desc' } }) : Promise.resolve([]),
    configIds.length ? db.providerQuotaSnapshot.findMany({ where: { providerConfigId: { in: configIds }, quotaKind: 'provider_reported_remaining' }, orderBy: { capturedAt: 'desc' } }) : Promise.resolve([]),
  ]);
  const permissionByModel = new Map<string, (typeof permissions)[number]>();
  for (const permission of permissions) permissionByModel.set(`${permission.providerConfigId}:${permission.modelId}`, permission);
  const verificationByConfig = new Map<string, (typeof verifications)[number]>();
  for (const verification of verifications) if (!verificationByConfig.has(verification.providerConfigId)) verificationByConfig.set(verification.providerConfigId, verification);
  const quotaByConfig = new Map<string, (typeof quotaSnapshots)[number]>();
  for (const quota of quotaSnapshots) if (!quotaByConfig.has(quota.providerConfigId)) quotaByConfig.set(quota.providerConfigId, quota);
  const latestDates = Array.from(quotaByConfig.values()).map((snapshot) => snapshot.capturedAt.getTime());
  const earliestQuotaDate = latestDates.length ? new Date(Math.min(...latestDates)) : null;
  const usageSinceQuota = earliestQuotaDate && configIds.length
    ? await db.modelUsageRecord.findMany({
        where: { companyId: input.actor.companyId, providerConfigId: { in: configIds }, status: 'success', createdAt: { gte: earliestQuotaDate } },
        select: { providerConfigId: true, totalTokens: true, createdAt: true },
      })
    : [];
  const localUsageByProvider = new Map<string, { tokens: number; requests: number }>();
  for (const row of usageSinceQuota) {
    if (!row.providerConfigId) continue;
    const quota = quotaByConfig.get(row.providerConfigId);
    if (!quota || row.createdAt < quota.capturedAt) continue;
    const current = localUsageByProvider.get(row.providerConfigId) ?? { tokens: 0, requests: 0 };
    current.tokens += row.totalTokens;
    current.requests += 1;
    localUsageByProvider.set(row.providerConfigId, current);
  }

  const router = await ensureRouterSynced();
  const candidates: CandidateModel[] = [];
  const rejected: PreparedRouting['rejected'] = [];
  const canUsePaid = paidAllowed && profileDefinition.permitsPaidWithAuthorization;
  const canUseExternal = externalDataAllowed && !profileDefinition.localOnly &&
    ((policy.allowVerifiedFree && profileDefinition.allowsVerifiedFree) || canUsePaid);

  for (const row of providerRows) {
    const isLocal = isTrustedLocalProviderConfig(row.provider, row.baseUrl, row.isLocal);
    if (!isLocal && profileDefinition.localOnly) {
      rejected.push({ providerConfigId: row.id, modelId: '*', reason: 'profile_requires_local_model' });
      continue;
    }
    if (!isLocal && !canUseExternal) {
      rejected.push({ providerConfigId: row.id, modelId: '*', reason: 'external_data_processing_not_authorized' });
      continue;
    }
    if (!isLocal && row.companyId === null && !permissions.some((permission) => permission.providerConfigId === row.id && permission.isAllowed)) {
      rejected.push({ providerConfigId: row.id, modelId: '*', reason: 'company_model_permission_missing' });
      continue;
    }
    const routerName = routerNameForConfig(row);
    const provider = router.getProvider(routerName);
    if (!provider) continue;
    if (!provider.initialized) {
      try { await provider.initialize(); } catch { continue; }
    }
    for (const model of provider.supportedModels) {
      const permission = permissionByModel.get(`${row.id}:${model.id}`);
      const ownConfig = row.companyId === input.actor.companyId;
      const permissionAllowed = permission ? permission.isAllowed : ownConfig;
      const usageSince = localUsageByProvider.get(row.id);
      const candidate: CandidateModel = {
        providerConfigId: row.id,
        providerKind: row.provider,
        providerName: row.name,
        routerName: provider.name,
        companyId: row.companyId,
        isEnabled: row.isEnabled,
        isLocal,
        fallbackEligible: row.fallbackEligible,
        priority: row.priority,
        modelId: model.id,
        capabilities: model.capabilities,
        contextLength: model.contextLength,
        costPerMillionTokens: model.costPerMillionTokens,
        permissionAllowed,
        paidPermissionAllowed: permission?.allowPaid ?? false,
        verification: verificationByConfig.get(row.id) ? {
          ...verificationByConfig.get(row.id)!,
          verifiedModels: verificationByConfig.get(row.id)!.verifiedModels,
        } : null,
        quota: quotaByConfig.get(row.id) ?? null,
        estimatedUsageTokensSinceQuota: usageSince?.tokens ?? 0,
        estimatedRequestsSinceQuota: usageSince?.requests ?? 0,
      };
      const eligibility = assessCandidate(candidate, {
        profile: input.options.profile,
        requiredContextTokens: tokens,
        allowPaid: canUsePaid,
        allowVerifiedFree: policy.allowVerifiedFree,
        externalDataAllowed,
        quotaFreshnessNow: now,
      });
      if (!eligibility.eligible) rejected.push({ providerConfigId: row.id, modelId: model.id, reason: eligibility.reason });
      else candidates.push({ ...candidate, routeKind: eligibility.kind ?? (isLocal ? 'local' : 'verified_free') });
    }
  }

  // Platform-local environment providers (for example the configured local inference gateway)
  // are safe defaults. They need no external-data permission and no tenant credential grant.
  if (!allowedIds) {
    for (const summary of router.getProviderSummaries()) {
      if (summary.companyId !== undefined || !summary.provider || !summary.provider.toString()) continue;
      const provider = router.getProvider(summary.provider);
      if (!provider || providerRows.some((row) => routerNameForConfig(row) === provider.name)) continue;
      const isLocal = summary.isLocal;
      if (!isLocal) continue;
      if (!provider.initialized) {
        try { await provider.initialize(); } catch { continue; }
      }
      for (const model of provider.supportedModels) {
        const candidate: CandidateModel = {
          providerConfigId: '',
          providerKind: 'local-runtime',
          providerName: provider.name,
          routerName: provider.name,
          companyId: null,
          isEnabled: true,
          isLocal: true,
          fallbackEligible: true,
          priority: 0,
          modelId: model.id,
          capabilities: model.capabilities,
          contextLength: model.contextLength,
          costPerMillionTokens: model.costPerMillionTokens ?? 0,
          permissionAllowed: true,
          paidPermissionAllowed: false,
          routeKind: 'local',
        };
        const eligibility = assessCandidate(candidate, {
          profile: input.options.profile,
          requiredContextTokens: tokens,
          allowPaid: false,
          allowVerifiedFree: false,
          externalDataAllowed: false,
          quotaFreshnessNow: now,
        });
        if (eligibility.eligible) candidates.push(candidate);
        else rejected.push({ providerConfigId: null, modelId: model.id, reason: eligibility.reason });
      }
    }
  }

  return {
    requestId,
    profile: input.options.profile,
    classification,
    policy,
    company,
    budget,
    companySettings: settings,
    candidates,
    rejected,
    usage,
    employeeDailyTokenBudget,
  };
}

async function throwDeferred(
  prepared: PreparedRouting,
  actor: CompanyAIActor,
  options: CompanyAIRequestOptions,
  estimatedTokens: number,
  requestedModel?: string,
): Promise<never> {
  const reasons = prepared.rejected.map((candidate) => candidate.reason);
  const code = reasons.some((reason) => reason.includes('quota'))
    ? 'QUOTA_UNKNOWN_OR_EXHAUSTED'
    : reasons.includes('provider_free_status_unknown') || reasons.includes('provider_verification_stale_or_incomplete')
      ? 'FREE_TIER_STATUS_UNKNOWN'
      : reasons.includes('external_data_processing_not_authorized')
        ? 'EXTERNAL_DATA_NOT_AUTHORIZED'
        : 'NO_AUTHORIZED_MODEL';
  const reason = code === 'QUOTA_UNKNOWN_OR_EXHAUSTED'
    ? 'No verified free route has a fresh provider-reported remaining quota. The request was deferred; paid fallback is disabled.'
    : code === 'FREE_TIER_STATUS_UNKNOWN'
      ? 'The provider free-tier status is unknown, stale, or unverified. The request was deferred and no paid fallback was attempted.'
      : code === 'EXTERNAL_DATA_NOT_AUTHORIZED'
        ? 'External data processing is not approved for this company and data classification. The request was deferred.'
        : 'No model is currently authorized and capable for this company/profile. The request was deferred.';
  await recordDeferred({
    requestId: prepared.requestId,
    actor,
    options,
    provider: null,
    model: requestedModel ?? null,
    estimatedTokens,
    code,
    reason,
    status: 'deferred',
  });
  throw new CompanyAIError(reason, 503, code, prepared.requestId);
}

async function budgetAllows(
  prepared: PreparedRouting,
  actor: CompanyAIActor,
  options: CompanyAIRequestOptions,
  estimatedTokens: number,
): Promise<void> {
  if (prepared.usage.monthTokens + estimatedTokens > prepared.budget.monthlyTokenBudget ||
      prepared.usage.dayTokens + estimatedTokens > prepared.budget.dailyTokenBudget) {
    const reason = 'Company token budget is exhausted; the request was blocked before provider execution.';
    await recordDeferred({ requestId: prepared.requestId, actor, options, estimatedTokens, code: 'TOKEN_BUDGET_EXHAUSTED', reason, status: 'blocked' });
    throw new CompanyAIError(reason, 429, 'TOKEN_BUDGET_EXHAUSTED', prepared.requestId);
  }

  if (prepared.employeeDailyTokenBudget !== null && options.agentId) {
    const employeeUsage = await db.modelUsageRecord.aggregate({
      where: {
        companyId: actor.companyId,
        agentId: options.agentId,
        status: 'success',
        createdAt: { gte: startOfUtcDay() },
      },
      _sum: { totalTokens: true },
    });
    const used = employeeUsage._sum.totalTokens ?? 0;
    if (used + estimatedTokens > prepared.employeeDailyTokenBudget) {
      const reason = 'AI employee daily token budget is exhausted; no provider request was sent.';
      await recordDeferred({ requestId: prepared.requestId, actor, options, estimatedTokens, code: 'AI_EMPLOYEE_DAILY_BUDGET_EXHAUSTED', reason, status: 'blocked' });
      throw new CompanyAIError(reason, 429, 'AI_EMPLOYEE_DAILY_BUDGET_EXHAUSTED', prepared.requestId);
    }
  }
}

function buildContext(candidate: CandidateModel, prepared: PreparedRouting, actor: CompanyAIActor, options: CompanyAIRequestOptions, requestId: string, usageSource: 'provider_reported' | 'locally_estimated' | 'unknown') {
  return {
    requestId,
    userId: actor.userId,
    workflowId: options.workflowId,
    runId: options.runId,
    taskId: options.taskId,
    departmentId: options.departmentId,
    profile: options.profile,
    providerConfigId: candidate.providerConfigId || undefined,
    usageSource,
    usageManagedExternally: true,
    dataClassification: prepared.classification,
    allowedProviderNames: [candidate.routerName],
    allowedModelIds: [candidate.modelId],
    allowPaid: candidate.routeKind === 'paid' && candidate.paidPermissionAllowed && prepared.policy.allowPaid && prepared.company.paidApiAllowed && prepared.budget.paidApiAllowed && prepared.budget.maxPaidBudgetUsd > 0 && !prepared.budget.autoBillingEnabled,
    allowVerifiedFree: prepared.policy.allowVerifiedFree,
    preferLocal: true,
    allowFailover: false,
  };
}

function orderedChatCandidates(prepared: PreparedRouting, request: AIRequest, estimatedTotalTokens: number): CandidateModel[] {
  let candidates = orderEligibleCandidates(prepared.candidates.map((candidate) => ({
    candidate,
    eligibility: { eligible: true, reason: candidate.routeKind ?? 'verified_free', kind: candidate.routeKind } as RoutingEligibility,
  })));
  if (request.model) candidates = candidates.filter((candidate) => candidate.modelId === request.model);
  const requiresFunctionCalling = Boolean(request.tools?.length);
  const requiresStreaming = request.stream === true;
  candidates = candidates.filter((candidate) =>
    candidate.capabilities.includes('chat') &&
    (!requiresFunctionCalling || candidate.capabilities.includes('function-calling')) &&
    (!requiresStreaming || candidate.capabilities.includes('streaming')),
  );
  return candidates.filter((candidate) => {
    if (candidate.routeKind !== 'paid') return true;
    const estimatedCost = modelCost(candidate, estimatedTotalTokens);
    return estimatedCost !== null && prepared.usage.monthPaidUsd + estimatedCost <= prepared.budget.maxPaidBudgetUsd;
  });
}

/**
 * Media-generation calls are not yet represented by verified, billable model
 * capabilities in the central router. Record the deferred request and fail
 * closed rather than allowing legacy MEDIA_API_KEY environment calls to bypass
 * tenant approval, quota verification, and the paid budget.
 */
export async function deferCompanyAIMedia(input: {
  actor: CompanyAIActor;
  kind: 'image' | 'audio' | 'transcription' | 'video' | 'music';
  model?: string;
  estimatedTokens?: number;
  requestId?: string;
}): Promise<never> {
  const requestId = input.requestId ?? `media_${randomUUID()}`;
  const reason = `No centrally verified ${input.kind} capability is configured for this company. The request was deferred; no external provider was called.`;
  const options: CompanyAIRequestOptions = {
    profile: 'free_general',
    dataClassification: 'confidential',
    requestId,
  };
  await recordDeferred({
    requestId,
    actor: input.actor,
    options,
    model: input.model ?? null,
    estimatedTokens: Math.max(1, input.estimatedTokens ?? 1),
    code: 'MEDIA_CAPABILITY_UNAVAILABLE',
    reason,
    status: 'deferred',
  });
  throw new CompanyAIError(reason, 503, 'MEDIA_CAPABILITY_UNAVAILABLE', requestId);
}

export async function previewCompanyAIRoute(
  actor: CompanyAIActor,
  request: AIRequest,
  options: CompanyAIRequestOptions,
): Promise<{ requestId: string; available: boolean; selected?: { provider: string; model: string; routeKind: string; estimatedCostPerMillion?: number }; fallbacks: Array<{ provider: string; model: string; routeKind: string }>; reason?: string }> {
  const profile = ROUTING_PROFILE_DEFINITIONS[options.profile];
  const inputTokens = estimateTokens(request.messages);
  const maxOutputTokens = Math.min(request.maxTokens ?? profile.defaultMaxOutputTokens, profile.defaultMaxOutputTokens);
  const prepared = await buildPreparedRouting({ actor, options, requiredContextTokens: inputTokens + maxOutputTokens });
  const candidates = orderedChatCandidates(prepared, request, inputTokens + maxOutputTokens);
  if (!candidates.length) {
    return { requestId: prepared.requestId, available: false, fallbacks: [], reason: prepared.rejected.map((item) => item.reason).join(', ') || 'No authorized model is currently available.' };
  }
  const first = candidates[0];
  return {
    requestId: prepared.requestId,
    available: true,
    selected: { provider: first.routerName, model: first.modelId, routeKind: first.routeKind ?? 'unknown', estimatedCostPerMillion: first.costPerMillionTokens },
    fallbacks: candidates.slice(1).map((candidate) => ({ provider: candidate.routerName, model: candidate.modelId, routeKind: candidate.routeKind ?? 'unknown' })),
  };
}

export async function listCompanyAIModels(
  actor: CompanyAIActor,
  profile: ModelRoutingProfile = 'free_general',
): Promise<Array<{ id: string; name: string; provider: string; routeKind: string; capabilities: string[]; contextLength: number; costPerMillionTokens?: number }>> {
  const options: CompanyAIRequestOptions = { profile };
  const definition = ROUTING_PROFILE_DEFINITIONS[profile];
  const prepared = await buildPreparedRouting({ actor, options, requiredContextTokens: 1 });
  return orderEligibleCandidates(prepared.candidates.map((candidate) => ({
    candidate,
    eligibility: { eligible: true, reason: candidate.routeKind ?? 'verified_free', kind: candidate.routeKind } as RoutingEligibility,
  }))).map((candidate) => ({
    id: candidate.modelId,
    name: candidate.modelId,
    provider: candidate.routerName,
    routeKind: candidate.routeKind ?? (definition.localOnly ? 'local' : 'unknown'),
    capabilities: candidate.capabilities,
    contextLength: candidate.contextLength,
    costPerMillionTokens: candidate.costPerMillionTokens,
  }));
}

export async function executeCompanyAIChat(
  actor: CompanyAIActor,
  request: AIRequest,
  options: CompanyAIRequestOptions,
): Promise<{ response: AIResponse; requestId: string; provider: string; profile: ModelRoutingProfile; estimatedCostUsd: number | null; attempts: number; fallbackUsed: boolean }> {
  const profile = ROUTING_PROFILE_DEFINITIONS[options.profile];
  const inputTokens = estimateTokens(request.messages);
  const requestedOutputTokens = Math.min(request.maxTokens ?? profile.defaultMaxOutputTokens, profile.defaultMaxOutputTokens, 32_768);
  const prepared = await buildPreparedRouting({ actor, options, requiredContextTokens: inputTokens + requestedOutputTokens });
  const maxOutputTokens = Math.max(1, Math.min(requestedOutputTokens, prepared.policy.maxOutputTokens));
  const effectiveRequest = { ...request, model: request.model ?? '', maxTokens: maxOutputTokens };
  const estimatedTotalTokens = inputTokens + maxOutputTokens;
  await budgetAllows(prepared, actor, options, estimatedTotalTokens);

  const eligible = orderedChatCandidates(prepared, request, estimatedTotalTokens).slice(0, MAX_ROUTE_ATTEMPTS);
  if (!eligible.length) await throwDeferred(prepared, actor, options, estimatedTotalTokens, request.model);

  const router = await ensureRouterSynced();
  let lastError: unknown;
  let attempts = 0;
  for (const [attemptIndex, candidate] of eligible.entries()) {
    attempts += 1;
    const estimatedCostUsd = candidate.routeKind === 'paid' ? modelCost(candidate, estimatedTotalTokens) : 0;
    const recordId = await startAttempt({
      requestId: prepared.requestId,
      actor,
      options,
      candidate,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: maxOutputTokens,
      estimatedCostUsd,
    });
    const startedAt = Date.now();
    try {
      const response = await router.chat({ ...effectiveRequest, model: candidate.modelId }, actor.companyId, options.agentId, buildContext(candidate, prepared, actor, options, prepared.requestId, 'unknown'));
      const actualCost = candidate.isLocal || candidate.costPerMillionTokens === 0
        ? 0
        : modelCost(candidate, response.usage.totalTokens || response.usage.promptTokens + response.usage.completionTokens);
      await finishAttempt({
        recordId,
        requestId: prepared.requestId,
        actor,
        candidate,
        status: 'success',
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        usageSource: response.usageSource ?? 'unknown',
        latencyMs: Date.now() - startedAt,
        estimatedCostUsd: actualCost,
      });
      return { response, requestId: prepared.requestId, provider: candidate.routerName, profile: options.profile, estimatedCostUsd: actualCost, attempts, fallbackUsed: attemptIndex > 0 };
    } catch (error) {
      lastError = error;
      const code = errorCodeOf(error);
      await finishAttempt({
        recordId,
        requestId: prepared.requestId,
        actor,
        candidate,
        status: 'failure',
        inputTokens,
        outputTokens: 0,
        usageSource: 'unknown',
        latencyMs: Date.now() - startedAt,
        estimatedCostUsd: null,
        errorCode: code,
        errorMessage: safeErrorMessage(error),
        rateLimitResponse: code === 'RATE_LIMITED',
      });
      if (attemptIndex === eligible.length - 1) break;
    }
  }
  const code = errorCodeOf(lastError);
  const reason = code === 'RATE_LIMITED'
    ? 'Authorized free/local routes are rate-limited and no permitted fallback is available. The request was deferred.'
    : 'Authorized local/free routes could not complete the request. No paid fallback was attempted.';
  throw new CompanyAIError(reason, 503, code === 'RATE_LIMITED' ? 'RATE_LIMITED_DEFERRED' : 'AUTHORIZED_ROUTE_FAILED', prepared.requestId);
}

export async function* streamCompanyAIChat(
  actor: CompanyAIActor,
  request: AIRequest,
  options: CompanyAIRequestOptions,
): AsyncGenerator<AIStreamChunk> {
  const profile = ROUTING_PROFILE_DEFINITIONS[options.profile];
  const inputTokens = estimateTokens(request.messages);
  const requestedOutputTokens = Math.min(request.maxTokens ?? profile.defaultMaxOutputTokens, profile.defaultMaxOutputTokens, 32_768);
  const prepared = await buildPreparedRouting({ actor, options, requiredContextTokens: inputTokens + requestedOutputTokens });
  const maxOutputTokens = Math.max(1, Math.min(requestedOutputTokens, prepared.policy.maxOutputTokens));
  const estimatedTotalTokens = inputTokens + maxOutputTokens;
  await budgetAllows(prepared, actor, options, estimatedTotalTokens);
  const effectiveRequest = { ...request, model: request.model ?? '', maxTokens: maxOutputTokens, stream: true };
  const eligible = orderedChatCandidates(prepared, effectiveRequest, estimatedTotalTokens).slice(0, MAX_ROUTE_ATTEMPTS);
  if (!eligible.length) await throwDeferred(prepared, actor, options, estimatedTotalTokens, request.model);
  const router = await ensureRouterSynced();
  let lastError: unknown;

  for (const [attemptIndex, candidate] of eligible.entries()) {
    const estimatedCostUsd = candidate.routeKind === 'paid' ? modelCost(candidate, estimatedTotalTokens) : 0;
    const recordId = await startAttempt({
      requestId: prepared.requestId,
      actor,
      options,
      candidate,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: maxOutputTokens,
      estimatedCostUsd,
    });
    const startedAt = Date.now();
    let completionTokens = 0;
    try {
      for await (const chunk of router.streamChat(effectiveRequest, actor.companyId, options.agentId, buildContext(candidate, prepared, actor, options, prepared.requestId, 'locally_estimated'))) {
        if (chunk.content) completionTokens += Math.ceil(chunk.content.length / 4);
        yield chunk;
      }
      const actualCost = candidate.routeKind === 'paid' ? modelCost(candidate, inputTokens + completionTokens) : 0;
      await finishAttempt({
        recordId,
        requestId: prepared.requestId,
        actor,
        candidate,
        status: 'success',
        inputTokens,
        outputTokens: completionTokens,
        usageSource: 'locally_estimated',
        latencyMs: Date.now() - startedAt,
        estimatedCostUsd: actualCost,
      });
      return;
    } catch (error) {
      lastError = error;
      const code = errorCodeOf(error);
      await finishAttempt({
        recordId,
        requestId: prepared.requestId,
        actor,
        candidate,
        status: 'failure',
        inputTokens,
        outputTokens: completionTokens,
        usageSource: 'locally_estimated',
        latencyMs: Date.now() - startedAt,
        estimatedCostUsd: candidate.routeKind === 'paid' && completionTokens > 0 ? modelCost(candidate, inputTokens + completionTokens) : null,
        errorCode: code,
        errorMessage: safeErrorMessage(error),
        rateLimitResponse: code === 'RATE_LIMITED',
      });
      // A failover after emitting any tokens would duplicate/garble the response.
      if (completionTokens > 0 || attemptIndex === eligible.length - 1) break;
    }
  }
  const code = errorCodeOf(lastError);
  throw new CompanyAIError(
    code === 'RATE_LIMITED' ? 'Authorized local/free routes are rate-limited; the stream was deferred.' : 'Authorized routes could not complete the stream; paid fallback was not attempted.',
    503,
    code === 'RATE_LIMITED' ? 'RATE_LIMITED_DEFERRED' : 'AUTHORIZED_ROUTE_FAILED',
    prepared.requestId,
  );
}

export async function executeCompanyAIEmbeddings(
  actor: CompanyAIActor,
  request: AIEmbeddingRequest,
  options: Omit<CompanyAIRequestOptions, 'profile'> & { profile?: 'free_embeddings' },
): Promise<{ response: AIEmbeddingResponse; requestId: string; provider: string; estimatedCostUsd: number | null }> {
  const resolvedOptions: CompanyAIRequestOptions = { ...options, profile: 'free_embeddings' };
  const inputItems = Array.isArray(request.input) ? request.input : [request.input];
  const inputTokens = Math.max(1, Math.ceil(inputItems.reduce((total, value) => total + value.length, 0) / 4));
  const prepared = await buildPreparedRouting({ actor, options: resolvedOptions, requiredContextTokens: inputTokens });
  await budgetAllows(prepared, actor, resolvedOptions, inputTokens);
  let eligible = orderEligibleCandidates(prepared.candidates.map((candidate) => ({
    candidate,
    eligibility: { eligible: true, reason: candidate.routeKind ?? 'verified_free', kind: candidate.routeKind } as RoutingEligibility,
  }))).filter((candidate) => candidate.capabilities.includes('embedding'));
  if (request.model) eligible = eligible.filter((candidate) => candidate.modelId === request.model);
  eligible = eligible.slice(0, MAX_ROUTE_ATTEMPTS);
  if (!eligible.length) await throwDeferred(prepared, actor, resolvedOptions, inputTokens, request.model);

  const router = await ensureRouterSynced();
  let lastError: unknown;
  for (const [attemptIndex, candidate] of eligible.entries()) {
    const recordId = await startAttempt({ requestId: prepared.requestId, actor, options: resolvedOptions, candidate, estimatedInputTokens: inputTokens, estimatedOutputTokens: 0, estimatedCostUsd: candidate.routeKind === 'paid' ? modelCost(candidate, inputTokens) : 0 });
    const startedAt = Date.now();
    try {
      const response = await router.createEmbeddings({ ...request, model: candidate.modelId }, actor.companyId, options.agentId, buildContext(candidate, prepared, actor, resolvedOptions, prepared.requestId, 'unknown'));
      const actualCost = candidate.isLocal || candidate.costPerMillionTokens === 0
        ? 0
        : modelCost(candidate, response.usage.totalTokens);
      await finishAttempt({
        recordId, requestId: prepared.requestId, actor, candidate, status: 'success',
        inputTokens: response.usage.promptTokens, outputTokens: 0,
        usageSource: response.usageSource ?? 'unknown', latencyMs: Date.now() - startedAt, estimatedCostUsd: actualCost,
      });
      return { response, requestId: prepared.requestId, provider: candidate.routerName, estimatedCostUsd: actualCost };
    } catch (error) {
      lastError = error;
      const code = errorCodeOf(error);
      await finishAttempt({
        recordId, requestId: prepared.requestId, actor, candidate, status: 'failure', inputTokens, outputTokens: 0,
        usageSource: 'unknown', latencyMs: Date.now() - startedAt, estimatedCostUsd: null,
        errorCode: code, errorMessage: safeErrorMessage(error), rateLimitResponse: code === 'RATE_LIMITED',
      });
      if (attemptIndex === eligible.length - 1) break;
    }
  }
  const code = errorCodeOf(lastError);
  throw new CompanyAIError('Authorized embedding routes could not complete the request; paid fallback was not attempted.', 503, 'AUTHORIZED_ROUTE_FAILED', prepared.requestId);
}
