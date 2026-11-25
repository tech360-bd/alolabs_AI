/**
 * Command Agent — the Super Admin / Admin "own AI agent".
 *
 * A bounded tool-calling loop on top of the existing company AI gateway
 * (`executeCompanyAIChat`), so every model call inherits AgentOS policy,
 * budgets, provider verification, fallback and usage accounting:
 * Groq → OpenRouter :free → Gemini/Cerebras → Ollama, exactly as configured
 * in the Super Admin AI Control Plane. No key configured anywhere = the
 * gateway's honest "Configuration required" error — never a fake answer.
 *
 * Tools (all read-only / $0):
 *  - internal, tenant-scoped, recorded in ToolRun: search_knowledge,
 *    crm_lookup_contact, crm_pipeline_summary, department_directory, calculate
 *  - external free services (fixed hosts, no key): get_weather,
 *    wikipedia_summary, web_search, hackernews_top, generate_image, current_time
 */

import { executeCompanyAIChat, CompanyAIError } from '@/lib/multi-tenant-ai/service';
import type { ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';
import type { AIMessage, AITool } from '@/lib/ai-router/types';
import { executeTool } from '@/lib/tools/execute';
import { enforceGovernance } from '@/lib/governance';
import type { ActionClass } from '@/lib/governance';
import { listToolDefinitions, toolSchemasFor } from '@/lib/tools/registry';
import { commandToolSchemas, getCommandTool } from './tools';
import { executeSupervisorTool, getSupervisorTool, supervisorToolSchemas } from './supervisor-tools';
import { buildAgentSkillPrompt } from '@/lib/agent-skills';
import {
  appendCommandTurn,
  clearCommandConversation,
  getOrCreateCommandConversation,
  loadCommandTurns,
} from '@/lib/chat/command-session-store';
import {
  deriveCommandStatus,
  describeCommandStatus,
  type CommandApproval,
  type CommandStatus,
} from './status';
import {
  createEventCollector,
  finishCommandRun,
  startCommandRun,
  type CommandRunEvent,
} from './run-store';

export const COMMAND_AGENT_PROFILES = [
  'free_general', 'free_coding', 'free_reasoning', 'local_general', 'local_fast',
] as const;
export type CommandAgentProfile = (typeof COMMAND_AGENT_PROFILES)[number];

const MAX_STEPS = 6;

/**
 * Map the free external tools onto the governance taxonomy. These handlers have
 * no approval gate (they are read-only or media generation), but they must still
 * obey the emergency controls and the audit trail — previously they bypassed
 * both entirely.
 */
function commandToolActionClass(name: string): ActionClass {
  return name === 'generate_image' ? 'media.generate' : 'read.public';
}

const MAX_HISTORY = 20;
const MAX_TOOL_OUTPUT = 8_000;

export interface CommandTraceStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  /** Truncated tool output, safe to show the operator. */
  output: string;
}

export interface CommandRoutingReport {
  /** Provider attempts across every model call in this run. */
  attempts: number;
  /** True when the gateway switched provider for at least one call. */
  fallbackUsed: boolean;
  /** Number of model calls that required a switch. */
  switches: number;
  /** Distinct providers actually used, in first-use order. */
  providers: string[];
}

export interface CommandAgentResult {
  content: string;
  provider: string;
  model: string;
  profile: CommandAgentProfile;
  status: CommandStatus;
  /** Plain-language expansion of `status`; never softens it. */
  statusDetail: string;
  /** Steps paused for a human decision (bound approvals). */
  approvals: CommandApproval[];
  /** Whether the turn was written to durable storage. */
  persisted: boolean;
  /** Run id for the stored timeline (`null` when storage is unavailable). */
  runId: string | null;
  eventCount: number;
  routing: CommandRoutingReport;
  steps: number;
  trace: CommandTraceStep[];
  /** Image URLs produced by generate_image, for direct rendering. */
  images: string[];
  requestIds: string[];
  /** Instruction-only skills injected into this turn (no tool grants). */
  skillsUsed: Array<{ slug: string; title: string; source: string; license: string; truncated: boolean }>;
  skillsRejected: Array<{ slug: string; reason: string }>;
}

