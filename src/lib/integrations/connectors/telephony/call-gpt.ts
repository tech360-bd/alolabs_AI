/**
 * Call GPT patterns — twilio-labs/call-gpt (MIT).
 *
 * License note: MIT (permissive). Call GPT is a generative-AI phone-call
 * toolkit using Twilio Media Streams (Deepgram ASR + GPT + TTS, function
 * calling, recording, transfer). This is a REUSE pattern adapter: it
 * exposes the Media Streams function-call shape as pure helpers. It does
 * NOT vendor Twilio code or require a Twilio account.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export interface CallGptFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Validate a Call-GPT-style function call (name + object args required). */
export function callGptValidateCall(c: CallGptFunctionCall): { ok: boolean; reason?: string } {
  if (!c.name) return { ok: false, reason: 'name is required' };
  if (typeof c.arguments !== 'object' || c.arguments === null) return { ok: false, reason: 'arguments must be an object' };
  return { ok: true };
}

export const callGptAdapter: ExternalSystemAdapter = {
  id: 'telephony.call-gpt',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'REUSE',
  description: 'Call GPT (MIT) — Twilio Media Streams voice-AI patterns: ASR → LLM → TTS + function calls',
  upstreamRepo: 'twilio-labs/call-gpt',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. Call-GPT patterns are local helpers (callGptValidateCall).',
    }));
  },
};
