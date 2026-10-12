// ---------------------------------------------------------------------------
// ALO Labs — AI Command Center: Intent Parser & Workflow Dispatcher
//
// This module provides real intent parsing and workflow dispatch for the
// AI Command Center.  It maps natural-language queries to multi-step
// workflows that call actual API routes in the project.
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export interface ParsedIntent {
  /** e.g. 'grow_business', 'create_content', 'generate_leads' */
  action: string;
  /** Extracted entities (platform, count, timeframe, etc.) */
  entities: Record<string, string>;
  /** 0-1 confidence score */
  confidence: number;
  /** The original user query */
  originalQuery: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'api_call' | 'ai_generation' | 'data_fetch' | 'scheduled_action';
  /** Relative endpoint (no host) — e.g. '/api/analytics' */
  endpoint?: string;
  /** HTTP method for api_call / data_fetch steps */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Payload sent with POST/PUT requests */
  payload?: Record<string, unknown>;
  /** Delay in ms before executing (for scheduled_action) */
  delay?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  /** The intent action this workflow satisfies */
  intent: string;
  steps: WorkflowStep[];
  /** Whether the workflow needs human approval before execution */
  requiresApproval: boolean;
}

// ---- Intent Patterns ------------------------------------------------------

interface IntentPattern {
  pattern: RegExp;
  action: string;
  extractors: Record<string, RegExp>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    pattern: /grow\s+(my\s+)?business/i,
    action: 'grow_business',
    extractors: {},
  },
  {
    pattern: /create\s+(today'?s?)?\s*content/i,
    action: 'create_content',
    extractors: { timeframe: /today|this week|this month/i },
  },
  {
    pattern: /generate\s+leads/i,
    action: 'generate_leads',
    extractors: { count: /(\d+)/i },
  },
  {
    pattern: /run\s+(seo|search\s*engine)\s*challenge/i,
    action: 'seo_challenge',
    extractors: { duration: /(\d+)\s*day/i },
  },
  {
    pattern: /publish\s+(all\s+)?scheduled\s*posts/i,
    action: 'publish_scheduled',
    extractors: {},
  },
  {
    pattern: /create\s+a?\s*(sales\s+)?funnel/i,
    action: 'create_funnel',
    extractors: {},
  },
  {
    pattern: /build\s+a?\s*(marketing\s+)?campaign/i,
    action: 'create_campaign',
    extractors: {},
  },
  {
    pattern: /create\s+(my\s+)?marketing\s+strategy/i,
    action: 'create_strategy',
    extractors: {},
  },
  {
    pattern: /send\s+(sms|email|message)/i,
    action: 'send_message',
    extractors: { channel: /(sms|email|message)/i, recipient: /to\s+([^\s,]+)/i },
  },
  {
    pattern: /analyz(s|e)\s+(my\s+)?(social\s+)?performance/i,
    action: 'analyze_performance',
    extractors: {},
  },
];

// ---- Workflow Templates ---------------------------------------------------

interface WorkflowTemplate {
  name: string;
  description: string;
  steps: WorkflowStep[];
  requiresApproval: boolean;
}

