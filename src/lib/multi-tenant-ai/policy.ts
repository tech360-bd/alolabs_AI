import type { AICapability } from '@/lib/ai-router/types';

export const MODEL_ROUTING_PROFILES = [
  'local_fast',
  'local_general',
  'free_general',
  'free_coding',
  'free_reasoning',
  'free_vision',
  'free_embeddings',
  'free_translation',
  'approved_paid',
] as const;

export type ModelRoutingProfile = (typeof MODEL_ROUTING_PROFILES)[number];
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface ProfileDefinition {
  requiredCapabilities: AICapability[];
  localOnly: boolean;
  allowsVerifiedFree: boolean;
  permitsPaidWithAuthorization: boolean;
  defaultMaxOutputTokens: number;
}

export const ROUTING_PROFILE_DEFINITIONS: Record<ModelRoutingProfile, ProfileDefinition> = {
  local_fast: {
    requiredCapabilities: ['chat'], localOnly: true, allowsVerifiedFree: false, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 1024,
  },
  local_general: {
    requiredCapabilities: ['chat'], localOnly: true, allowsVerifiedFree: false, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  free_general: {
    requiredCapabilities: ['chat'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  free_coding: {
    requiredCapabilities: ['chat', 'code-generation'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  free_reasoning: {
    requiredCapabilities: ['chat', 'reasoning'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  free_vision: {
    requiredCapabilities: ['chat', 'vision'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  free_embeddings: {
    requiredCapabilities: ['embedding'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 1024,
  },
  free_translation: {
    requiredCapabilities: ['chat', 'translation'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: false, defaultMaxOutputTokens: 4096,
  },
  approved_paid: {
    requiredCapabilities: ['chat'], localOnly: false, allowsVerifiedFree: true, permitsPaidWithAuthorization: true, defaultMaxOutputTokens: 4096,
  },
};

export interface ProviderVerificationLike {
  officialDocsUrl?: string | null;
  verifiedAt?: Date | string | null;
  freeTierEligibility?: string | null;
  verifiedModels?: string | null;
  commercialUse?: string | null;
  billingBehavior?: string | null;
  pricingEvidenceUrl?: string | null;
  pricingVerifiedAt?: Date | string | null;
  verifiedModelCosts?: string | null;
}

export interface ProviderQuotaLike {
  quotaKind?: string | null;
  remainingRequests?: number | null;
  remainingTokens?: number | null;
  capturedAt?: Date | string | null;
  resetAt?: Date | string | null;
}

export interface CandidateModel {
  providerConfigId: string;
  providerKind: string;
  providerName: string;
  routerName: string;
  companyId: string | null;
  isEnabled: boolean;
  isLocal: boolean;
  fallbackEligible: boolean;
  priority: number;
  modelId: string;
  capabilities: string[];
  contextLength: number;
  costPerMillionTokens?: number;
  permissionAllowed: boolean;
  paidPermissionAllowed: boolean;
  routeKind?: 'local' | 'verified_free' | 'paid';
  verification?: ProviderVerificationLike | null;
  quota?: ProviderQuotaLike | null;
  estimatedUsageTokensSinceQuota?: number;
  estimatedRequestsSinceQuota?: number;
}

export interface RoutingEligibility {
  eligible: boolean;
  reason: string;
  kind?: 'local' | 'verified_free' | 'paid';
  locallyEstimatedRemainingTokens?: number | null;
  locallyEstimatedRemainingRequests?: number | null;
}

function parseDate(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function estimateTokens(messages: Array<{ content: string; imageUrls?: string[] }>): number {
  const textCharacters = messages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedImageTokens = messages.reduce((sum, message) => sum + (message.imageUrls?.length ?? 0) * 1024, 0);
  return Math.max(1, Math.ceil(textCharacters / 4) + estimatedImageTokens);
}

export function isFreeTierVerified(
  verification: ProviderVerificationLike | null | undefined,
  modelId: string,
  now = new Date(),
): boolean {
  if (!verification || verification.freeTierEligibility !== 'verified_free') return false;
  if (!verification.officialDocsUrl || verification.commercialUse !== 'allowed') return false;
  // Free quota is eligible only when billing cannot silently continue after the quota.
  if (verification.billingBehavior !== 'no_automatic_billing') return false;
  const verifiedAt = parseDate(verification.verifiedAt);
  if (verifiedAt === null || verifiedAt > now.getTime() || now.getTime() - verifiedAt > 30 * 24 * 60 * 60 * 1000) return false;
  try {
    const verifiedModels = JSON.parse(verification.verifiedModels || '[]') as unknown;
    if (!Array.isArray(verifiedModels) || !verifiedModels.includes(modelId)) return false;
  } catch {
    return false;
  }
  return true;
}

export function isFreshQuotaSnapshot(
  quota: ProviderQuotaLike | null | undefined,
  now = new Date(),
): boolean {
  if (!quota || quota.quotaKind !== 'provider_reported_remaining') return false;
  const capturedAt = parseDate(quota.capturedAt);
  return capturedAt !== null && capturedAt <= now.getTime() && now.getTime() - capturedAt <= 60 * 60 * 1000;
}

export function isPaidPricingVerified(
  verification: ProviderVerificationLike | null | undefined,
  modelId: string,
  configuredCostPerMillionTokens: number | undefined,
  now = new Date(),
): boolean {
  if (!verification || !verification.officialDocsUrl || !verification.pricingEvidenceUrl) return false;
  if (verification.commercialUse !== 'allowed') return false;
  if (!['no_automatic_billing', 'prepaid_only', 'manual_top_up'].includes(verification.billingBehavior ?? '')) return false;
  const pricingVerifiedAt = parseDate(verification.pricingVerifiedAt);
  if (pricingVerifiedAt === null || pricingVerifiedAt > now.getTime() || now.getTime() - pricingVerifiedAt > 30 * 24 * 60 * 60 * 1000) return false;
  if (configuredCostPerMillionTokens === undefined || configuredCostPerMillionTokens <= 0) return false;
  try {
    const prices = JSON.parse(verification.verifiedModelCosts || '[]') as unknown;
    if (!Array.isArray(prices)) return false;
    const price = prices.find((item) => item && typeof item === 'object' &&
      (item as Record<string, unknown>).modelId === modelId);
    if (!price || typeof (price as Record<string, unknown>).costPerMillionTokens !== 'number') return false;
    const verifiedCost = (price as Record<string, number>).costPerMillionTokens;
    return verifiedCost > 0 && Math.abs(verifiedCost - configuredCostPerMillionTokens) < 1e-9;
  } catch {
    return false;
  }
}

export function assessCandidate(
  candidate: CandidateModel,
  options: {
    profile: ModelRoutingProfile;
    requiredContextTokens: number;
    allowPaid: boolean;
    allowVerifiedFree: boolean;
    externalDataAllowed: boolean;
    quotaFreshnessNow?: Date;
  },
): RoutingEligibility {
  const profile = ROUTING_PROFILE_DEFINITIONS[options.profile];
  if (!candidate.isEnabled) return { eligible: false, reason: 'provider_disabled' };
  if (!candidate.permissionAllowed) return { eligible: false, reason: 'company_model_permission_missing' };
  if (candidate.contextLength > 0 && candidate.contextLength < options.requiredContextTokens) {
    return { eligible: false, reason: 'context_window_too_small' };
  }
  if (!profile.requiredCapabilities.every((capability) => candidate.capabilities.includes(capability))) {
    return { eligible: false, reason: 'required_capability_unavailable' };
  }

  if (candidate.isLocal) {
    return { eligible: true, reason: 'local_model', kind: 'local' };
  }
  if (profile.localOnly) return { eligible: false, reason: 'profile_requires_local_model' };
  if (!options.externalDataAllowed) return { eligible: false, reason: 'external_data_processing_not_authorized' };

  const freeVerified = isFreeTierVerified(candidate.verification, candidate.modelId, options.quotaFreshnessNow);
  if (!candidate.verification || candidate.verification.freeTierEligibility === 'unknown') {
    if (!options.allowPaid) return { eligible: false, reason: 'provider_free_status_unknown' };
  }
  if (candidate.verification?.freeTierEligibility === 'verified_free' && !freeVerified) {
    return { eligible: false, reason: 'provider_verification_stale_or_incomplete' };
  }
  if (freeVerified && options.allowVerifiedFree && profile.allowsVerifiedFree) {
    const quota = candidate.quota;
    if (!isFreshQuotaSnapshot(quota, options.quotaFreshnessNow)) {
      return { eligible: false, reason: 'provider_quota_unknown' };
    }
    const remainingTokens = quota?.remainingTokens == null
      ? null
      : quota.remainingTokens - (candidate.estimatedUsageTokensSinceQuota ?? 0);
    const remainingRequests = quota?.remainingRequests == null
      ? null
      : quota.remainingRequests - (candidate.estimatedRequestsSinceQuota ?? 0);
    const tokenCapacityKnown = remainingTokens !== null;
    const requestCapacityKnown = remainingRequests !== null;
    const enoughTokens = !tokenCapacityKnown || remainingTokens! >= options.requiredContextTokens;
    const hasRequests = !requestCapacityKnown || remainingRequests! > 0;
    if ((!tokenCapacityKnown && !requestCapacityKnown) || !enoughTokens || !hasRequests) {
      return {
        eligible: false,
        reason: 'provider_quota_exhausted_or_unknown',
        locallyEstimatedRemainingTokens: remainingTokens,
        locallyEstimatedRemainingRequests: remainingRequests,
      };
    }
    return {
      eligible: true,
      reason: 'verified_free_tier_with_reported_quota',
      kind: 'verified_free',
      locallyEstimatedRemainingTokens: remainingTokens,
      locallyEstimatedRemainingRequests: remainingRequests,
    };
  }

  if (options.allowPaid && profile.permitsPaidWithAuthorization && candidate.paidPermissionAllowed) {
    if (candidate.costPerMillionTokens === undefined || candidate.costPerMillionTokens <= 0) {
      return { eligible: false, reason: 'paid_model_cost_unknown' };
    }
    if (!isPaidPricingVerified(candidate.verification, candidate.modelId, candidate.costPerMillionTokens, options.quotaFreshnessNow)) {
      return { eligible: false, reason: 'paid_pricing_unverified' };
    }
    return { eligible: true, reason: 'super_admin_approved_paid_model', kind: 'paid' };
  }

  return { eligible: false, reason: 'provider_not_authorized_for_profile' };
}

/** Applies profile priority and excludes fallback-ineligible providers after the primary. */
export function orderEligibleCandidates(candidates: Array<{ candidate: CandidateModel; eligibility: RoutingEligibility }>): CandidateModel[] {
  const rank = (candidate: CandidateModel, kind: RoutingEligibility['kind']) => {
    if (candidate.isLocal || kind === 'local') return 0;
    if (kind === 'verified_free') return 1;
    return 2;
  };
  const ordered = candidates
    .filter(({ eligibility }) => eligibility.eligible)
    .sort((a, b) => rank(a.candidate, a.eligibility.kind) - rank(b.candidate, b.eligibility.kind) || a.candidate.priority - b.candidate.priority)
    .map(({ candidate }) => candidate);
  return ordered.filter((candidate, index) => index === 0 || candidate.fallbackEligible);
}