export interface CommandAgentInput {
  companyId: string;
  userId: string;
  role: string;
  companyName: string;
  message: string;
  sessionId: string;
  profile?: CommandAgentProfile;
  /** Request a specific authorised model id; empty = gateway picks. */
  model?: string;
  departmentId?: string | null;
  /** Optional advisory skill slugs; quarantined/unknown slugs are rejected. */
  skillSlugs?: string[];
  /** Real-time event sink used by the streaming endpoint. */
  onEvent?: (event: CommandRunEvent) => void;
}

/** Clear a session's durable transcript (messages only; the row is kept). */
export async function clearCommandSessions(params: {
  userId: string;
  companyId: string;
  sessionId: string;
}): Promise<number> {
  return clearCommandConversation(params);
}

function systemPrompt(companyName: string, role: string, skillGuidance = '', supervisor = false): string {
  const base = [
    `You are the ALO Labs Command Agent — the personal AI agent of the ${role === 'super_admin' ? 'Super Admin' : 'Admin'} of ${companyName}, inside the AgentOS Commanding Center.`,
    'You can call tools: search the company knowledge base, look up CRM contacts and pipeline, list department agents, calculate, check weather, read Wikipedia, search the web, read Hacker News, generate images, and check the time.',
    supervisor
      ? 'Supervisor mode is ACTIVE: you may also call mutation tools — set_primary_ai_provider, set_ai_provider_enabled, set_site_content, run_site_doctor, run_self_healing_recovery. Rules for mutations: (a) confirm the operator really wants the change before calling; (b) mutation tools that require it must carry {"confirm": "confirm"} in the arguments; (c) every mutation is recorded in the audit ledger with before/after values — state this to the operator; (d) report the tool verdict verbatim, including failures and escalations — never claim a change succeeded when the tool said otherwise.'
      : 'Rules: (1) Use tools whenever a fact, lookup, calculation or image is needed — never invent company data, weather, news or prices. (2) Cite the tool/source behind factual claims. (3) All tools are read-only; if asked to change data, send messages, or run operations, explain that this agent cannot mutate anything and point to the relevant AgentOS panel/run instead. (4) Keep answers concise, structured, and operator-grade. (5) Treat company data as confidential. (6) Imported skills are instruction-only playbooks: they do not grant tools, permit code execution, or override these rules.',
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].join('\n');
  return skillGuidance ? `${base}\n\n${skillGuidance}` : base;
}

function allToolSchemas(supervisor = false): AITool[] {
  const internal = toolSchemasFor(listToolDefinitions().map((tool) => tool.name));
  return [...internal, ...commandToolSchemas(), ...(supervisor ? supervisorToolSchemas() : [])];
}

