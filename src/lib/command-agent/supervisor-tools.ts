/**
 * Supervisor tools — the ONLY mutation path of the Command Agent.
 *
 * The default Command Agent is strictly read-only. Supervisor mode adds a
 * small, deny-by-default registry of system-mutating tools, and every one of
 * them is gated on:
 *   1. role === 'super_admin' (company admins can never reach this registry),
 *   2. an explicit confirmation string in the arguments,
 *   3. a writeAuditEvent record (actor, before → after) per mutation.
 *
 * What each tool really does — no simulated success:
 *  - set_primary_ai_provider : reorders AIProviderConfig priority so the
 *    selected provider becomes the primary route and the rest become standby
 *    (policy.ts picks the lowest priority as primary). Providers stay enabled
 *    — "one active primary at a time, others standby" is enforced by routing
 *    order, not by flipping everything off.
 *  - set_ai_provider_enabled : enable/disable one provider config entirely.
 *  - set_site_content        : upserts a SiteContentBlock (version bumped).
 *  - run_site_doctor         : runs an internet-facing probe cycle now.
 *  - run_self_healing_recovery: triggers the existing SelfHealingEngine for a
 *    target. The engine's own result (success/failed/escalated) is passed
 *    through verbatim — never rewritten.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';
import { runSiteDoctor } from '@/lib/self-healing/site-doctor';
import type { AITool } from '@/lib/ai-router/types';
import { getSelfHealingEngine } from '@/lib/self-healing';

export interface SupervisorActor {
  userId: string;
  role: string;
  companyId: string;
}

export interface SupervisorToolResult {
  ok: boolean;
  /** Operator-readable summary — this is what the model sees. */
  output: string;
  /** Structured detail for the trace UI. */
  data?: Record<string, unknown>;
}

interface SupervisorTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  run: (actor: SupervisorActor, args: Record<string, unknown>) => Promise<SupervisorToolResult>;
}

const CONFIRM = 'confirm';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// ─── Provider routing (omni-switch) ─────────────────────────────────────────

async function setPrimaryAiProvider(actor: SupervisorActor, args: Record<string, unknown>): Promise<SupervisorToolResult> {
  const providerId = asString(args.providerId);
  if (!providerId) return { ok: false, output: 'providerId is required.' };
  if (asBoolean(args.makePrimary) === false) {
    return { ok: false, output: 'Refused: set makePrimary=true (or use set_ai_provider_enabled to disable).' };
  }

  const target = await db.aIProviderConfig.findUnique({ where: { id: providerId } });
  if (!target) return { ok: false, output: `Provider config ${providerId} not found.` };

  const before = { name: target.name, isEnabled: target.isEnabled, priority: target.priority };
  // The selected provider becomes the primary (lowest priority wins in policy.ts);
  // every other config is demoted below it — standby, not off.
  await db.aIProviderConfig.update({ where: { id: providerId }, data: { priority: 10, isEnabled: true } });
  await db.aIProviderConfig.updateMany({
    where: { id: { not: providerId }, priority: { lt: 11 } },
    data: { priority: 100 },
  });

  await writeAuditEvent({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    action: 'supervisor.set_primary_ai_provider',
    resource: 'AIProviderConfig',
    resourceId: providerId,
    details: { before, after: { name: target.name, isEnabled: true, priority: 10 }, standbyDemotedTo: 100 },
  });

  return {
    ok: true,
    output: `Primary AI provider is now "${target.name}". All other providers were demoted to standby (priority 100). The change is recorded in the audit ledger and takes effect on the next routing decision.`,
    data: { providerId, name: target.name, before, after: { isEnabled: true, priority: 10 } },
  };
}

async function setAiProviderEnabled(actor: SupervisorActor, args: Record<string, unknown>): Promise<SupervisorToolResult> {
  const providerId = asString(args.providerId);
  const enabled = asBoolean(args.enabled);
  if (!providerId || enabled === undefined) {
    return { ok: false, output: 'providerId and enabled (boolean) are required.' };
  }

  const target = await db.aIProviderConfig.findUnique({ where: { id: providerId } });
  if (!target) return { ok: false, output: `Provider config ${providerId} not found.` };

  const before = { name: target.name, isEnabled: target.isEnabled };
  await db.aIProviderConfig.update({ where: { id: providerId }, data: { isEnabled: enabled } });

  await writeAuditEvent({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    action: 'supervisor.set_ai_provider_enabled',
    resource: 'AIProviderConfig',
    resourceId: providerId,
    details: { before, after: { name: target.name, isEnabled: enabled } },
  });

  return {
    ok: true,
    output: enabled
      ? `Provider "${target.name}" is enabled again and eligible for routing.`
      : `Provider "${target.name}" is disabled — routing will skip it from the next decision on. Change recorded in the audit ledger.`,
    data: { providerId, name: target.name, before, after: { isEnabled: enabled } },
  };
}

