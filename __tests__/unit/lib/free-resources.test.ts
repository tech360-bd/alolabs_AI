import { describe, expect, it } from 'vitest';
import {
  FREE_RESOURCES,
  freeStackCoverage,
  immediatelyUsableResources,
  resourcesByCategory,
  trulyFreeResources,
} from '@/lib/free-resources';
import { defaultProviderBaseUrl, providerPreset } from '@/lib/ai-provider-catalog';

describe('curated free-resource catalogue', () => {
  it('covers the capability this deployment is actually missing: Bangla speech', () => {
    const tts = resourcesByCategory('speech-tts');
    const asr = resourcesByCategory('speech-asr');
    expect(tts.length).toBeGreaterThanOrEqual(2);
    expect(asr.length).toBeGreaterThanOrEqual(1);
    // Each speech option must be self-hostable, otherwise it is not a way out
    // of a paid-provider requirement.
    for (const resource of [...tts, ...asr]) {
      expect(resource.free, `${resource.id} must be genuinely free`).toBe('free');
      expect(resource.selfHostable, `${resource.id} must be self-hostable`).toBe(true);
    }
  });

  it('never labels a paid-only service as free', () => {
    const paidOnly = FREE_RESOURCES.filter((r) => r.free === 'no-free-tier');
    // Twilio is the important one: PSTN calling is never free, and saying
    // otherwise would be the exact dishonesty the owner prohibited.
    expect(paidOnly.map((r) => r.id)).toContain('twilio-trial');
    for (const resource of paidOnly) {
      expect(resource.selfHostable).toBe(false);
      expect(resource.freeAllowance).toMatch(/paid|not free|trial/i);
    }
  });

  it('gives every resource a verification URL and an honest caveat', () => {
    for (const resource of FREE_RESOURCES) {
      expect(resource.verifyUrl, `${resource.id} needs a verify URL`).toMatch(/^https:\/\//);
      expect(resource.caveat.trim().length, `${resource.id} needs a caveat`).toBeGreaterThan(20);
      expect(resource.usedBy.length, `${resource.id} must name where it plugs in`).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = FREE_RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only points AI provider entries at kinds the router can actually resolve', () => {
    for (const resource of FREE_RESOURCES) {
      const kinds = resource.usedBy
        .filter((u) => u.startsWith('AI_PROVIDER_PRESETS:'))
        .map((u) => u.split(':')[1].trim());
      for (const kind of kinds) {
        expect(providerPreset(kind), `${resource.id} references unknown provider kind ${kind}`).toBeDefined();
        expect(defaultProviderBaseUrl(kind), `${kind} needs a default base URL`).toBeTruthy();
      }
    }
  });

  it('separates what can be enabled today from what is only an option', () => {
    const usable = immediatelyUsableResources();
    const usableIds = usable.map((r) => r.id);
    // Env-var and preset-backed entries are usable now.
    expect(usableIds).toEqual(expect.arrayContaining(['piper', 'groq', 'ollama', 'sambanova']));
    // Listed-but-not-integrated entries must not appear as immediately usable.
    expect(usableIds).not.toContain('appwrite');
  });

  it('reports honest coverage counts', () => {
    const coverage = freeStackCoverage();
    expect(coverage.total).toBe(FREE_RESOURCES.length);
    expect(coverage.selfHostedUnlimited + coverage.hostedQuota + coverage.paidOnly).toBe(coverage.total);
    expect(coverage.paidOnly).toBeGreaterThanOrEqual(1);
    expect(coverage.caveat).toMatch(/cannot be obtained free/i);
  });

  it('identifies the unlimited self-hostable subset', () => {
    const free = trulyFreeResources();
    expect(free.length).toBeGreaterThan(0);
    for (const resource of free) {
      expect(resource.free).toBe('free');
      expect(resource.selfHostable).toBe(true);
    }
  });
});
