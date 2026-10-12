/**
 * ALO Labs AI-EOS — Unified Orchestrator
 *
 * THE BRAIN of the ONE unified system.
 * Takes any task from a user and routes it to the best AI employee.
 * Uses intelligent scoring: department match + skill overlap + purpose relevance + role fit.
 * Minimum agents for maximum efficiency — 1 specialist when 1 is enough.
 *
 * Enhanced with:
 * - Adaptive Reasoning Paths (fast / standard / complex / enterprise)
 * - Multi-Agent Collaboration for cross-department tasks
 * - Workload/Performance-Aware Agent Selection
 * - Event Bus Integration
 * - Hierarchy-Aware Role Matching
 */

import { db } from '@/lib/db';
import { getExecutionEngine } from '@/lib/agent-runtime';
import { getMemoryStore } from '@/lib/memory';
import { classifyTask, detectDelegationNeed } from '@/lib/agent-runtime/pipeline';
import type { TaskClassification } from '@/lib/agent-runtime/pipeline';
import { getAgentHealthMonitor } from '@/lib/agent-runtime/health';
import { getEventBus, EventTypes } from '@/lib/event-bus';
import type { DomainEvent } from '@/lib/event-bus';
import { getRouter } from '@/lib/ai-router';

// ─── Types ─────────────────────────────────────────────────────────────

export interface RoutingCandidate {
  agentId: string;
  agentName: string;
  role: string;
  type: string;
  departmentName: string;
  departmentId: string;
  purpose: string;
  score: number;
  matchDetails: {
    department: number;
    purpose: number;
    skills: number;
    role: number;
  };
}

export interface OrchestratedTask {
  id: string;
  task: string;
  selectedAgent: RoutingCandidate;
  alternatives: RoutingCandidate[];
  reasoning: string;
}

export interface OrchestratorResult {
  content: string;
  confidence?: number;
  model: string;
  latencyMs: number;
  contextTokens?: number;
  contextSources: string;
  routing: {
    task: string;
    selectedAgent: {
      agentId: string;
      agentName: string;
      departmentName: string;
      role: string;
      score: number;
    };
    alternatives: Array<{
      agentId: string;
      agentName: string;
      departmentName: string;
      score: number;
    }>;
    reasoning: string;
    totalCandidates: number;
    routingTimeMs: number;
  };
  conversationId: string;
  messageId: string;
  memoryStored: boolean;
}

// ─── Adaptive Reasoning Path Types ─────────────────────────────────────

export type AdaptiveReasoningPath = 'fast' | 'standard' | 'complex' | 'enterprise';

export interface AdaptiveResult extends OrchestratorResult {
  reasoningPath: AdaptiveReasoningPath;
  classification: TaskClassification;
}

// ─── Multi-Agent Collaboration Types ────────────────────────────────────

export interface AgentContribution {
  agentId: string;
  agentName: string;
  departmentName: string;
  subTask: string;
  result: string;
  confidence?: number;
  routingScore?: number;
  latencyMs: number;
  status: 'fulfilled' | 'rejected';
  error?: string;
}

export interface CollaborationResult {
  content: string;
  reasoningPath: 'enterprise';
  collaborationSessionId: string;
  contributions: AgentContribution[];
  totalLatencyMs: number;
  departmentsInvolved: string[];
  synthesisModel: string;
  synthesisConfidence?: number;
}

// ─── Orchestrator Event Types ──────────────────────────────────────────

const ORCHESTRATOR_EVENTS = {
  TASK_STARTED: 'agent.task.started',
  TASK_COMPLETED: 'agent.task.completed',
  TASK_FAILED: 'agent.task.failed',
} as const;

interface OrchestratorTaskEventData {
  taskId: string;
  agentId: string;
  companyId: string;
  userId: string;
  task: string;
  model?: string;
  latencyMs?: number;
  confidence?: number;
  contextSources?: string;
  error?: string;
  reasoningPath?: AdaptiveReasoningPath;
}

// ─── Keyword Extraction ────────────────────────────────────────────────

/** Extract meaningful keywords from text, filtering stop words. */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
    'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that', 'these',
    'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
    'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who',
    'whom', 'please', 'help', 'need', 'want', 'make', 'get', 'give', 'use',
    'also', 'new', 'good', 'great', 'best', 'like', 'know', 'think',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/** Compute Jaccard similarity between two keyword sets. */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Agent Scoring ─────────────────────────────────────────────────────

/**
 * Score a single agent against a task.
 * Returns a 0-1 score based on 4 dimensions.
 */
