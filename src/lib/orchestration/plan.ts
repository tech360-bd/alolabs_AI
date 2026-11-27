/**
 * Multi-agent orchestration — planning.
 *
 * The coordinator's job is to take one administrator objective, split it into
 * subtasks that independent agents can own, and prove afterwards that the outputs
 * agree. This module is the pure half: it decides *what* the subtasks are, *who*
 * can own each one, and which pairs must not run at the same time.
 *
 * It is deliberately deterministic and dependency-free so the split can be tested
 * without a database, a worker or a model provider.
 */

import type { InstructionPlan } from '@/lib/super-admin/operator';

/** What kind of work an agent can do. */
export type AgentKind = 'ai' | 'coding' | 'browser' | 'analysis' | 'operations';

export interface AgentDescriptor {
  id: string;
  name: string;
  kind: AgentKind;
  /** Capability tags, matched against a subtask's `requiredCapabilities`. */
  capabilities: string[];
  /** Tools the agent may call. Empty means "read/analyse only". */
  tools: string[];
  health: 'available' | 'degraded' | 'unavailable';
  /** How many subtasks this agent may hold at once. */
  maxConcurrency: number;
  /** Tenant scope: a company agent can only be used inside its company. */
  tenantScope: 'company' | 'platform';
  companyId?: string;
  version?: string;
  /** Budget per child run, enforced by the caller. */
  resourceBudget: { tokensPerRun: number; minutesPerRun: number };
}

/** A unit of work one agent owns. */
export interface Subtask {
  id: string;
  title: string;
  instruction: string;
  requiredCapabilities: string[];
  /**
   * The part of the project this subtask may modify.
   *
   * Two subtasks with the same non-read scope must not run concurrently — that is
   * how "two agents edited the same file" happens. `'read-only'` never conflicts.
   */
  scope: string;
  /** Subtask ids that must finish before this one starts. */
  dependsOn: string[];
}

export interface Assignment {
  subtask: Subtask;
  agent: AgentDescriptor | null;
  /** Why no agent was assigned, when `agent` is null. */
  reason?: string;
}

export interface OrchestrationPlan {
  parentObjective: string;
  assignments: Assignment[];
  /** Subtasks that could not be assigned to any healthy agent. */
  unassigned: Assignment[];
  /** Suggested parallelism (min of agent capacity and a hard ceiling). */
  concurrency: number;
  notes: string[];
}

/** Hard ceiling: a shared host must not be asked to run twenty runs at once. */
export const MAX_CONCURRENCY = 4;

/**
 * Which capabilities does a subtask need?
 *
 * Derived from the wording of the step, because the intent plan is written for a
 * human reader. The mapping is small and explicit: a step that mentions the
 * browser needs a browser agent, a step that mentions files or code needs a coding
 * agent, and a step that only inspects needs an analysis agent.
 */
export function capabilitiesForStep(step: string): string[] {
  const text = step.toLowerCase();
  const capabilities: string[] = [];
  if (/\bbrowser|screenshot|page\b/.test(text)) capabilities.push('browser');
  if (/\bgithub|repository|repo\b/.test(text)) capabilities.push('repository');
  if (/\bcode|file|diff|patch|refactor|fix\b/.test(text)) capabilities.push('coding');
  if (/\btest|typecheck|lint|build\b/.test(text)) capabilities.push('testing');
  if (/\bdeploy|restart|rollback|environment|config/.test(text)) capabilities.push('operations');
  if (/\bcapacity|memory|disk|usage\b/.test(text)) capabilities.push('capacity');
  if (/\breport|summarise|summarize|assess|review|compare|verify\b/.test(text)) capabilities.push('analysis');
  return capabilities.length > 0 ? capabilities : ['analysis'];
}

/** Does a subtask modify anything? Read-only subtasks never conflict. */
export function scopeForStep(step: string, index: number): string {
  const text = step.toLowerCase();
  if (/\bwrite|edit|modify|apply|patch|fix|create file|migrate\b/.test(text)) return `write:step-${index}`;
  return 'read-only';
}

/**
 * Split an instruction plan into subtasks.
 *
 * Each intent step becomes one subtask. Steps that must run in order (because
 * earlier steps produce what later ones read — resolution before execution,
 * execution before verification) are chained with `dependsOn`; genuinely
 * independent steps stay parallel. The rule used here is positional: a step that
 * writes depends on every earlier step, and a read-only step depends only on the
 * previous write. That is conservative — it never runs work concurrently that
 * might need an earlier result — while still allowing the common case of several
 * independent inspections to fan out.
 */
export function planSubtasks(parentObjective: string, plan: InstructionPlan): Subtask[] {
  const steps = plan.steps.length > 0 ? plan.steps : [parentObjective];

  // An intent's steps are a *procedure*: step 2 reads what step 1 resolved. They
  // are therefore chained, and the parallelism in an orchestrated run comes from
  // multiple targets (see `targetSubtasks`) or from several independent runs.
  // Pretending a described procedure is parallel work would dispatch an agent to
  // "compare with the register" before anything had been fetched.
  return steps.map((step, index) => ({
    id: `sub-${index + 1}`,
    title: step.length > 90 ? `${step.slice(0, 87)}…` : step,
    instruction: `${parentObjective}\n\nStep ${index + 1} of ${steps.length}: ${step}`,
    requiredCapabilities: capabilitiesForStep(step),
    scope: scopeForStep(step, index),
    dependsOn: index === 0 ? [] : [`sub-${index}`],
  }));
}

