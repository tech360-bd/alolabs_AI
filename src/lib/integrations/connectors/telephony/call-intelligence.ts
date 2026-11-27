/**
 * Call Center Intelligence patterns — amulchapla/AI-Powered-Call-Center-Intelligence (MIT).
 *
 * License note: MIT code, but the reference architecture is Azure-dependent
 * (Azure OpenAI, Speech, Power BI) and therefore NOT free to run. This is a
 * LEARN adapter: it captures the post-call analytics pattern (transcribe →
 * sentiment/intent → Power BI-style dashboards) as pure helpers. No Azure
 * code is vendored.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export interface CallIntelligenceSummary {
  sentiment: 'positive' | 'neutral' | 'negative';
  intents: string[];
  actionItems: string[];
}

/** Validate a post-call intelligence summary. */
export function callIntelValidate(s: CallIntelligenceSummary): { ok: boolean; reason?: string } {
  if (!['positive', 'neutral', 'negative'].includes(s.sentiment)) return { ok: false, reason: 'invalid sentiment' };
  if (!Array.isArray(s.intents)) return { ok: false, reason: 'intents must be an array' };
  return { ok: true };
}

export const callIntelligenceAdapter: ExternalSystemAdapter = {
  id: 'telephony.call-intelligence',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'LEARN',
  description: 'Call Center Intelligence (MIT, Azure ref) — LEARN only: post-call sentiment/intent/action-items pattern',
  upstreamRepo: 'amulchapla/AI-Powered-Call-Center-Intelligence',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. Azure reference is not free; pattern only (callIntelValidate).',
    }));
  },
};
