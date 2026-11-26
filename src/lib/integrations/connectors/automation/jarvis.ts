/**
 * Jarvis patterns — jarvis.institute (proprietary, closed source).
 *
 * License note: Jarvis AI Assistant for Windows is proprietary. NO code is
 * vendored or reused. This is a LEARN adapter: it captures Jarvis's
 * product patterns (Ask → Plan → Act → Verify, approvals before sensitive
 * actions, local-first memory, privacy modes Strict/Guarded/Relaxed) as
 * pure helpers for AgentOS's command center.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export type JarvisPrivacyMode = 'strict' | 'guarded' | 'relaxed';

export interface JarvisApproval {
  action: string;
  sensitive: boolean;
  approved: boolean | null;
}

/** Jarvis rule: sensitive actions require explicit approval; auto-approve is off by default. */
export function jarvisRequiresApproval(a: JarvisApproval): boolean {
  return a.sensitive && a.approved !== true;
}

/** Jarvis privacy modes: strict = local-only, guarded = cloud with credential stripping, relaxed = cloud. */
export function jarvisAllowsCloud(mode: JarvisPrivacyMode): boolean {
  return mode !== 'strict';
}

export const jarvisAdapter: ExternalSystemAdapter = {
  id: 'automation.jarvis',
  category: 'automation',
  licenseClass: 'source-available',
  strategy: 'LEARN',
  description: 'Jarvis (proprietary) — LEARN only: Ask/Plan/Act/Verify + approvals + local-first memory patterns',
  upstreamRepo: 'https://jarvis.institute',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. Jarvis is proprietary; patterns only (jarvisRequiresApproval/jarvisAllowsCloud).',
    }));
  },
};