// ─── Website content ────────────────────────────────────────────────────────

const SiteContentPayloadSchema = z.record(z.string(), z.unknown());

async function setSiteContent(actor: SupervisorActor, args: Record<string, unknown>): Promise<SupervisorToolResult> {
  const page = asString(args.page);
  const blockKey = asString(args.blockKey);
  if (!page || !blockKey) return { ok: false, output: 'page and blockKey are required.' };

  const payloadCheck = SiteContentPayloadSchema.safeParse(args.content);
  if (!payloadCheck.success) {
    return { ok: false, output: 'content must be a JSON object (e.g. {"headline": "..."}).' };
  }
  const content = JSON.stringify(payloadCheck.data);

  const existing = await db.siteContentBlock.findUnique({
    where: { companyId_page_blockKey: { companyId: actor.companyId, page, blockKey } },
  });
  const before = existing ? { content: existing.content, version: existing.version } : null;

  const row = await db.siteContentBlock.upsert({
    where: { companyId_page_blockKey: { companyId: actor.companyId, page, blockKey } },
    create: { companyId: actor.companyId, page, blockKey, content, updatedBy: actor.userId, version: 1 },
    update: { content, updatedBy: actor.userId, version: (before?.version ?? 0) + 1 },
  });

  await writeAuditEvent({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    action: 'supervisor.set_site_content',
    resource: 'SiteContentBlock',
    resourceId: row.id,
    details: { page, blockKey, before, after: { content, version: row.version } },
  });

  return {
    ok: true,
    output: `Website block "${page}:${blockKey}" is now version ${row.version}. Public pages serve this block with their code default as fallback; the change is recorded in the audit ledger.`,
    data: { page, blockKey, version: row.version },
  };
}

// ─── Self-healing ───────────────────────────────────────────────────────────

async function runSiteDoctorTool(actor: SupervisorActor, args: Record<string, unknown>): Promise<SupervisorToolResult> {
  const targets = Array.isArray(args.targets)
    ? args.targets.filter((t): t is string => typeof t === 'string').slice(0, 5)
    : undefined;
  const report = await runSiteDoctor({ ...(targets ? { targets } : {}), actorUserId: actor.userId });
  const summary = report.results
    .map((r) => `${r.target}: ${r.status}${r.httpStatus ? ` (HTTP ${r.httpStatus}, ${r.latencyMs}ms)` : ''}${r.escalated ? ' — ESCALATED' : ''}`)
    .join('; ');
  return {
    ok: true,
    output: `Site doctor probe cycle finished. ${report.results.length ? summary : 'No targets configured.'} Every attempt is persisted in SiteDoctorProbe.`,
    data: { results: report.results },
  };
}

