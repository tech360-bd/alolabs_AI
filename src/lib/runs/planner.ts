/**
 * ALO Labs AgentOS — Master Orchestrator Planner
 *
 * Turns a high-level objective into an executable, ordered plan of steps.
 *
 * Two strategies:
 *  1. LLM planning (preferred): a structured planning prompt asks the model
 *     router for a JSON plan (steps, agent hints, skills, tools, dependencies).
 *  2. Heuristic planning (fallback): deterministic keyword/department mapping
 *     produces a generic research → analyze → verify → deliver pipeline.
 *
 * The planner NEVER fabricates results: when no provider is configured it
 * returns a heuristic plan and reports `strategy: 'heuristic'` so the run
 * records honestly how the plan was produced. Model-dependent steps will
 * fail at execution time with a clear "Configuration required" error.
 */

import { randomUUID } from 'node:crypto';
import { getRouter } from '@/lib/ai-router';
import type { AIRequest } from '@/lib/ai-router/types';
import { isConfigurationError } from '@/lib/qc';

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  agentHint?: string;
  skills: string[];
  tools: string[];
  dependsOn: string[];
}

export interface PlanResult {
  steps: PlanStep[];
  strategy: 'llm' | 'heuristic';
  reasoning: string;
}

const PLANNING_SYSTEM_PROMPT = [
  'You are the Master Orchestrator of ALO Labs AgentOS.',
  'Given a user objective, produce an execution plan as STRICT JSON only.',
  'Schema:',
  '{',
  '  "strategy": "one line describing the approach",',
  '  "steps": [',
  '    {',
  '      "title": "short step title",',
  '      "description": "what this step must accomplish (one or two sentences)",',
  '      "agentHint": "the kind of specialist this needs (e.g. research, analysis, writing, verification, engineering)",',
  '      "skills": ["relevant skill names"],',
  '      "tools": ["relevant tool names"],',
  '      "dependsOn": ["ids of steps that must complete first"]',
  '    }',
  '  ]',
  '}',
  'Rules:',
  '- 2 to 8 steps. Order them so dependencies come first.',
  '- Every step must be executable by a specialist agent.',
  '- Include a verification step for any research/factual work.',
  '- Include a final deliverable step (report, document, or summary).',
  '- Output ONLY the JSON object. No markdown fences, no commentary.',
].join('\n');

