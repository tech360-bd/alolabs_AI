import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import {
  CODING_HARNESS_DEFINITIONS,
  createSandboxedAgentSession,
  ensureHarnessesSeeded,
  executeSandboxedHarnessSession,
  probeHarnessCliAvailability,
  reviewAgentSession,
} from '@/lib/coding-agents/harness-registry';
import {
  classifyToolRisk,
  ensureCoreToolsSeeded,
  optimizeToolCallBatch,
} from '@/lib/coding-agents/tool-optimizer';
import { classifyBrowserAction, QA_VIEWPORT_PRESETS } from '@/lib/browser/agent-session';

const CodingAgentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync_registry'),
  }),
  z.object({
    action: z.literal('create_session'),
    harnessSlug: z.string().min(1),
    branchName: z.string().min(1).max(120),
    workspacePath: z.string().optional(),
    promptSummary: z.string().min(1).max(2000),
    modelUsed: z.string().optional(),
    providerUsed: z.string().optional(),
  }),
  z.object({
    action: z.literal('review_session'),
    sessionId: z.string().min(1),
    decision: z.enum(['approved', 'rejected', 'completed']),
  }),
  z.object({
    action: z.literal('execute_session'),
    sessionId: z.string().min(1),
    targetFileName: z.string().max(120).optional(),
    proposedContent: z.string().max(50_000).optional(),
  }),
  z.object({
    action: z.literal('optimize_batch_preview'),
    calls: z
      .array(
        z.object({
          name: z.string().min(1),
          args: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .min(1)
      .max(50),
  }),
  z.object({
    action: z.literal('classify_browser_action'),
    browserAction: z.enum([
      'navigate',
      'screenshot',
      'extract_dom',
      'check_links',
      'fill_form',
      'submit_form',
      'publish_content',
      'purchase_checkout',
      'account_mutation',
    ]),
  }),
]);

export async function GET() {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  await Promise.all([ensureHarnessesSeeded(), ensureCoreToolsSeeded()]);

  const [harnesses, sessions, tools, cliProbes] = await Promise.all([
    db.agentHarness.findMany({ orderBy: { name: 'asc' } }),
    db.agentSession.findMany({
      ...(actor.companyId ? { where: { companyId: actor.companyId } } : {}),
      include: { harness: { select: { slug: true, name: true, licenseSpdx: true } } },
      orderBy: { startedAt: 'desc' },
      take: 30,
    }),
    db.toolRegistry.findMany({ orderBy: { category: 'asc' } }),
    Promise.all(
      CODING_HARNESS_DEFINITIONS.map(async (def) => ({
        slug: def.slug,
        probe: await probeHarnessCliAvailability(def.cliBinary),
      })),
    ),
  ]);

  const probeMap = new Map(cliProbes.map((p) => [p.slug, p.probe]));

  return NextResponse.json({
    success: true,
    harnesses: harnesses.map((h) => ({
      ...h,
      cliProbe: probeMap.get(h.slug) ?? { installed: false, detail: 'API/MCP mode' },
    })),
    sessions,
    tools,
    qaViewports: QA_VIEWPORT_PRESETS,
  });
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CodingAgentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (data.action === 'sync_registry') {
    await Promise.all([ensureHarnessesSeeded(), ensureCoreToolsSeeded()]);
    return NextResponse.json({ success: true });
  }

  if (data.action === 'optimize_batch_preview') {
    const plan = optimizeToolCallBatch(data.calls);
    const classifications = data.calls.map((c) => ({
      name: c.name,
      ...classifyToolRisk(c.name),
    }));
    return NextResponse.json({ success: true, plan, classifications });
  }

  if (data.action === 'classify_browser_action') {
    return NextResponse.json({
      success: true,
      decision: classifyBrowserAction(data.browserAction),
    });
  }

  if (data.action === 'create_session') {
    try {
      const session = await createSandboxedAgentSession({
        harnessSlug: data.harnessSlug,
        companyId: actor.companyId ?? 'system',
        userId: actor.userId,
        branchName: data.branchName,
        workspacePath: data.workspacePath,
        promptSummary: data.promptSummary,
        modelUsed: data.modelUsed,
        providerUsed: data.providerUsed,
      });
      return NextResponse.json({ success: true, session }, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create sandbox session' },
        { status: 400 },
      );
    }
  }

  if (data.action === 'execute_session') {
    try {
      const outcome = await executeSandboxedHarnessSession({
        sessionId: data.sessionId,
        companyId: actor.companyId ?? 'system',
        actorUserId: actor.userId,
        targetFileName: data.targetFileName,
        proposedContent: data.proposedContent,
      });
      return NextResponse.json({ success: true, ...outcome });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Sandbox execution failed' },
        { status: 400 },
      );
    }
  }

  try {
    const session = await reviewAgentSession({
      sessionId: data.sessionId,
      companyId: actor.companyId ?? 'system',
      approverId: actor.userId,
      decision: data.decision,
    });
    return NextResponse.json({ success: true, session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Session update failed' },
      { status: 404 },
    );
  }
}
