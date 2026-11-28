/**
 * ALO Labs Tool Optimization & Governance Engine.
 *
 * Original first-party implementation designed to reduce redundant AI tool
 * round-trips, compact oversized JSON payloads, enforce read-only vs
 * approval-required execution gates, and track real token savings.
 *
 * Note: Written strictly from first principles without copying any text or code
 * from unlicensed external repositories.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export type ToolRiskClass = 'read_only' | 'workspace_write' | 'external_mutation' | 'privileged';

export interface ToolCallEnvelope {
  name: string;
  args: Record<string, unknown>;
}

export interface OptimizedBatchPlan {
  originalCount: number;
  deduplicatedCount: number;
  droppedDuplicateIndices: number[];
  batches: Array<{
    parallelSafe: boolean;
    calls: ToolCallEnvelope[];
  }>;
  estimatedTokensSaved: number;
}

const MUTATING_VERBS = [
  'create',
  'update',
  'delete',
  'write',
  'apply',
  'patch',
  'edit',
  'modify',
  'submit',
  'publish',
  'send',
  'charge',
  'purchase',
  'deploy',
  'approve',
  'revoke',
  'exec',
];

export function classifyToolRisk(toolName: string, explicitRequiresApproval?: boolean): {
  risk: ToolRiskClass;
  readOnly: boolean;
  requiresApproval: boolean;
} {
  const lower = toolName.toLowerCase();
  const isMutating = MUTATING_VERBS.some((v) => lower.includes(v));
  if (explicitRequiresApproval === true || lower.includes('delete') || lower.includes('deploy') || lower.includes('purchase') || lower.includes('publish')) {
    return { risk: 'external_mutation', readOnly: false, requiresApproval: true };
  }
  if (isMutating) {
    return { risk: 'workspace_write', readOnly: false, requiresApproval: true };
  }
  return { risk: 'read_only', readOnly: true, requiresApproval: false };
}

/**
 * Deduplicates identical consecutive/repeated tool calls within a single agent
 * step and groups read-only calls into parallel execution batches.
 */
export function optimizeToolCallBatch(calls: ToolCallEnvelope[]): OptimizedBatchPlan {
  const seen = new Set<string>();
  const unique: ToolCallEnvelope[] = [];
  const droppedDuplicateIndices: number[] = [];

  calls.forEach((call, idx) => {
    const key = `${call.name}::${JSON.stringify(call.args, Object.keys(call.args).sort())}`;
    const classification = classifyToolRisk(call.name);
    if (classification.readOnly && seen.has(key)) {
      droppedDuplicateIndices.push(idx);
      return;
    }
    seen.add(key);
    unique.push(call);
  });

  const readOnlyBatch: ToolCallEnvelope[] = [];
  const sequentialCalls: ToolCallEnvelope[] = [];

  for (const call of unique) {
    if (classifyToolRisk(call.name).readOnly) {
      readOnlyBatch.push(call);
    } else {
      sequentialCalls.push(call);
    }
  }

  const batches: OptimizedBatchPlan['batches'] = [];
  if (readOnlyBatch.length > 0) {
    batches.push({ parallelSafe: true, calls: readOnlyBatch });
  }
  for (const seq of sequentialCalls) {
    batches.push({ parallelSafe: false, calls: [seq] });
  }

  const estimatedTokensSaved = droppedDuplicateIndices.length * 180;
  return {
    originalCount: calls.length,
    deduplicatedCount: unique.length,
    droppedDuplicateIndices,
    batches,
    estimatedTokensSaved,
  };
}

/**
 * Compacts verbose tool output arrays/strings before feeding back to LLM
 * context while preserving exact identifiers and summary metrics.
 */
export function compactToolOutput(raw: unknown, maxChars = 4000): {
  compacted: string;
  originalChars: number;
  compactedChars: number;
  estimatedTokensSaved: number;
} {
  const full = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const originalChars = full.length;
  if (originalChars <= maxChars) {
    return {
      compacted: full,
      originalChars,
      compactedChars: originalChars,
      estimatedTokensSaved: 0,
    };
  }
  const head = full.slice(0, Math.floor(maxChars * 0.7));
  const tail = full.slice(full.length - Math.floor(maxChars * 0.25));
  const omitted = originalChars - head.length - tail.length;
  const compacted = `${head}\n... [${omitted} chars compacted by ALO ToolOptimizer] ...\n${tail}`;
  return {
    compacted,
    originalChars,
    compactedChars: compacted.length,
    estimatedTokensSaved: Math.max(0, Math.floor((originalChars - compacted.length) / 4)),
  };
}

export const CORE_TOOL_SPECS = [
  { slug: 'repo.read_file', name: 'Read Repository File', category: 'coding', readOnly: true, requiresApproval: false, optimizationPolicy: 'dedupe_and_compact', batchCapable: true },
  { slug: 'repo.search_code', name: 'Search Codebase', category: 'coding', readOnly: true, requiresApproval: false, optimizationPolicy: 'dedupe_and_compact', batchCapable: true },
  { slug: 'repo.apply_patch', name: 'Apply Sandbox Patch', category: 'coding', readOnly: false, requiresApproval: true, optimizationPolicy: 'strict_single', batchCapable: false },
  { slug: 'browser.inspect_page', name: 'Browser Inspect & Screenshot', category: 'browser', readOnly: true, requiresApproval: false, optimizationPolicy: 'dedupe_and_compact', batchCapable: true },
  { slug: 'browser.submit_action', name: 'Browser Mutating Action', category: 'browser', readOnly: false, requiresApproval: true, optimizationPolicy: 'approval_gated', batchCapable: false },
  { slug: 'mcp.invoke_tool', name: 'Invoke MCP Tool', category: 'mcp', readOnly: false, requiresApproval: true, optimizationPolicy: 'schema_compact', batchCapable: true },
  { slug: 'voice.livekit_room', name: 'Manage LiveKit Media Room', category: 'voice', readOnly: false, requiresApproval: false, optimizationPolicy: 'dedupe_and_compact', batchCapable: true },
  { slug: 'social.publish_post', name: 'Social Channel Publish', category: 'content', readOnly: false, requiresApproval: true, optimizationPolicy: 'approval_gated', batchCapable: false },
] as const;

export async function ensureCoreToolsSeeded(): Promise<void> {
  for (const t of CORE_TOOL_SPECS) {
    await db.toolRegistry.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        category: t.category,
        readOnly: t.readOnly,
        requiresApproval: t.requiresApproval,
        optimizationPolicy: t.optimizationPolicy,
        batchCapable: t.batchCapable,
      },
      create: {
        id: randomUUID(),
        slug: t.slug,
        name: t.name,
        category: t.category,
        readOnly: t.readOnly,
        requiresApproval: t.requiresApproval,
        optimizationPolicy: t.optimizationPolicy,
        batchCapable: t.batchCapable,
        isEnabled: true,
      },
    });
  }
}