/** Extract the first JSON object from a model response (tolerates fences/prose). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeLlmPlan(parsed: Record<string, unknown>): PlanResult | null {
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : null;
  if (!rawSteps || rawSteps.length === 0 || rawSteps.length > 12) return null;

  const steps: PlanStep[] = [];
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== 'object') return null;
    const step = raw as Record<string, unknown>;
    const title = typeof step.title === 'string' ? step.title.trim() : '';
    const description = typeof step.description === 'string' ? step.description.trim() : '';
    if (!title || !description) return null;
    steps.push({
      id: randomUUID(),
      title,
      description,
      agentHint: typeof step.agentHint === 'string' ? step.agentHint : undefined,
      skills: Array.isArray(step.skills) ? step.skills.filter((s): s is string => typeof s === 'string') : [],
      tools: Array.isArray(step.tools) ? step.tools.filter((t): t is string => typeof t === 'string') : [],
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.filter((d): d is string => typeof d === 'string') : [],
    });
  }

  // Link dependsOn references to actual step ids. LLMs reference steps by
  // id, by title, or by 0-based/1-based position — support all three.
  const linked = steps.map((step, index) => ({
    ...step,
    dependsOn: step.dependsOn
      .map((ref) => {
        const byId = steps.find((s) => s.id === ref);
        if (byId) return byId.id;
        const byTitle = steps.find(
          (s) => s.title.toLowerCase() === ref.trim().toLowerCase(),
        );
        if (byTitle) return byTitle.id;
        const numeric = Number(ref);
        const positional = Number.isInteger(numeric)
          ? (steps[numeric] ?? steps[numeric - 1])
          : undefined;
        return positional ? positional.id : null;
      })
      .filter((id): id is string => Boolean(id) && id !== step.id && steps.findIndex((s) => s.id === id) < index),
  }));

  return {
    steps: linked,
    strategy: 'llm',
    reasoning: typeof parsed.strategy === 'string' ? parsed.strategy : 'LLM-generated plan',
  };
}

/** Deterministic fallback planner — always available, never fabricates. */
export function heuristicPlan(objective: string): PlanResult {
  const lower = objective.toLowerCase();
  const wants = (keywords: string[]) => keywords.some((k) => lower.includes(k));

  const stepDefs: Array<Omit<PlanStep, 'id' | 'dependsOn'>> = [
    {
      title: 'Research & gather information',
      description: `Research and gather the information needed for: ${objective}`,
      agentHint: 'research',
      skills: ['web_research', 'information_gathering'],
      tools: ['web_search', 'database'],
    },
  ];

  if (wants(['code', 'build', 'website', 'app', 'landing page', 'software', 'fix', 'bug'])) {
    stepDefs.push({
      title: 'Design & implement',
      description: `Design and implement the solution for: ${objective}`,
      agentHint: 'engineering',
      skills: ['code_generation', 'architecture'],
      tools: ['code_runner', 'file_storage'],
    });
  } else {
    stepDefs.push({
      title: 'Analyze & structure findings',
      description: `Analyze the gathered information and structure it for: ${objective}`,
      agentHint: 'analysis',
      skills: ['analysis', 'structuring'],
      tools: ['database'],
    });
  }

  stepDefs.push({
    title: 'Verify facts & sources',
    description: `Verify factual claims and record sources for: ${objective}`,
    agentHint: 'verification',
    skills: ['fact_verification', 'source_verification'],
    tools: ['web_search'],
  });

  stepDefs.push({
    title: 'Produce final deliverable',
    description: `Assemble the final deliverable (report/document/summary) for: ${objective}`,
    agentHint: 'writing',
    skills: ['report_writing', 'document_generation'],
    tools: ['file_storage'],
  });

  // Wire an explicit sequential dependency chain: each step depends on the
  // previous one, so the plan is a real DAG (and a failed step skips its
  // dependents instead of running against missing context).
  const steps: PlanStep[] = stepDefs.map((def, index) => ({
    ...def,
    id: randomUUID(),
    dependsOn: [],
  }));
  for (let i = 1; i < steps.length; i += 1) {
    steps[i].dependsOn = [steps[i - 1].id];
  }

  return {
    steps,
    strategy: 'heuristic',
    reasoning: 'No AI provider available for LLM planning; generated a deterministic research → analyze → verify → deliver pipeline.',
  };
}

/**
 * Plan an objective. Tries the LLM planner first; falls back to the
 * heuristic planner on any failure (including missing provider configuration).
 */
export async function planObjective(
  objective: string,
  companyId: string,
  options?: { preferredModel?: string; runId?: string },
): Promise<PlanResult> {
  try {
    const router = getRouter();
    const request: AIRequest = {
      model: options?.preferredModel ?? 'reasoning',
      messages: [
        { role: 'system', content: PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: `OBJECTIVE: ${objective}` },
      ],
      maxTokens: 2048,
      temperature: 0.2,
    };
    const response = await router.chat(request, companyId, 'master-orchestrator', {
      runId: options?.runId,
      taskType: 'run.plan',
    });
    const parsed = extractJsonObject(response.content);
    if (parsed) {
      const plan = normalizeLlmPlan(parsed);
      if (plan) {
        return plan;
      }
    }
    // Malformed LLM output → fall through to heuristic (honest)
    return heuristicPlan(objective);
  } catch (error) {
    if (isConfigurationError(error)) {
      return heuristicPlan(objective);
    }
    // Unexpected planner failure → heuristic keeps the run alive
    return heuristicPlan(objective);
  }
}