function scoreAgent(
  taskKeywords: string[],
  agent: {
    agentId: string;
    name: string;
    role: string;
    type: string;
    departmentName: string;
    departmentId: string;
    purpose: string;
    allowedSkills: string;
  },
): RoutingCandidate {
  // 1. Department match (30% weight) — check if task keywords mention the department
  const deptKeywords = extractKeywords(agent.departmentName);
  const deptScore = jaccardSimilarity(taskKeywords, deptKeywords);

  // 2. Purpose relevance (35% weight) — how well does the agent's purpose match the task?
  const purposeKeywords = extractKeywords(agent.purpose);
  const purposeScore = jaccardSimilarity(taskKeywords, purposeKeywords);

  // 3. Skills overlap (25% weight) — do the agent's skills relate to the task?
  let skillsScore = 0;
  try {
    const skillSlugs: string[] = JSON.parse(agent.allowedSkills || '[]');
    if (skillSlugs.length > 0) {
      const skillText = skillSlugs.join(' ');
      const skillKeywords = extractKeywords(skillText);
      skillsScore = jaccardSimilarity(taskKeywords, skillKeywords);
    }
  } catch { /* parse error */ }

  // 4. Role fit (10% weight) — certain roles are better for certain tasks
  let roleScore = 0.1; // baseline
  const roleKeywords = extractKeywords(agent.role + ' ' + agent.name);
  const roleOverlap = jaccardSimilarity(taskKeywords, roleKeywords);
  roleScore = Math.max(roleScore, roleOverlap);

  // Also boost manager/planner roles for complex tasks
  if (agent.role === 'manager' || agent.role === 'planner') {
    const complexityIndicators = ['analyze', 'strategy', 'plan', 'review', 'report', 'evaluate', 'assess'];
    const hasComplexity = taskKeywords.some(k => complexityIndicators.some(c => k.includes(c)));
    if (hasComplexity) roleScore = Math.min(1, roleScore + 0.2);
  }

  // Weighted total
  const score = (deptScore * 0.30) + (purposeScore * 0.35) + (skillsScore * 0.25) + (roleScore * 0.10);

  return {
    agentId: agent.agentId,
    agentName: agent.name,
    role: agent.role,
    type: agent.type,
    departmentName: agent.departmentName,
    departmentId: agent.departmentId,
    purpose: agent.purpose,
    score,
    matchDetails: {
      department: deptScore,
      purpose: purposeScore,
      skills: skillsScore,
      role: roleScore,
    },
  };
}

// ─── Main Orchestrator ─────────────────────────────────────────────────

export class UnifiedOrchestrator {

  /**
   * Route a task to the best agent(s).
   * Returns the orchestrated task with routing metadata.
   *
   * Enhanced with:
   * - Workload/Performance-Aware scoring (health + recent run counts)
   * - Hierarchy-Aware role matching (10% bonus for role-tier alignment)
   */
  async routeTask(task: string, companyId: string): Promise<OrchestratedTask> {
    const routeStart = Date.now();
    const taskKeywords = extractKeywords(task);

    // Classify task for hierarchy-aware selection
    const classification = classifyTask(task, 'orchestrator', 'router');

    // Determine preferred role tiers based on task complexity
    const preferredRoles = this.getPreferredRolesForComplexity(classification.complexity);

    // Step 1: Find candidate agents from DB
    const agents = await db.agent.findMany({
      where: { status: 'active', agentCompanyAccess: { some: { companyId } } },
      select: {
        agentId: true,
        name: true,
        role: true,
        type: true,
        departmentName: true,
        departmentId: true,
        purpose: true,
        allowedSkills: true,
      },
    });

    // Step 2: Score all agents
    const candidates = agents.map(agent => scoreAgent(taskKeywords, agent));

    // Step 3: Apply Workload/Performance-Aware adjustments
    const healthMonitor = getAgentHealthMonitor();
    const recentRunsMap = await this.getRecentRunCounts(companyId);

    for (const candidate of candidates) {
      const health = healthMonitor.getHealth(candidate.agentId);

      // Skip unhealthy agents (health score < 30)
      if (health.healthScore < 30) {
        candidate.score = 0;
        continue;
      }

      // Workload penalty based on recent run counts
      const recentRuns = recentRunsMap.get(candidate.agentId) || 0;
      const workloadPenalty = Math.min(0.3, recentRuns / 100);

      // Adjust score: multiply by (healthScore/100) * (1 - workloadPenalty)
      const healthFactor = health.healthScore / 100;
      const workloadFactor = 1 - workloadPenalty;
      candidate.score = candidate.score * healthFactor * workloadFactor;

      // Step 4: Hierarchy-Aware bonus — 10% for matching role tier
      if (preferredRoles.includes(candidate.role)) {
        candidate.score = candidate.score * 1.10; // 10% bonus
      }
    }

    // Step 5: Sort by score, take top candidates
    candidates.sort((a, b) => b.score - a.score);
    const topCandidate = candidates[0];
    const alternatives = candidates.slice(1, 4); // top 3 alternatives

    if (!topCandidate || topCandidate.score === 0) {
      // Fallback: pick the first active specialist or manager
      const fallback = agents.find(a => a.role === 'specialist') || agents[0];
      if (!fallback) {
        throw new Error('No active agents available in the system');
      }
      const fallbackCandidate = scoreAgent(['general', 'help', 'assist'], fallback);
      fallbackCandidate.score = 0.1;
      return {
        id: `orch_${Date.now()}`,
        task,
        selectedAgent: fallbackCandidate,
        alternatives: [],
        reasoning: `No strong match found. Routed to ${fallback.name} (${fallback.role}) as general assistant.`,
      };
    }

    // Step 6: Generate reasoning
    const best = topCandidate;
    const reasons: string[] = [];
    if (best.matchDetails.purpose > 0.1) {
      reasons.push(`purpose alignment (${(best.matchDetails.purpose * 100).toFixed(0)}%)`);
    }
    if (best.matchDetails.department > 0.1) {
      reasons.push(`department match (${(best.matchDetails.department * 100).toFixed(0)}%)`);
    }
    if (best.matchDetails.skills > 0.1) {
      reasons.push(`skill overlap (${(best.matchDetails.skills * 100).toFixed(0)}%)`);
    }
    if (best.matchDetails.role > 0.1) {
      reasons.push(`role fit (${(best.matchDetails.role * 100).toFixed(0)}%)`);
    }

    const reasoning = reasons.length > 0
      ? `Selected ${best.agentName} based on: ${reasons.join(', ')}.`
      : `Selected ${best.agentName} from ${best.departmentName} as the closest match (score: ${(best.score * 100).toFixed(0)}%).`;

    return {
      id: `orch_${Date.now()}`,
      task,
      selectedAgent: topCandidate,
      alternatives,
      reasoning,
    };
  }