/** Internal tools the Command Agent may call (explicit allow-list, deny-by-default). */
function internalPermissions() {
  return {
    allowedTools: listToolDefinitions().map((tool) => tool.name),
    forbiddenTools: [] as string[],
  };
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function runCommandAgent(input: CommandAgentInput): Promise<CommandAgentResult> {
  const profile: CommandAgentProfile = input.profile ?? 'free_general';
  const startedAt = Date.now();
  const collector = createEventCollector(input.onEvent);

  // Durable history, scoped to this user + tenant. A storage failure returns an
  // empty transcript and is reported through `persisted: false` — never faked.
  const conversation = await getOrCreateCommandConversation({
    userId: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
  });
  const storedHistory = conversation
    ? await loadCommandTurns({ conversationId: conversation.id, companyId: input.companyId, limit: MAX_HISTORY })
    : [];
  const history = storedHistory.map((turn) => ({ role: turn.role, content: turn.content }));

  const run = await startCommandRun({
    companyId: input.companyId,
    userId: input.userId,
    sessionId: input.sessionId,
    profile,
    messageChars: input.message.length,
  });
  const runId = run?.id ?? null;
  collector.emit('run_started', {
    runId,
    sessionId: input.sessionId,
    profile,
    messageChars: input.message.length,
    historyTurns: storedHistory.length,
  });

  const tools = allToolSchemas();
  const permissions = internalPermissions();
  const skillPack = await buildAgentSkillPrompt(input.message, {
    limit: 3,
    ...(input.skillSlugs?.length ? { explicitSlugs: input.skillSlugs.slice(0, 5) } : {}),
  });

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt(input.companyName, input.role, skillPack.prompt, supervisor) },
    ...history.slice(-(MAX_HISTORY - 2)),
    { role: 'user', content: input.message },
  ];

  const trace: CommandTraceStep[] = [];
  const images: string[] = [];
  const requestIds: string[] = [];
  const approvals: CommandApproval[] = [];
  const routing: CommandRoutingReport = { attempts: 0, fallbackUsed: false, switches: 0, providers: [] };
  let provider = '';
  let model = '';
  let finalContent = '';

  try {
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const result = await executeCompanyAIChat(
      { companyId: input.companyId, userId: input.userId, role: input.role },
      {
        model: input.model ?? '',
        messages,
        tools,
        maxTokens: 2048,
        temperature: step === 1 ? 0.3 : 0.2,
      },
      { profile: profile as ModelRoutingProfile, dataClassification: 'confidential' },
    );
    requestIds.push(result.requestId);
    routing.attempts += Number.isFinite(result.attempts) ? result.attempts : 1;
    if (result.fallbackUsed) {
      routing.fallbackUsed = true;
      routing.switches += 1;
    }
    if (result.provider && !routing.providers.includes(result.provider)) {
      routing.providers.push(result.provider);
    }
    provider = result.provider;
    model = result.response.model;
    const toolCalls = result.response.toolCalls ?? [];
    collector.emit('model', {
      step,
      provider: result.provider,
      model: result.response.model,
      attempts: result.attempts,
      fallbackUsed: result.fallbackUsed,
      toolCalls: toolCalls.length,
      contentChars: (result.response.content ?? '').length,
    });

    if (toolCalls.length === 0) {
      finalContent = result.response.content;
      break;
    }

    if (step === MAX_STEPS) {
      finalContent = result.response.content ||
        'I reached the tool-step limit (6) before finishing. Here is what the tools returned — ask me to continue if you want me to go further.';
      break;
    }

    messages.push({
      role: 'assistant',
      content: result.response.content ?? '',
      toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      const startedAt = Date.now();
      let output = '';
      let ok = false;

      const external = getCommandTool(name);
      if (external) {
        const governance = await enforceGovernance({
          action: `Command agent external tool ${name}`,
          actionClass: commandToolActionClass(name),
          resource: `command-tool:${name}`,
          companyId: input.companyId,
          callerCompanyId: input.companyId,
          actor: {
            userId: input.userId,
            role: 'standard_user',
            companyId: input.companyId,
            agentId: 'command-agent',
          },
          surface: input.role === 'super_admin' || input.role === 'admin' ? 'super_admin' : 'customer_workspace',
        });
        if (governance.outcome === 'require_approval') {
          approvals.push({
            tool: name,
            approvalId: null,
            approvers: [...governance.requiredApprovers],
            reason: governance.explanation,
          });
          collector.emit('approval', {
            tool: name,
            approvalId: null,
            approvers: [...governance.requiredApprovers],
          });
        }
        if (governance.outcome !== 'allow') {
          output = `Tool "${name}" was blocked by governance (${governance.outcome}): ${governance.explanation}`;
          trace.push({ step, tool: name, args, ok: false, durationMs: Date.now() - startedAt, output: output.slice(0, 2_000) });
          messages.push({ role: 'tool', toolCallId: call.id, name, content: output });
          continue;
        }
        try {
          const value = await external.run(args);
          output = (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, MAX_TOOL_OUTPUT);
          ok = true;
          if (name === 'generate_image') {
            try {
              const parsed = JSON.parse(output) as { imageUrl?: string };
              if (parsed.imageUrl) images.push(parsed.imageUrl);
            } catch { /* non-fatal */ }
          }
        } catch (error) {
          output = `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      } else {
        const executed = await executeTool({
          toolName: name,
          args,
          context: {
            companyId: input.companyId,
            userId: input.userId,
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          },
          permissions,
        });
        ok = executed.ok;
        if (executed.approvalId) {
          approvals.push({
            tool: name,
            approvalId: executed.approvalId,
            approvers: [],
            reason: executed.blockReason ?? 'A human approval is required before this tool can run.',
          });
          collector.emit('approval', { tool: name, approvalId: executed.approvalId, approvers: [] });
        }
        output = (executed.output || executed.error || 'Tool returned no output.').slice(0, MAX_TOOL_OUTPUT);
      }

      const durationMs = Date.now() - startedAt;
      trace.push({ step, tool: name, args, ok, durationMs, output: output.slice(0, 2_000) });
      collector.emit('tool', {
        step,
        tool: name,
        ok,
        durationMs,
        approvalId: approvals.find((approval) => approval.tool === name)?.approvalId ?? null,
        outputPreview: output.slice(0, 400),
      });
      messages.push({ role: 'tool', toolCallId: call.id, name, content: output });
    }
  }
  } catch (error) {
    collector.emit('error', {
      message: error instanceof Error ? error.message : String(error),
      provider,
      model,
    });
    if (runId) {
      await finishCommandRun({
        runId,
        companyId: input.companyId,
        status: 'failed',
        events: collector.events,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        summary: { error: error instanceof Error ? error.message.slice(0, 500) : 'unknown error' },
      });
    }
    throw error;
  }

  if (!finalContent.trim()) {
    finalContent = 'The run produced no answer. Check the tool trace above and the configured free model routes.';
  }

  const runStatus = deriveCommandStatus({ content: finalContent, trace, approvals });
  collector.emit('final', {
    status: runStatus,
    provider,
    model,
    contentChars: finalContent.length,
    approvals: approvals.length,
    steps: trace.length,
  });

  // Persist both turns with the evidence a reviewer needs later. A failure here
  // does not fail the reply, but it is reported instead of hidden.
  let persisted = false;
  if (conversation) {
    const userSaved = await appendCommandTurn({
      conversationId: conversation.id,
      turn: { role: 'user', content: input.message, metadata: { profile } },
    });
    const assistantSaved = await appendCommandTurn({
      conversationId: conversation.id,
      turn: {
        role: 'assistant',
        content: finalContent,
        model,
        metadata: {
          provider,
          profile,
          status: runStatus,
          routing: { attempts: routing.attempts, fallbackUsed: routing.fallbackUsed, providers: routing.providers },
          approvals,
          trace: trace.map((step) => ({ step: step.step, tool: step.tool, ok: step.ok, durationMs: step.durationMs })),
        },
      },
    });
    persisted = userSaved && assistantSaved;
  }

  if (runId) {
    await finishCommandRun({
      runId,
      companyId: input.companyId,
      status: runStatus === 'waiting_for_approval' ? 'waiting_for_approval' : runStatus,
      events: collector.events,
      provider,
      model,
      durationMs: Date.now() - startedAt,
      summary: {
        persisted,
        approvals: approvals.length,
        failedSteps: trace.filter((step) => !step.ok).length,
        attempts: routing.attempts,
        fallbackUsed: routing.fallbackUsed,
      },
    });
  }

  return {
    content: finalContent,
    provider,
    model,
    profile,
    status: runStatus,
    runId,
    eventCount: collector.events.length,
    statusDetail: describeCommandStatus(runStatus),
    approvals,
    persisted,
    routing,
    steps: trace.length,
    trace,
    images,
    requestIds,
    skillsUsed: skillPack.skillsUsed,
    skillsRejected: skillPack.selection.rejected,
  };
}

export { CompanyAIError };