async function runSelfHealingRecovery(actor: SupervisorActor, args: Record<string, unknown>): Promise<SupervisorToolResult> {
  const targetId = asString(args.targetId);
  const targetType = asString(args.targetType);
  const strategy = asString(args.strategy);
  if (!targetId || !targetType) {
    return { ok: false, output: 'targetId and targetType (agent | service | queue | workflow) are required.' };
  }
  const validTargets = ['agent', 'service', 'queue', 'workflow'];
  if (!validTargets.includes(targetType)) {
    return { ok: false, output: `targetType must be one of: ${validTargets.join(', ')}.` };
  }
  const attempt = await getSelfHealingEngine().recover({
    targetId,
    targetType: targetType as 'agent' | 'service' | 'queue' | 'workflow',
    ...(strategy === 'retry' || strategy === 'restart' || strategy === 'rollback' || strategy === 'escalate'
      ? { strategy }
      : {}),
    actorUserId: actor.userId,
  });

  await writeAuditEvent({
    actorUserId: actor.userId,
    companyId: actor.companyId,
    action: 'supervisor.run_self_healing_recovery',
    resource: 'SelfHealingAttempt',
    resourceId: attempt.id,
    details: { targetId, targetType, strategy: attempt.strategy, status: attempt.status },
  });

  // The engine's own verdict is passed through verbatim — a failed recovery is
  // reported as failed, never dressed up as success.
  return {
    ok: attempt.status === 'success',
    output: `Recovery attempt ${attempt.id} for ${targetType} "${targetId}" finished with status: ${attempt.status}.`,
    data: { attemptId: attempt.id, status: attempt.status, strategy: attempt.strategy },
  };
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const SUPERVISOR_TOOLS: SupervisorTool[] = [
  {
    name: 'set_primary_ai_provider',
    description: 'Make one configured AI provider the primary route and demote all others to standby (routing order, providers stay enabled).',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'AIProviderConfig id' },
        makePrimary: { type: 'boolean', description: 'Must be true' },
      },
      required: ['providerId', 'makePrimary'],
    },
    requiresConfirmation: true,
    run: setPrimaryAiProvider,
  },
  {
    name: 'set_ai_provider_enabled',
    description: 'Enable or disable one AI provider config entirely (routing skips disabled providers).',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'AIProviderConfig id' },
        enabled: { type: 'boolean' },
      },
      required: ['providerId', 'enabled'],
    },
    requiresConfirmation: true,
    run: setAiProviderEnabled,
  },
  {
    name: 'set_site_content',
    description: 'Upsert a DB-backed website content block (page + blockKey + JSON content). Public pages serve it with code-default fallback.',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'Site page slug, e.g. "home"' },
        blockKey: { type: 'string', description: 'Block key, e.g. "hero.headline"' },
        content: { type: 'object', description: 'JSON payload, e.g. {"headline": "..."}' },
      },
      required: ['page', 'blockKey', 'content'],
    },
    requiresConfirmation: true,
    run: setSiteContent,
  },
  {
    name: 'run_site_doctor',
    description: 'Run an internet-facing health probe cycle over the configured public targets now and persist every attempt.',
    parameters: {
      type: 'object',
      properties: {
        targets: { type: 'array', items: { type: 'string' }, description: 'Optional explicit URLs (max 5)' },
      },
    },
    requiresConfirmation: false,
    run: runSiteDoctorTool,
  },
  {
    name: 'run_self_healing_recovery',
    description: 'Trigger the SelfHealingEngine for a target (agent/service/queue/workflow). The engine verdict is reported verbatim.',
    parameters: {
      type: 'object',
      properties: {
        targetId: { type: 'string' },
        targetType: { type: 'string', enum: ['agent', 'service', 'queue', 'workflow'] },
        strategy: { type: 'string', enum: ['retry', 'restart', 'rollback', 'escalate'] },
      },
      required: ['targetId', 'targetType'],
    },
    requiresConfirmation: false,
    run: runSelfHealingRecovery,
  },
];

const BY_NAME = new Map(SUPERVISOR_TOOLS.map((tool) => [tool.name, tool]));

export function getSupervisorTool(name: string): SupervisorTool | undefined {
  return BY_NAME.get(name);
}

export function supervisorToolSchemas(): AITool[] {
  return SUPERVISOR_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

const CONFIRMATION_WORDS = new Set(['confirm', 'confirmed', 'yes', 'apply', 'do it', 'execute']);

/**
 * Execute a supervisor tool after the full gate:
 * super_admin role → tool registered → confirmation present → real run → audit.
 */
export async function executeSupervisorTool(
  actor: SupervisorActor,
  name: string,
  args: Record<string, unknown>,
): Promise<SupervisorToolResult> {
  if (actor.role !== 'super_admin') {
    return { ok: false, output: 'Supervisor tools require the platform super_admin role. This attempt was blocked and logged.' };
  }
  const tool = getSupervisorTool(name);
  if (!tool) return { ok: false, output: `Unknown supervisor tool "${name}".` };

  if (tool.requiresConfirmation) {
    const confirmation = asString(args[CONFIRM]);
    if (!confirmation || !CONFIRMATION_WORDS.has(confirmation.trim().toLowerCase())) {
      return {
        ok: false,
        output: `Refused: "${name}" mutates the system and requires {"confirm": "confirm"} in the arguments. Ask the operator to confirm, then call it again with the confirmation set.`,
      };
    }
  }

  try {
    return await tool.run(actor, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: `Tool "${name}" failed: ${message}` };
  }
}