const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  grow_business: {
    name: 'Grow Business Pipeline',
    description: 'Analyzes current analytics and deploys growth-focused agents',
    requiresApproval: false,
    steps: [
      { id: 'gb-1', name: 'Fetch global analytics', type: 'data_fetch', endpoint: '/api/analytics', method: 'GET' },
      { id: 'gb-2', name: 'Fetch social analytics', type: 'data_fetch', endpoint: '/api/social/analytics', method: 'GET' },
      { id: 'gb-3', name: 'Deploy growth agents', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'grow_business' } },
    ],
  },
  create_content: {
    name: 'Content Creation Workflow',
    description: 'Generates and publishes social media content',
    requiresApproval: true,
    steps: [
      { id: 'cc-1', name: 'Generate content via AI', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'create_content' } },
      { id: 'cc-2', name: 'Auto-tag media', type: 'api_call', endpoint: '/api/media/ai-tag', method: 'POST', payload: { autoTag: true } },
      { id: 'cc-3', name: 'Publish to social platforms', type: 'api_call', endpoint: '/api/social/publish', method: 'POST', payload: { schedule: false } },
    ],
  },
  generate_leads: {
    name: 'Lead Generation Workflow',
    description: 'Fetches existing contacts and runs AI-powered lead generation',
    requiresApproval: false,
    steps: [
      { id: 'gl-1', name: 'Fetch CRM contacts', type: 'data_fetch', endpoint: '/api/crm/contacts', method: 'GET' },
      { id: 'gl-2', name: 'Run lead scoring & enrichment', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'generate_leads' } },
      { id: 'gl-3', name: 'Store new leads', type: 'api_call', endpoint: '/api/crm/contacts', method: 'POST', payload: { source: 'ai_generated' } },
    ],
  },
  seo_challenge: {
    name: 'SEO Challenge Workflow',
    description: 'Starts an SEO improvement challenge with duration tracking',
    requiresApproval: true,
    steps: [
      { id: 'sc-1', name: 'Create SEO challenge', type: 'api_call', endpoint: '/api/seo/challenges', method: 'POST', payload: { type: 'seo_challenge' } },
    ],
  },
  publish_scheduled: {
    name: 'Publish Scheduled Posts',
    description: 'Fetches pending scheduled posts and publishes them',
    requiresApproval: false,
    steps: [
      { id: 'ps-1', name: 'List automation triggers', type: 'data_fetch', endpoint: '/api/automation/triggers', method: 'GET' },
      { id: 'ps-2', name: 'Execute publish actions', type: 'api_call', endpoint: '/api/automation/execute', method: 'POST', payload: { action: 'publish_scheduled' } },
    ],
  },
  create_funnel: {
    name: 'Sales Funnel Builder',
    description: 'Creates a new sales funnel with AI-optimized stages',
    requiresApproval: true,
    steps: [
      { id: 'cf-1', name: 'Build funnel', type: 'ai_generation', endpoint: '/api/funnels', method: 'POST', payload: { generateWithAI: true } },
    ],
  },
  create_campaign: {
    name: 'Marketing Campaign Builder',
    description: 'Creates and schedules a multi-platform marketing campaign',
    requiresApproval: true,
    steps: [
      { id: 'cp-1', name: 'Generate campaign assets', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'create_campaign' } },
      { id: 'cp-2', name: 'Schedule campaign posts', type: 'api_call', endpoint: '/api/social/publish', method: 'POST', payload: { schedule: true } },
    ],
  },
  create_strategy: {
    name: 'Marketing Strategy Generator',
    description: 'Uses AI agents to produce a data-driven marketing strategy',
    requiresApproval: false,
    steps: [
      { id: 'cs-1', name: 'Fetch analytics for context', type: 'data_fetch', endpoint: '/api/analytics', method: 'GET' },
      { id: 'cs-2', name: 'Generate strategy', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'create_strategy' } },
    ],
  },
  send_message: {
    name: 'Outbound Message Workflow',
    description: 'Sends SMS or email to a specified recipient',
    requiresApproval: true,
    steps: [
      { id: 'sm-1', name: 'Dispatch message', type: 'api_call', endpoint: '/api/sms', method: 'POST', payload: { channel: 'sms' } },
    ],
  },
  analyze_performance: {
    name: 'Performance Analysis Workflow',
    description: 'Aggregates analytics across all platforms for reporting',
    requiresApproval: false,
    steps: [
      { id: 'ap-1', name: 'Fetch global analytics', type: 'data_fetch', endpoint: '/api/analytics', method: 'GET' },
      { id: 'ap-2', name: 'Fetch social analytics', type: 'data_fetch', endpoint: '/api/social/analytics', method: 'GET' },
      { id: 'ap-3', name: 'Generate performance report', type: 'ai_generation', endpoint: '/api/agents/execute', method: 'POST', payload: { command: 'analyze_performance' } },
    ],
  },
};

// ---- parseIntent ----------------------------------------------------------

/**
 * Parses a natural-language query into a structured intent.
 * Iterates through INTENT_PATTERNS and returns the first match.
 * Falls back to `general_chat` with 0.5 confidence.
 */
export function parseIntent(query: string): ParsedIntent {
  const trimmed = query.trim();
  if (!trimmed) {
    return { action: 'general_chat', entities: {}, confidence: 0, originalQuery: query };
  }

  for (const { pattern, action, extractors } of INTENT_PATTERNS) {
    if (!pattern.test(trimmed)) continue;

    // Reset regex state
    pattern.lastIndex = 0;

    const entities: Record<string, string> = {};
    for (const [key, extractor] of Object.entries(extractors)) {
      const match = trimmed.match(extractor);
      if (match) {
        entities[key] = match[1] || match[0];
      }
    }

    return {
      action,
      entities,
      confidence: 0.9,
      originalQuery: trimmed,
    };
  }

  return { action: 'general_chat', entities: {}, confidence: 0.5, originalQuery: trimmed };
}