const URL_PATTERN = /https?:\/\/[^\s,;]+/g;

/**
 * Extract the independent targets an objective names.
 *
 * "Review these three repos: <a> <b> <c>" is genuinely parallel work — one agent
 * per repository, no ordering between them. That is where fan-out belongs, and it
 * is detected from the objective rather than assumed.
 */
export function extractTargets(objective: string): string[] {
  const matches = objective.match(URL_PATTERN) ?? [];
  const unique = Array.from(new Set(matches.map((url) => url.replace(/[).,;]+$/, ''))));
  return unique.slice(0, MAX_CONCURRENCY * 2);
}

/** One subtask per named target: independent, unowned until assignment. */
export function targetSubtasks(parentObjective: string, targets: readonly string[]): Subtask[] {
  return targets.map((target, index) => ({
    id: `sub-${index + 1}`,
    title: `Inspect ${target.replace(/^https?:\/\//, '').slice(0, 80)}`,
    instruction: `${parentObjective}\n\nTarget ${index + 1} of ${targets.length}: ${target}`,
    requiredCapabilities: capabilitiesForStep(target),
    scope: 'read-only',
    dependsOn: [],
  }));
}

/** Choose an agent for one subtask, or explain why none fits. */
export function selectAgent(subtask: Subtask, agents: readonly AgentDescriptor[], companyId?: string): Assignment {
  const healthy = agents.filter((agent) => agent.health === 'available');
  const inScope = healthy.filter(
    (agent) => agent.tenantScope === 'platform' || (companyId ? agent.companyId === companyId : true),
  );
  const capable = inScope.filter((agent) =>
    subtask.requiredCapabilities.every((capability) => agent.capabilities.includes(capability)),
  );

  if (capable.length === 0) {
    const degraded = agents.filter((agent) =>
      subtask.requiredCapabilities.every((capability) => agent.capabilities.includes(capability)),
    );
    return {
      subtask,
      agent: null,
      reason:
        degraded.length > 0
          ? `No healthy agent can do this: ${degraded.map((agent) => `${agent.name} (${agent.health})`).join(', ')}.`
          : `No registered agent advertises ${subtask.requiredCapabilities.join(' + ')}.`,
    };
  }

  // Prefer the least loaded kind-appropriate agent; ties break on id so the
  // assignment is reproducible across runs.
  const ranked = [...capable].sort((a, b) => {
    const fitA = a.capabilities.length - subtask.requiredCapabilities.length;
    const fitB = b.capabilities.length - subtask.requiredCapabilities.length;
    if (fitA !== fitB) return fitA - fitB;
    if (a.maxConcurrency !== b.maxConcurrency) return b.maxConcurrency - a.maxConcurrency;
    return a.id.localeCompare(b.id);
  });
  return { subtask, agent: ranked[0] };
}

/**
 * Build the full plan: subtasks, assignments, concurrency and the conflicts that
 * were removed by ordering.
 */
export function buildOrchestrationPlan(
  parentObjective: string,
  plan: InstructionPlan,
  agents: readonly AgentDescriptor[],
  companyId?: string,
): OrchestrationPlan {
  const targets = extractTargets(parentObjective);
  // Several named targets → parallel subtasks. A single objective → the intent's
  // procedure, chained.
  const subtasks = targets.length >= 2 ? targetSubtasks(parentObjective, targets) : planSubtasks(parentObjective, plan);
  const assignments = subtasks.map((subtask) => selectAgent(subtask, agents, companyId));
  const unassigned = assignments.filter((assignment) => assignment.agent === null);
  const notes: string[] = [];

  // Serialise write scopes: two subtasks that both touch a write scope get an
  // explicit dependency rather than being allowed to race.
  const writeScopes = new Map<string, string>();
  for (const { subtask } of assignments) {
    if (subtask.scope === 'read-only') continue;
    const previous = writeScopes.get(subtask.scope);
    if (previous && !subtask.dependsOn.includes(previous)) {
      subtask.dependsOn.push(previous);
      notes.push(`${subtask.id} serialised after ${previous}: both write ${subtask.scope}.`);
    }
    writeScopes.set(subtask.scope, subtask.id);
  }

  const assignedAgents = new Set(
    assignments.map((assignment) => assignment.agent?.id).filter((id): id is string => Boolean(id)),
  );
  const capacity = assignments.reduce((sum, assignment) => sum + (assignment.agent?.maxConcurrency ?? 0), 0);
  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, capacity || 1));

  if (assignedAgents.size < 2) {
    notes.push(
      assignedAgents.size === 0
        ? 'No agent could be assigned; the parent run will fail with the reasons above rather than pretending.'
        : 'Only one agent is available, so this fan-out will not run subtasks in parallel.',
    );
  }

  return { parentObjective, assignments, unassigned, concurrency, notes };
}

/** How many subtasks may start right now, given what has finished. */
export function readySubtasks(all: readonly Subtask[], completed: ReadonlySet<string>, inFlight: ReadonlySet<string>): Subtask[] {
  return all.filter(
    (subtask) =>
      !completed.has(subtask.id) &&
      !inFlight.has(subtask.id) &&
      subtask.dependsOn.every((dependency) => completed.has(dependency)),
  );
}
