/**
 * 10x-Tool-Calls loop — perrypixel/10x-Tool-Calls (NO LICENSE FILE).
 *
 * License note: the repository publishes NO license (GitHub API returns
 * `license: null`), which under default copyright means all rights reserved.
 * NO code from it is copied here. It is a ~3-commit Cursor/Windsurf rules
 * snippet whose only idea — loop follow-up input inside one tool-call
 * allowance instead of restarting the chat — is an uncopyrightable method.
 * This module is an independent clean-room implementation of that method,
 * so the strategy is LEARN, never REUSE.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export interface ToolLoopPolicy {
  maxTurns: number;
  stopOnEmptyInput: boolean;
  stopOnLimit: boolean;
}

export const DEFAULT_TOOL_LOOP_POLICY: ToolLoopPolicy = {
  maxTurns: 25,
  stopOnEmptyInput: true,
  stopOnLimit: true,
};

/** Decide whether the loop should continue given turns used + next input. */
export function toolLoopShouldContinue(
  policy: ToolLoopPolicy,
  turnsUsed: number,
  nextInput: string,
): { cont: boolean; reason: string } {
  if (turnsUsed >= policy.maxTurns) return { cont: false, reason: 'tool-call limit reached' };
  if (policy.stopOnEmptyInput && nextInput.trim().length === 0) return { cont: false, reason: 'empty input' };
  return { cont: true, reason: 'continue' };
}

export const toolLoopAdapter: ExternalSystemAdapter = {
  id: 'coding-agent.tool-loop',
  category: 'coding-agent',
  licenseClass: 'custom-model-license',
  strategy: 'LEARN',
  description: '10x-Tool-Calls (no license — clean-room pattern) — in-session follow-up loop that maximizes one tool-call allowance',
  upstreamRepo: 'perrypixel/10x-Tool-Calls',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. Tool-loop policy is a local helper (toolLoopShouldContinue).',
    }));
  },
};
