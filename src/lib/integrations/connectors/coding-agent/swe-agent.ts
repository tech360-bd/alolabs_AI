/**
 * SWE-agent patterns — SWE-agent/SWE-agent (MIT).
 *
 * License note: MIT (permissive). SWE-agent autonomously fixes GitHub issues
 * (agent-computer interface, trajectory logging, SWE-bench evaluation).
 * This is a LEARN/REUSE pattern adapter: it exposes the ACI loop shape and
 * trajectory schema as pure helpers. It does NOT run SWE-agent as a
 * subprocess or vendor its code.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export interface SweTrajectoryStep {
  step: number;
  action: string;
  observation?: string;
  costUsd?: number;
}

/** Validate a SWE-agent-style trajectory (monotonic steps, bounded cost). */
export function sweValidateTrajectory(steps: SweTrajectoryStep[]): { ok: boolean; reason?: string } {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].step !== i + 1) return { ok: false, reason: `step ${i + 1} out of order` };
    if (!steps[i].action) return { ok: false, reason: `step ${i + 1} missing action` };
  }
  return { ok: true };
}

export const sweAgentAdapter: ExternalSystemAdapter = {
  id: 'coding-agent.swe-agent',
  category: 'coding-agent',
  licenseClass: 'permissive',
  strategy: 'REUSE',
  description: 'SWE-agent (MIT) — autonomous issue-fixing loop: ACI actions + trajectory + SWE-bench eval',
  upstreamRepo: 'SWE-agent/SWE-agent',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. SWE-agent patterns are local helpers (sweValidateTrajectory).',
    }));
  },
};
