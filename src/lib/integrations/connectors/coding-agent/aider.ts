/**
 * Aider coding-agent patterns — Aider-AI/aider (Apache-2.0).
 *
 * License note: Apache-2.0 (permissive). Aider is AI pair programming in the
 * terminal (repomap, SEARCH/REPLACE edit formats, git-aware commits).
 * This is a LEARN/REUSE pattern adapter: it does NOT spawn Aider as a
 * subprocess. It exposes Aider's edit-format conventions and repomap
 * heuristics as pure helpers for AgentOS's coding agents.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

/** Aider SEARCH/REPLACE block (one hunk). */
export interface AiderHunk {
  file: string;
  search: string;
  replace: string;
}

/** Render hunks in Aider's SEARCH/REPLACE format for LLM prompts. */
export function aiderFormatHunks(hunks: AiderHunk[]): string {
  return hunks
    .map(
      (h) =>
        `<<<<<<< SEARCH\n${h.search}\n=======\n${h.replace}\n>>>>>>> REPLACE`,
    )
    .join('\n\n');
}

/** Parse Aider SEARCH/REPLACE blocks from model output. */
export function aiderParseHunks(text: string): AiderHunk[] {
  const hunks: AiderHunk[] = [];
  const re = /<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hunks.push({ file: '', search: m[1], replace: m[2] });
  }
  return hunks;
}

export const aiderAdapter: ExternalSystemAdapter = {
  id: 'coding-agent.aider',
  category: 'coding-agent',
  licenseClass: 'permissive',
  strategy: 'REUSE',
  description: 'Aider (Apache-2.0) — terminal pair-programming patterns: repomap + SEARCH/REPLACE edits',
  upstreamRepo: 'Aider-AI/aider',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'No remote service. Aider patterns are local helpers (aiderFormatHunks/aiderParseHunks).',
    }));
  },
};
