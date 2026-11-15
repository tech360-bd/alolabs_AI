import { describe, expect, it } from 'vitest';
import {
  autoBillingAllowedInMode,
  assertPaidProviderAllowed,
  effectivePaidBudgetUsd,
  freeOnlyAllowsRouteKind,
  freeOnlyModeDescription,
  isFreeOnlyMode,
  paidApiAllowedInMode,
  FREE_ONLY_PAID_PROVIDER_KINDS,
} from '@/lib/ai-router/free-only-mode';

describe('FREE-ONLY MODE switch', () => {
  it('is off by default so existing per-company policy keeps working', () => {
    expect(isFreeOnlyMode({})).toBe(false);
    expect(isFreeOnlyMode({ FREE_ONLY_MODE: '' })).toBe(false);
    expect(isFreeOnlyMode({ FREE_ONLY_MODE: 'false' })).toBe(false);
  });

  it('turns on for any accepted truthy spelling', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
      expect(isFreeOnlyMode({ FREE_ONLY_MODE: value })).toBe(true);
    }
  });

  it('honours the legacy LOCAL_ONLY switch', () => {
    expect(isFreeOnlyMode({ LOCAL_ONLY: 'true' })).toBe(true);
    expect(isFreeOnlyMode({ LOCAL_ONLY: 'false' })).toBe(false);
  });

  it('lets an explicit FREE_ONLY_MODE override LOCAL_ONLY', () => {
    expect(isFreeOnlyMode({ FREE_ONLY_MODE: 'false', LOCAL_ONLY: 'true' })).toBe(false);
    expect(isFreeOnlyMode({ FREE_ONLY_MODE: 'true', LOCAL_ONLY: 'false' })).toBe(true);
  });

  it('describes the active mode without claiming infrastructure is free', () => {
    const on = freeOnlyModeDescription({ FREE_ONLY_MODE: 'true' });
    expect(on).toContain('$0');
    expect(on).toContain('external AI inference');
    expect(freeOnlyModeDescription({})).toContain('OFF');
  });
});

describe('FREE-ONLY MODE cost ceiling', () => {
  it('never allows a paid route kind', () => {
    expect(freeOnlyAllowsRouteKind('paid')).toBe(false);
    expect(freeOnlyAllowsRouteKind('local')).toBe(true);
    expect(freeOnlyAllowsRouteKind('verified_free')).toBe(true);
    expect(freeOnlyAllowsRouteKind(undefined)).toBe(true);
  });

  it('forces the paid budget ceiling to $0 when on', () => {
    expect(effectivePaidBudgetUsd(500, { FREE_ONLY_MODE: 'true' })).toBe(0);
    expect(effectivePaidBudgetUsd(500, {})).toBe(500);
  });

  it('overrides per-company paid permission when on', () => {
    expect(paidApiAllowedInMode(true, { FREE_ONLY_MODE: 'true' })).toBe(false);
    expect(paidApiAllowedInMode(true, {})).toBe(true);
    expect(paidApiAllowedInMode(false, {})).toBe(false);
  });

  it('forbids automatic billing when on', () => {
    expect(autoBillingAllowedInMode({ FREE_ONLY_MODE: 'true' })).toBe(false);
    expect(autoBillingAllowedInMode({})).toBe(true);
  });
});

describe('FREE-ONLY MODE provider registration guard', () => {
  it('refuses metered provider kinds when the mode is on', () => {
    for (const kind of ['openai', 'openrouter', 'groq', 'deepseek', 'mistral', 'qwen', 'cohere']) {
      expect(FREE_ONLY_PAID_PROVIDER_KINDS.has(kind)).toBe(true);
      expect(() => assertPaidProviderAllowed(kind, { FREE_ONLY_MODE: 'true' })).toThrow(/FREE-ONLY MODE/);
    }
  });

  it('allows local and verified-free adapters', () => {
    for (const kind of ['ollama', 'llama-cpp', 'openrouter-free', 'unorouter-free', 'openai-compatible-free', 'custom-self-hosted']) {
      expect(() => assertPaidProviderAllowed(kind, { FREE_ONLY_MODE: 'true' })).not.toThrow();
    }
  });

  it('does not block anything when the mode is off', () => {
    expect(() => assertPaidProviderAllowed('openai', {})).not.toThrow();
  });
});