// ---- buildWorkflow --------------------------------------------------------

/**
 * Maps a parsed intent to a concrete Workflow with real API endpoint steps.
 * Returns a no-step workflow for `general_chat` (handled purely by LLM).
 */
export function buildWorkflow(intent: ParsedIntent): Workflow {
  const template = WORKFLOW_TEMPLATES[intent.action];

  if (!template) {
    return {
      id: `wf-general-${Date.now()}`,
      name: 'General AI Chat',
      description: 'Handled directly by the LLM — no workflow steps required.',
      intent: intent.action,
      steps: [],
      requiresApproval: false,
    };
  }

  // Inject entity values into step payloads where applicable
  const enrichedSteps = template.steps.map((step) => {
    const enriched = { ...step };

    // Inject channel for send_message
    if (intent.action === 'send_message' && step.endpoint === '/api/sms') {
      const channel = intent.entities.channel || 'sms';
      enriched.endpoint = channel === 'email' ? '/api/email/send' : '/api/sms';
      enriched.payload = { ...(step.payload || {}), channel };
    }
    // Inject recipient for send_message
    if (intent.entities.recipient && enriched.payload) {
      enriched.payload = { ...enriched.payload, recipient: intent.entities.recipient };
    }
    // Inject duration for seo_challenge
    if (intent.action === 'seo_challenge' && intent.entities.duration && enriched.payload) {
      enriched.payload = { ...enriched.payload, duration: intent.entities.duration };
    }
    // Inject count for generate_leads
    if (intent.action === 'generate_leads' && intent.entities.count && enriched.payload) {
      enriched.payload = { ...enriched.payload, count: intent.entities.count };
    }
    // Inject timeframe for create_content
    if (intent.action === 'create_content' && intent.entities.timeframe && enriched.payload) {
      enriched.payload = { ...enriched.payload, timeframe: intent.entities.timeframe };
    }

    return enriched;
  });

  return {
    id: `wf-${intent.action}-${Date.now()}`,
    name: template.name,
    description: template.description,
    intent: intent.action,
    steps: enrichedSteps,
    requiresApproval: template.requiresApproval,
  };
}

// ---- executeWorkflow ------------------------------------------------------

interface StepResult extends WorkflowStep {
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Executes a workflow's steps sequentially against real API endpoints.
 * Stops on first error but returns all completed steps plus the failed one.
 */
export async function executeWorkflow(
  workflow: Workflow,
  baseUrl: string,
  token: string,
): Promise<StepResult[]> {
  if (workflow.steps.length === 0) return [];

  const results: StepResult[] = [];

  for (const step of workflow.steps) {
    const stepResult: StepResult = { ...step, status: 'running' };
    const start = Date.now();

    try {
      // Handle scheduled_action — just a delay marker, no actual fetch
      if (step.type === 'scheduled_action') {
        const delay = step.delay ?? 0;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        stepResult.status = 'completed';
        stepResult.result = { scheduled: true, delayMs: delay };
        stepResult.durationMs = Date.now() - start;
        results.push(stepResult);
        continue;
      }

      if (!step.endpoint) {
        stepResult.status = 'failed';
        stepResult.error = 'No endpoint defined';
        results.push(stepResult);
        break;
      }

      const url = `${baseUrl}${step.endpoint}`;
      const fetchOptions: RequestInit = {
        method: step.method || 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      if (step.payload && ['POST', 'PUT', 'PATCH'].includes(step.method || 'POST')) {
        fetchOptions.body = JSON.stringify(step.payload);
      }

      const response = await fetch(url, fetchOptions);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        stepResult.status = 'failed';
        stepResult.error = `HTTP ${response.status}: ${data?.error || 'Unknown error'}`;
        results.push(stepResult);
        break; // stop on first error
      }

      stepResult.status = 'completed';
      stepResult.result = data;
      stepResult.durationMs = Date.now() - start;
      results.push(stepResult);
    } catch (err: unknown) {
      stepResult.status = 'failed';
      stepResult.error = err instanceof Error ? err.message : String(err);
      results.push(stepResult);
      break; // stop on first error
    }
  }

  return results;
}