  /**
   * Execute a task end-to-end: route → execute → memory → return.
   *
   * Enhanced with Event Bus integration.
   */
  async execute(params: {
    task: string;
    userId: string;
    companyId: string;
    conversationId?: string;
    preferredAgentId?: string;
  }): Promise<OrchestratorResult> {
    const companyId = params.companyId
    const membership = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId: params.userId } },
      select: { id: true },
    })
    if (!membership) throw new Error('Forbidden')
    if (params.conversationId) {
      const conversation = await db.conversation.findFirst({
        where: { id: params.conversationId, companyId, userId: params.userId },
        select: { id: true },
      })
      if (!conversation) throw new Error('Conversation not found')
    }
    const taskId = `orch_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Step 1: Route the task
    const routeStart = Date.now();
    let orchestrated: OrchestratedTask;
    let agentId: string;
    let agentName: string;

    if (params.preferredAgentId) {
      // User specifically selected an agent — use it directly
      const agent = await db.agent.findFirst({
        where: {
          agentId: params.preferredAgentId,
          status: 'active',
          agentCompanyAccess: { some: { companyId } },
        },
        select: {
          agentId: true, name: true, role: true, type: true,
          departmentName: true, departmentId: true, purpose: true, allowedSkills: true,
        },
      });
      if (!agent) throw new Error(`Agent ${params.preferredAgentId} not found for this company`);
      agentId = agent.agentId;
      agentName = agent.name;
      orchestrated = {
        id: taskId,
        task: params.task,
        selectedAgent: {
          ...agent,
          agentName: agent.name,
          score: 1.0,
          matchDetails: { department: 0, purpose: 0, skills: 0, role: 0 },
        },
        alternatives: [],
        reasoning: `User selected ${agent.name} directly.`,
      };
    } else {
      orchestrated = await this.routeTask(params.task, companyId);
      agentId = orchestrated.selectedAgent.agentId;
      agentName = orchestrated.selectedAgent.agentName;
    }
    const routingTimeMs = Date.now() - routeStart;

    // Emit task started event
    try {
      const eventBus = getEventBus();
      await eventBus.publish<OrchestratorTaskEventData>({
        id: `evt_${Date.now()}_started`,
        type: ORCHESTRATOR_EVENTS.TASK_STARTED,
        source: agentId,
        companyId,
        userId: params.userId,
        data: {
          taskId,
          agentId,
          companyId,
          userId: params.userId,
          task: params.task,
        },
        priority: 'normal',
        timestamp: new Date(),
        correlationId: taskId,
      });
    } catch (evtErr) {
      console.warn('[Orchestrator] Failed to emit task.started event:', evtErr);
    }

    try {
      // Step 2: Get or create conversation
      let conversationId = params.conversationId;
      let isFirstMessage = false;

      if (!conversationId) {
        // Create new conversation
        const conv = await db.conversation.create({
          data: {
            userId: params.userId,
            companyId,
            title: params.task.slice(0, 100),
            agentId: orchestrated.selectedAgent.agentId,
            departmentId: orchestrated.selectedAgent.departmentId,
          },
        });
        conversationId = conv.id;
        isFirstMessage = true;

        // Store user message
        await db.conversationMessage.create({
          data: {
            conversationId,
            role: 'user',
            content: params.task,
            metadata: JSON.stringify({ orchestratedTaskId: orchestrated.id }),
          },
        });
      } else {
        // Store user message in existing conversation
        await db.conversationMessage.create({
          data: {
            conversationId,
            role: 'user',
            content: params.task,
          },
        });
      }

      // Step 3: Load conversation history for context
      const historyMessages = await db.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20, // last 20 messages
      });

      // Step 4: Execute via the real Agent Execution Engine
      const execStart = Date.now();
      const engine = getExecutionEngine();
      const taskResult = await engine.execute({
        agentId: orchestrated.selectedAgent.agentId,
        companyId,
        userId: params.userId,
        task: params.task,
        mode: 'sync',
        context: historyMessages.length > 1
          ? { conversationHistory: historyMessages.slice(-10).map(m => ({ role: m.role, content: m.content })) }
          : undefined,
      });

      if (!taskResult.result) {
        throw new Error(taskResult.error?.message || 'Agent execution returned no result');
      }

      const result = taskResult.result;
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const model = (metadata?.model as string) || 'unknown';
      const contextTokens = typeof metadata?.estimatedContextTokens === 'number' ? metadata.estimatedContextTokens : undefined;
      const contextSources = typeof metadata?.contextSources === 'string' ? metadata.contextSources : '';
      const latencyMs = Date.now() - execStart;

      // Step 5: Store agent response in conversation
      const agentMessage = await db.conversationMessage.create({
        data: {
          conversationId,
          role: 'agent',
          agentId: orchestrated.selectedAgent.agentId,
          agentName: orchestrated.selectedAgent.agentName,
          content: result.content,
          model,
          tokensUsed: taskResult.tokenUsage?.totalTokens || 0,
          latencyMs,
          ...(typeof result.confidence === 'number' ? { confidence: result.confidence } : {}),
          metadata: JSON.stringify({
            routingScore: orchestrated.selectedAgent.score,
            routingReasoning: orchestrated.reasoning,
            contextSources,
            routingTimeMs,
            orchestratedTaskId: orchestrated.id,
          }),
        },
      });

      // Step 6: Store orchestrator routing metadata (no duplicate AgentRun — engine handles that)
      // The execution engine already creates the AgentRun record in runTask().
      // We only store orchestrator-specific routing metadata in the conversation message above.

      // Step 7: Write memory (learning loop)
      let memoryStored = false;
      try {
        const memory = getMemoryStore();
        // Episodic memory — what happened
        await memory.addEpisodic({
          agentId: orchestrated.selectedAgent.agentId,
          companyId,
          userId: params.userId,
          content: `Executed task: "${params.task.slice(0, 200)}" using ${model} (${latencyMs}ms)`,
          metadata: { model, tokens: taskResult.tokenUsage?.totalTokens, conversationId },
        });
        // Also persist to DB AgentMemory (FK to Agent.id, not Agent.agentId)
        const agentDbRecord = await db.agent.findUnique({
          where: { agentId: orchestrated.selectedAgent.agentId },
          select: { id: true },
        });
        if (agentDbRecord) {
          await db.agentMemory.create({
            data: {
              agentId: agentDbRecord.id,
              category: 'pattern',
              content: `Handled: ${params.task.slice(0, 150)} [${model}, ${latencyMs}ms]`,
              temperature: 'hot',
              confidence: 0,
              isVerified: false,
              successCount: 0,
              useCount: 0,
            },
          });
        }
        memoryStored = true;
      } catch (err) {
        console.warn('[Orchestrator] Memory write failed:', err);
      }

      // Step 8: Update conversation title if first message
      if (isFirstMessage) {
        await db.conversation.update({
          where: { id: conversationId },
          data: { title: params.task.slice(0, 80) },
        });
      }

      // Emit task completed event
      try {
        const eventBus = getEventBus();
        await eventBus.publish<OrchestratorTaskEventData>({
          id: `evt_${Date.now()}_completed`,
          type: ORCHESTRATOR_EVENTS.TASK_COMPLETED,
          source: agentId,
          companyId,
          userId: params.userId,
          data: {
            taskId,
            agentId,
            companyId,
            userId: params.userId,
            task: params.task,
            model,
            latencyMs,
            ...(typeof result.confidence === 'number' ? { confidence: result.confidence } : {}),
            contextSources,
          },
          priority: 'normal',
          timestamp: new Date(),
          correlationId: taskId,
        });
      } catch (evtErr) {
        console.warn('[Orchestrator] Failed to emit task.completed event:', evtErr);
      }

      return {
        content: result.content,
        ...(typeof result.confidence === 'number' ? { confidence: result.confidence } : {}),
        model,
        latencyMs,
        ...(typeof contextTokens === 'number' ? { contextTokens } : {}),
        contextSources,
        routing: {
          task: params.task,
          selectedAgent: {
            agentId: orchestrated.selectedAgent.agentId,
            agentName: orchestrated.selectedAgent.agentName,
            departmentName: orchestrated.selectedAgent.departmentName,
            role: orchestrated.selectedAgent.role,
            score: orchestrated.selectedAgent.score,
          },
          alternatives: orchestrated.alternatives.slice(0, 3).map(a => ({
            agentId: a.agentId,
            agentName: a.agentName,
            departmentName: a.departmentName,
            score: a.score,
          })),
          reasoning: orchestrated.reasoning,
          totalCandidates: 1 + orchestrated.alternatives.length,
          routingTimeMs,
        },
        conversationId,
        messageId: agentMessage.id,
        memoryStored,
      };
    } catch (error) {
      // Emit task failed event
      const errMsg = error instanceof Error ? error.message : String(error);
      try {
        const eventBus = getEventBus();
        await eventBus.publish<OrchestratorTaskEventData>({
          id: `evt_${Date.now()}_failed`,
          type: ORCHESTRATOR_EVENTS.TASK_FAILED,
          source: agentId,
          companyId,
          userId: params.userId,
          data: {
            taskId,
            agentId,
            companyId,
            userId: params.userId,
            task: params.task,
            error: errMsg,
          },
          priority: 'high',
          timestamp: new Date(),
          correlationId: taskId,
        });
      } catch (evtErr) {
        console.warn('[Orchestrator] Failed to emit task.failed event:', evtErr);
      }
      throw error;
    }
  }

  // ─── Adaptive Reasoning Paths ──────────────────────────────────────

  /**
   * Execute a task using an adaptive reasoning path.
   * Chooses between 4 paths based on task classification:
   * - FAST: Simple tasks → single agent → fast model → direct result
   * - STANDARD: Normal tasks → single agent → balanced model → RAG + context + validation
   * - COMPLEX: Complex tasks → single agent → reasoning model → full pipeline
   * - ENTERPRISE: Multi-department → parallel specialists → synthesis → review
   */
  async executeAdaptive(params: {
    task: string;
    userId: string;
    companyId: string;
    conversationId?: string;
    preferredAgentId?: string;
  }): Promise<AdaptiveResult> {
    const companyId = params.companyId;

    // Classify the task to determine the reasoning path
    const classification = classifyTask(params.task, 'orchestrator', 'router');
    const reasoningPath = await this.determineReasoningPath(params.task, classification, companyId);

    // Delegate to the appropriate path
    if (reasoningPath === 'enterprise') {
      // Enterprise path: multi-agent collaboration
      const collabResult = await this.executeCollaborative({
        task: params.task,
        userId: params.userId,
        companyId,
      });

      // Wrap collaboration result into AdaptiveResult shape
      return {
        content: collabResult.content,
        ...(typeof collabResult.synthesisConfidence === 'number' ? { confidence: collabResult.synthesisConfidence } : {}),
        model: collabResult.synthesisModel,
        latencyMs: collabResult.totalLatencyMs,
        contextSources: `collaboration:${collabResult.departmentsInvolved.join(',')}`,
        routing: {
          task: params.task,
          selectedAgent: {
            agentId: 'orchestrator',
            agentName: 'Orchestrator',
            departmentName: 'Enterprise',
            role: 'orchestrator',
            score: 1.0,
          },
          alternatives: collabResult.contributions.flatMap((contribution) =>
            typeof contribution.routingScore === 'number'
              ? [{
                  agentId: contribution.agentId,
                  agentName: contribution.agentName,
                  departmentName: contribution.departmentName,
                  score: contribution.routingScore,
                }]
              : [],
          ),
          reasoning: `Enterprise path: ${collabResult.departmentsInvolved.length} departments, ${collabResult.contributions.length} agents`,
          totalCandidates: collabResult.contributions.length,
          routingTimeMs: 0,
        },
        conversationId: collabResult.collaborationSessionId,
        messageId: collabResult.collaborationSessionId,
        memoryStored: false,
        reasoningPath,
        classification,
      };
    }

    if (reasoningPath === 'fast') {
      // FAST PATH: single agent, fast model, minimal overhead
      return this.executeFastPath(params, classification);
    }

    if (reasoningPath === 'complex') {
      // COMPLEX PATH: single agent, reasoning model, full pipeline
      return this.executeComplexPath(params, classification);
    }

    // STANDARD PATH: normal execution (current behavior)
    const standardResult = await this.execute(params);
    return {
      ...standardResult,
      reasoningPath: 'standard',
      classification,
    };
  }

  // ─── Multi-Agent Collaboration ──────────────────────────────────────

  /**
   * Execute a task using multi-agent collaboration.
   * Classifies the task, detects cross-department needs, routes sub-tasks
   * to specialist agents in parallel, then synthesizes results.
   */
  async executeCollaborative(params: {
    task: string;
    userId: string;
    companyId: string;
  }): Promise<CollaborationResult> {
    const companyId = params.companyId;
    const membership = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId: params.userId } },
      select: { id: true },
    });
    if (!membership) throw new Error('Forbidden');
    const collabStart = Date.now();

    // Step 1: Get the active agents available to this company.
    const agents = await db.agent.findMany({
      where: { status: 'active', agentCompanyAccess: { some: { companyId } } },
      select: {
        agentId: true, name: true, role: true, type: true,
        departmentName: true, departmentId: true, purpose: true, allowedSkills: true,
      },
    });

    const allDepartments = [...new Set(agents.map(a => a.departmentName))];

    // Step 2: Classify and detect delegation needs
    const classification = classifyTask(params.task, 'orchestrator', 'router');
    const delegation = detectDelegationNeed(params.task, 'Enterprise', 'orchestrator', allDepartments);

    // Step 3: Determine which departments are involved
    // Group agents by department and find the best per department
    const taskKeywords = extractKeywords(params.task);
    const departmentAgents = new Map<string, typeof agents>();
    for (const agent of agents) {
      const dept = agent.departmentName;
      if (!departmentAgents.has(dept)) {
        departmentAgents.set(dept, []);
      }
      departmentAgents.get(dept)!.push(agent);
    }

    // Score departments by relevance to the task
    const scoredDepts: Array<{ dept: string; deptId: string; bestAgent: RoutingCandidate; score: number }> = [];
    for (const [dept, deptAgentsList] of departmentAgents) {
      const deptAgent = deptAgentsList[0]; // use first agent for dept scoring
      const deptKeywords = extractKeywords(dept);
      const deptScore = jaccardSimilarity(taskKeywords, deptKeywords);

      // Also score each agent in the dept and take the best
      let bestScore = 0;
      let bestCandidate: RoutingCandidate | null = null;
      for (const agent of deptAgentsList) {
        const candidate = scoreAgent(taskKeywords, agent);
        if (candidate.score > bestScore) {
          bestScore = candidate.score;
          bestCandidate = candidate;
        }
      }

      // Include department if it has any relevance or delegation targets it
      const isTarget = delegation.shouldDelegate && delegation.targetDepartment?.toLowerCase() === dept.toLowerCase();
      if (bestScore > 0.05 || isTarget) {
        if (bestCandidate) {
          scoredDepts.push({
            dept,
            deptId: bestCandidate.departmentId,
            bestAgent: bestCandidate,
            score: isTarget ? Math.max(bestScore, 0.5) : bestScore,
          });
        }
      }
    }

    // Take top departments (min 2 for enterprise, max 5)
    scoredDepts.sort((a, b) => b.score - a.score);
    const selectedDepts = scoredDepts.slice(0, 5);

    if (selectedDepts.length < 2) {
      // Not truly multi-department — fall back to single agent
      const fallbackResult = await this.execute({
        task: params.task,
        userId: params.userId,
        companyId,
      });
      return {
        content: fallbackResult.content,
        reasoningPath: 'enterprise',
        collaborationSessionId: '',
        contributions: [{
          agentId: fallbackResult.routing.selectedAgent.agentId,
          agentName: fallbackResult.routing.selectedAgent.agentName,
          departmentName: fallbackResult.routing.selectedAgent.departmentName,
          subTask: params.task,
          result: fallbackResult.content,
          ...(typeof fallbackResult.confidence === 'number' ? { confidence: fallbackResult.confidence } : {}),
          routingScore: fallbackResult.routing.selectedAgent.score,
          latencyMs: fallbackResult.latencyMs,
          status: 'fulfilled',
        }],
        totalLatencyMs: fallbackResult.latencyMs,
        departmentsInvolved: [fallbackResult.routing.selectedAgent.departmentName],
        synthesisModel: fallbackResult.model,
        synthesisConfidence: fallbackResult.confidence,
      };
    }

    // Step 4: Execute sub-tasks in parallel via Promise.allSettled
    const engine = getExecutionEngine();
    const subTaskPromises = selectedDepts.map(async (deptInfo) => {
      try {
        const taskResult = await engine.execute({
          agentId: deptInfo.bestAgent.agentId,
          companyId,
          userId: params.userId,
          task: params.task,
          mode: 'sync',
        });
        return {
          agentId: deptInfo.bestAgent.agentId,
          agentName: deptInfo.bestAgent.agentName,
          departmentName: deptInfo.dept,
          subTask: params.task,
          result: taskResult.result?.content || '',
          routingScore: deptInfo.score,
          ...(typeof taskResult.result?.confidence === 'number' ? { confidence: taskResult.result.confidence } : {}),
          latencyMs: taskResult.result?.metadata?.latencyMs as number || 0,
          status: 'fulfilled' as const,
        };
      } catch (error) {
        return {
          agentId: deptInfo.bestAgent.agentId,
          agentName: deptInfo.bestAgent.agentName,
          departmentName: deptInfo.dept,
          subTask: params.task,
          result: '',
          routingScore: deptInfo.score,
          latencyMs: 0,
          status: 'rejected' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const contributions = await Promise.allSettled(subTaskPromises);
    const agentContributions: AgentContribution[] = contributions.map(r =>
      r.status === 'fulfilled' ? r.value : {
        agentId: 'unknown',
        agentName: 'Unknown',
        departmentName: 'Unknown',
        subTask: params.task,
        result: '',
        latencyMs: 0,
        status: 'rejected' as const,
        error: r.reason?.message || String(r.reason),
      }
    );

    // Step 5: Synthesize results using AI
    const fulfilledContributions = agentContributions.filter(c => c.status === 'fulfilled' && c.result);
    let synthesizedContent = '';
    let synthesisModel = 'unknown';
    let synthesisConfidence: number | undefined;

    if (fulfilledContributions.length > 0) {
      try {
        const synthesisPrompt = this.buildSynthesisPrompt(params.task, fulfilledContributions);
        const router = getRouter();
        const synthesisResponse = await router.chat(
          {
            model: 'reasoning',
            messages: [
              { role: 'system', content: 'You are a synthesis specialist. Combine multiple expert perspectives into a single coherent, comprehensive response. Preserve all key insights and attribute them to their source department.' },
              { role: 'user', content: synthesisPrompt },
            ],
            maxTokens: 4096,
            temperature: 0.5,
          },
          companyId,
          'orchestrator',
        );
        synthesizedContent = synthesisResponse.content;
        synthesisModel = synthesisResponse.model;
        const knownConfidences = fulfilledContributions.flatMap((contribution) => typeof contribution.confidence === 'number' ? [contribution.confidence] : []);
        synthesisConfidence = knownConfidences.length > 0
          ? knownConfidences.reduce((sum, confidence) => sum + confidence, 0) / knownConfidences.length
          : undefined;
      } catch (synthErr) {
        console.warn('[Orchestrator] Synthesis failed, falling back to concatenation:', synthErr);
        synthesizedContent = fulfilledContributions
          .map(c => `### ${c.departmentName} (${c.agentName})\n${c.result}`)
          .join('\n\n');
        synthesisModel = 'fallback';
        const knownConfidences = fulfilledContributions.flatMap((contribution) => typeof contribution.confidence === 'number' ? [contribution.confidence] : []);
        synthesisConfidence = knownConfidences.length > 0
          ? knownConfidences.reduce((sum, confidence) => sum + confidence, 0) / knownConfidences.length
          : undefined;
      }
    } else {
      synthesizedContent = 'All specialist agents failed to produce results. Please try again or rephrase the task.';
    }

    const totalLatencyMs = Date.now() - collabStart;
    const departmentsInvolved = selectedDepts.map(d => d.dept);

    // Step 6: Store CollaborationSession in DB
    let collaborationSessionId = '';
    try {
      const session = await db.collaborationSession.create({
        data: {
          title: params.task.slice(0, 200),
          companyId,
          userId: params.userId,
          type: 'task',
          status: 'completed',
          agentIds: JSON.stringify(agentContributions.map(c => c.agentId)),
          messages: JSON.stringify(agentContributions.map(c => ({
            agentName: c.agentName,
            department: c.departmentName,
            content: c.result,
            status: c.status,
          }))),
          taskInput: params.task,
          taskOutput: synthesizedContent,
          metrics: JSON.stringify({
            totalLatencyMs,
            departmentsInvolved,
            agentCount: agentContributions.length,
            fulfilledCount: fulfilledContributions.length,
            synthesisModel,
            synthesisConfidence,
          }),
        },
      });
      collaborationSessionId = session.id;
    } catch (dbErr) {
      console.warn('[Orchestrator] Failed to store CollaborationSession:', dbErr);
      collaborationSessionId = `collab_${Date.now()}`;
    }

    return {
      content: synthesizedContent,
      reasoningPath: 'enterprise',
      collaborationSessionId,
      contributions: agentContributions,
      totalLatencyMs,
      departmentsInvolved,
      synthesisModel,
      synthesisConfidence,
    };
  }

  // ─── Existing Methods (unchanged) ───────────────────────────────────

  /** Get conversation history */
  async getConversation(conversationId: string) {
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return conversation;
  }

  /** List conversations for a user */
  async listConversations(userId: string, companyId?: string, limit = 20) {
    return db.conversation.findMany({
      where: {
        userId,
        ...(companyId ? { companyId } : {}),
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // last message for preview
        },
      },
    });
  }

  /** Get recent agent runs (activity feed) for one company. */
  async getRecentRuns(limit: number, companyId: string) {
    return db.agentRun.findMany({
      where: { companyId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentName: true,
        model: true,
        tokensUsed: true,
        latencyMs: true,
        confidence: true,
        contextSources: true,
        createdAt: true,
      },
    });
  }

  /** Get company-scoped orchestrator stats. */
  async getStats(companyId: string) {
    const availableToCompany = { agentCompanyAccess: { some: { companyId } } };
    const [totalAgents, activeAgents, totalConversations, totalMessages, recentRuns] = await Promise.all([
      db.agent.count({ where: availableToCompany }),
      db.agent.count({ where: { ...availableToCompany, status: 'active' } }),
      db.conversation.count({ where: { companyId } }),
      db.conversationMessage.count({ where: { conversation: { companyId } } }),
      db.agentRun.count({ where: { companyId, status: 'completed' } }),
    ]);

    return {
      totalAgents,
      activeAgents,
      totalConversations,
      totalMessages,
      totalExecutions: recentRuns,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Determine the reasoning path based on classification and department spread.
   */
  private async determineReasoningPath(
    task: string,
    classification: TaskClassification,
    companyId: string,
  ): Promise<AdaptiveReasoningPath> {
    // Check for enterprise (multi-department) first, using this company's agents only.
    const isMultiDept = await this.isMultiDepartmentTask(task, companyId);
    if (isMultiDept) return 'enterprise';

    // Map classification complexity to path
    switch (classification.complexity) {
      case 'simple':
        return 'fast';
      case 'normal':
        return 'standard';
      case 'complex':
      case 'reasoning':
      case 'coding':
      case 'vision':
      case 'embedding':
        return 'complex';
      default:
        return 'standard';
    }
  }

  /**
   * Check if a task spans multiple departments by analyzing agent keyword matches.
   */
  private async isMultiDepartmentTask(task: string, companyId: string): Promise<boolean> {
    const agents = await db.agent.findMany({
      where: { status: 'active', agentCompanyAccess: { some: { companyId } } },
      select: { departmentName: true, purpose: true, agentId: true },
    });

    const taskKeywords = extractKeywords(task);
    const matchingDepts = new Set<string>();

    for (const agent of agents) {
      const purposeKw = extractKeywords(agent.purpose);
      const deptKw = extractKeywords(agent.departmentName);
      const relevance = Math.max(
        jaccardSimilarity(taskKeywords, purposeKw),
        jaccardSimilarity(taskKeywords, deptKw),
      );
      if (relevance > 0.1) {
        matchingDepts.add(agent.departmentName);
      }
    }

    // Enterprise if task matches 2+ departments
    return matchingDepts.size >= 2;
  }

  /**
   * Get preferred roles for a given task complexity.
   * Used for hierarchy-aware agent selection.
   */
  private getPreferredRolesForComplexity(complexity: string): string[] {
    switch (complexity) {
      case 'simple':
      case 'normal':
        return ['specialist', 'worker'];
      case 'complex':
      case 'reasoning':
      case 'coding':
        return ['manager', 'strategist'];
      case 'vision':
      case 'embedding':
        return ['specialist', 'worker'];
      default:
        return [];
    }
  }

  /**
   * Get recent AgentRun counts per agent (last 1 hour) for workload assessment.
   */
  private async getRecentRunCounts(companyId: string): Promise<Map<string, number>> {
    const oneHourAgo = new Date(Date.now() - 3600_000)
    const recentRuns = await db.agentRun.findMany({
      where: { companyId, status: 'completed', createdAt: { gte: oneHourAgo } },
      select: { agentId: true },
    })
    const countsByDatabaseId = new Map<string, number>()
    for (const run of recentRuns) {
      countsByDatabaseId.set(run.agentId, (countsByDatabaseId.get(run.agentId) ?? 0) + 1)
    }
    const agents = await db.agent.findMany({
      where: { id: { in: [...countsByDatabaseId.keys()] }, agentCompanyAccess: { some: { companyId } } },
      select: { id: true, agentId: true },
    })
    return new Map(agents.map((agent) => [agent.agentId, countsByDatabaseId.get(agent.id) ?? 0]))
  }

  /**
   * FAST PATH: Simple tasks → single agent → fast model → direct result.
   * Skips heavy memory writes and extra processing.
   */
  private async executeFastPath(
    params: {
      task: string;
      userId: string;
      companyId: string;
      conversationId?: string;
      preferredAgentId?: string;
    },
    classification: TaskClassification,
  ): Promise<AdaptiveResult> {
    const companyId = params.companyId;
    const routeStart = Date.now();

    // Route to best agent
    const orchestrated: OrchestratedTask = params.preferredAgentId
      ? await this.routeTaskForPreferred(params)
      : await this.routeTask(params.task, companyId);
    const routingTimeMs = Date.now() - routeStart;

    // Execute via engine (engine will auto-classify as simple → fast model)
    const execStart = Date.now();
    const engine = getExecutionEngine();
    const taskResult = await engine.execute({
      agentId: orchestrated.selectedAgent.agentId,
      companyId,
      userId: params.userId,
      task: params.task,
      mode: 'sync',
    });

    if (!taskResult.result) {
      throw new Error(taskResult.error?.message || 'Fast path execution returned no result');
    }

    const result = taskResult.result;
    const metadata = result.metadata as Record<string, unknown> | undefined;
    const model = (metadata?.model as string) || 'unknown';
    const contextTokens = typeof metadata?.estimatedContextTokens === 'number' ? metadata.estimatedContextTokens : undefined;
    const contextSources = typeof metadata?.contextSources === 'string' ? metadata.contextSources : '';
    const latencyMs = Date.now() - execStart;

    return {
      content: result.content,
      ...(typeof result.confidence === 'number' ? { confidence: result.confidence } : {}),
      model,
      latencyMs,
      ...(typeof contextTokens === 'number' ? { contextTokens } : {}),
      contextSources,
      routing: {
        task: params.task,
        selectedAgent: {
          agentId: orchestrated.selectedAgent.agentId,
          agentName: orchestrated.selectedAgent.agentName,
          departmentName: orchestrated.selectedAgent.departmentName,
          role: orchestrated.selectedAgent.role,
          score: orchestrated.selectedAgent.score,
        },
        alternatives: orchestrated.alternatives.slice(0, 3).map(a => ({
          agentId: a.agentId,
          agentName: a.agentName,
          departmentName: a.departmentName,
          score: a.score,
        })),
        reasoning: orchestrated.reasoning,
        totalCandidates: 1 + orchestrated.alternatives.length,
        routingTimeMs,
      },
      conversationId: '',
      messageId: '',
      memoryStored: false,
      reasoningPath: 'fast',
      classification,
    };
  }

  /**
   * COMPLEX PATH: Complex tasks → single agent → reasoning model → full pipeline.
   * Uses the standard execute() for the full pipeline (RAG + context + validation + memory).
   */
  private async executeComplexPath(
    params: {
      task: string;
      userId: string;
      companyId: string;
      conversationId?: string;
      preferredAgentId?: string;
    },
    classification: TaskClassification,
  ): Promise<AdaptiveResult> {
    // Complex path uses the full standard pipeline which already includes
    // RAG, context building, validation, and memory storage.
    // The execution engine will auto-classify as complex → reasoning model.
    const standardResult = await this.execute(params);
    return {
      ...standardResult,
      reasoningPath: 'complex',
      classification,
    };
  }

  /**
   * Helper for fast path: build OrchestratedTask from a preferred agent.
   */
  private async routeTaskForPreferred(params: {
    task: string;
    companyId: string;
    preferredAgentId?: string;
  }): Promise<OrchestratedTask> {
    if (!params.preferredAgentId) {
      return this.routeTask(params.task, params.companyId);
    }
    const agent = await db.agent.findFirst({
      where: {
        agentId: params.preferredAgentId,
        status: 'active',
        agentCompanyAccess: { some: { companyId: params.companyId } },
      },
      select: {
        agentId: true, name: true, role: true, type: true,
        departmentName: true, departmentId: true, purpose: true, allowedSkills: true,
      },
    });
    if (!agent) throw new Error(`Agent ${params.preferredAgentId} not found`);
    return {
      id: `orch_${Date.now()}`,
      task: params.task,
      selectedAgent: {
        ...agent,
        agentName: agent.name,
        score: 1.0,
        matchDetails: { department: 0, purpose: 0, skills: 0, role: 0 },
      },
      alternatives: [],
      reasoning: `User selected ${agent.name} directly.`,
    };
  }

  /**
   * Build a synthesis prompt for combining multiple agent perspectives.
   */
  private buildSynthesisPrompt(task: string, contributions: AgentContribution[]): string {
    const parts: string[] = [];
    parts.push(`# Original Task\n${task}\n`);
    parts.push('# Specialist Perspectives\n');
    for (let i = 0; i < contributions.length; i++) {
      const c = contributions[i];
      const confidenceLabel = typeof c.confidence === 'number'
        ? `Provider confidence: ${(c.confidence * 100).toFixed(0)}%`
        : 'Provider confidence: not reported';
      parts.push(`## ${i + 1}. ${c.agentName} (${c.departmentName}) — ${confidenceLabel}\n`);
      parts.push(c.result);
      parts.push('');
    }
    parts.push('---');
    parts.push('Please synthesize the above specialist perspectives into a single comprehensive response. ');
    parts.push('Integrate insights from all departments, resolve any conflicts, and provide a unified answer.');
    return parts.join('\n');
  }
}

// Singleton
let _instance: UnifiedOrchestrator | null = null;
export function getOrchestrator(): UnifiedOrchestrator {
  if (!_instance) _instance = new UnifiedOrchestrator();
  return _instance;
}