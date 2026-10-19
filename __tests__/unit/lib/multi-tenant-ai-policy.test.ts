import { describe, expect, it } from 'vitest';
import { assessCandidate, orderEligibleCandidates, type CandidateModel } from '@/lib/multi-tenant-ai/policy';

const NOW = new Date('2026-10-19T06:00:00.000Z');

function candidate(overrides: Partial<CandidateModel> = {}): CandidateModel {
  return {
    providerConfigId: 'provider-1',
    providerKind: 'custom-self-hosted',
    providerName: 'Local model',
    routerName: 'local-model',
    companyId: 'company-a',
    isEnabled: true,
    isLocal: true,
    fallbackEligible: true,
    priority: 10,
    modelId: 'llama-local',
    capabilities: ['chat', 'code-generation', 'reasoning', 'vision', 'embedding', 'translation'],
    contextLength: 32_000,
    permissionAllowed: true,
    paidPermissionAllowed: false,
    routeKind: 'local',
    ...overrides,
  };
}

const opts = {
  profile: 'free_general' as const,
  requiredContextTokens: 1000,
  allowPaid: false,
  allowVerifiedFree: true,
  externalDataAllowed: false,
  quotaFreshnessNow: NOW,
};

describe('multi-tenant AI routing policy', () => {
  it('allows suitable local models without external data-processing approval', () => {
    expect(assessCandidate(candidate(), opts)).toMatchObject({ eligible: true, kind: 'local' });
  });

  it('treats an unverified external quota as unknown and ineligible', () => {
    const external = candidate({ isLocal: false, companyId: null, routeKind: 'verified_free' });
    expect(assessCandidate(external, { ...opts, externalDataAllowed: true })).toMatchObject({
      eligible: false,
      reason: 'provider_free_status_unknown',
    });
  });

  it('requires current provider verification, model-level evidence and a fresh provider-reported balance', () => {
    const external = candidate({
      isLocal: false,
      companyId: null,
      routeKind: 'verified_free',
      modelId: 'verified-model',
      verification: {
        officialDocsUrl: 'https://provider.example/docs/limits',
        verifiedAt: NOW,
        freeTierEligibility: 'verified_free',
        verifiedModels: JSON.stringify(['verified-model']),
        commercialUse: 'allowed',
        billingBehavior: 'no_automatic_billing',
      },
    });
    expect(assessCandidate(external, { ...opts, externalDataAllowed: true })).toMatchObject({ eligible: false, reason: 'provider_quota_unknown' });
    const withReportedQuota = { ...external, quota: { quotaKind: 'provider_reported_remaining', remainingRequests: 50, capturedAt: NOW } };
    expect(assessCandidate(withReportedQuota, { ...opts, externalDataAllowed: true })).toMatchObject({ eligible: true, kind: 'verified_free' });
    expect(assessCandidate({ ...withReportedQuota, modelId: 'other-model' }, { ...opts, externalDataAllowed: true })).toMatchObject({ eligible: false, reason: 'provider_verification_stale_or_incomplete' });
  });

  it('blocks paid routes unless the approved-paid profile and explicit paid permissions are present', () => {
    const paid = candidate({
      isLocal: false,
      companyId: 'company-a',
      routeKind: 'paid',
      paidPermissionAllowed: true,
      verification: {
        officialDocsUrl: 'https://provider.example/docs',
        freeTierEligibility: 'not_free',
        commercialUse: 'allowed',
        billingBehavior: 'no_automatic_billing',
        pricingEvidenceUrl: 'https://provider.example/pricing',
        pricingVerifiedAt: NOW,
        verifiedModelCosts: JSON.stringify([{ modelId: 'llama-local', costPerMillionTokens: 0.5 }]),
      },
      costPerMillionTokens: 0.5,
    });
    expect(assessCandidate(paid, { ...opts, externalDataAllowed: true, allowPaid: true })).toMatchObject({ eligible: false });
    expect(assessCandidate(paid, { ...opts, profile: 'approved_paid', externalDataAllowed: true, allowPaid: true })).toMatchObject({ eligible: true, kind: 'paid' });
  });

  it('blocks paid routing without current official per-model pricing evidence', () => {
    const paid = candidate({
      isLocal: false,
      companyId: 'company-a',
      routeKind: 'paid',
      paidPermissionAllowed: true,
      verification: { officialDocsUrl: 'https://provider.example/docs', freeTierEligibility: 'not_free', commercialUse: 'allowed', billingBehavior: 'no_automatic_billing' },
      costPerMillionTokens: 0.5,
    });
    expect(assessCandidate(paid, {
      ...opts,
      profile: 'approved_paid',
      externalDataAllowed: true,
      allowPaid: true,
    })).toMatchObject({ eligible: false, reason: 'paid_pricing_unverified' });
  });

  it('rejects stale or mismatched paid pricing records', () => {
    const baseVerification = {
      officialDocsUrl: 'https://provider.example/docs',
      pricingEvidenceUrl: 'https://provider.example/pricing',
      pricingVerifiedAt: NOW,
      commercialUse: 'allowed',
      billingBehavior: 'prepaid_only',
      verifiedModelCosts: JSON.stringify([{ modelId: 'llama-local', costPerMillionTokens: 0.5 }]),
    };
    const paid = candidate({
      isLocal: false,
      companyId: 'company-a',
      routeKind: 'paid',
      paidPermissionAllowed: true,
      verification: baseVerification,
      costPerMillionTokens: 0.6,
    });
    const paidOptions = { ...opts, profile: 'approved_paid' as const, externalDataAllowed: true, allowPaid: true };
    expect(assessCandidate(paid, paidOptions)).toMatchObject({ eligible: false, reason: 'paid_pricing_unverified' });
    expect(assessCandidate({
      ...paid,
      costPerMillionTokens: 0.5,
      verification: { ...baseVerification, pricingVerifiedAt: new Date('2026-09-01T00:00:00.000Z') },
    }, paidOptions)).toMatchObject({ eligible: false, reason: 'paid_pricing_unverified' });
  });

  it('orders local before verified-free and excludes unauthorized fallback candidates', () => {
    const local = candidate({ modelId: 'local', routeKind: 'local', isLocal: true, priority: 100 });
    const free = candidate({ modelId: 'free', routeKind: 'verified_free', isLocal: false, priority: 1 });
    const disallowedFallback = candidate({ modelId: 'not-a-fallback', routeKind: 'verified_free', isLocal: false, fallbackEligible: false, priority: 2 });
    const result = orderEligibleCandidates([
      { candidate: free, eligibility: { eligible: true, reason: 'verified', kind: 'verified_free' } },
      { candidate: disallowedFallback, eligibility: { eligible: true, reason: 'verified', kind: 'verified_free' } },
      { candidate: local, eligibility: { eligible: true, reason: 'local', kind: 'local' } },
    ]);
    expect(result.map((item) => item.modelId)).toEqual(['local', 'free']);
  });
});
