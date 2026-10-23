/**
 * Curated capability manifests for the existing AgentOS runtime.
 * This is intentionally an adapter/manifest registry, not an arbitrary plugin loader:
 * entries may only point at capabilities already implemented in this repository.
 */

export type CapabilityStatus = 'integrated' | 'partial' | 'not_verified';

export interface AgentCapabilityManifest {
  id: string;
  name: string;
  version: string;
  category: 'orchestration' | 'coding' | 'research' | 'browser' | 'rag' | 'documents' | 'marketing' | 'crm' | 'education' | 'evaluation' | 'memory' | 'safety' | 'inference';
  description: string;
  status: CapabilityStatus;
  implementation: string[];
  permissions: string[];
  execution: {
    input: 'task-and-tenant-context';
    output: 'structured-execution-result';
    retries: 'runtime-policy';
    humanApproval: boolean;
  };
  health: { check: 'source-reference-only'; evidence: string };
  evaluation: { score: null; note: string };
}

const manifest = (
  id: string, name: string, category: AgentCapabilityManifest['category'], description: string,
  implementation: string[], permissions: string[], status: CapabilityStatus = 'integrated', humanApproval = false,
): AgentCapabilityManifest => ({
  id, name, version: '1.0.0', category, description, status, implementation, permissions,
  execution: { input: 'task-and-tenant-context', output: 'structured-execution-result', retries: 'runtime-policy', humanApproval },
  health: { check: 'source-reference-only', evidence: implementation.length ? `Source pointers only; not a runtime health check. ${implementation.join('; ')}` : 'No implementation pointer; capability is not verified.' },
  evaluation: { score: null, note: 'No comparable production evaluation score is recorded; do not infer quality from presence.' },
});

export const AGENT_CAPABILITIES: readonly AgentCapabilityManifest[] = [
  manifest('agent.task-execution', 'Agent task execution', 'orchestration', 'Tenant-scoped agent task execution with model routing and bounded tool loops.', ['src/lib/agent-runtime/execution.ts', 'src/lib/agent-runtime/tool-loop.ts'], ['agent.execute', 'model.invoke', 'tool.execute']),
  manifest('agent.multi-step-orchestration', 'Multi-agent orchestration', 'orchestration', 'Sequential, parallel, conditional, delegation and review orchestration paths.', ['src/lib/multi-agent-orchestrator/orchestrator.ts'], ['agent.delegate', 'agent.execute']),
  manifest('agent.model-routing', 'Model routing', 'inference', 'Routes requests through configured model providers; live provider availability is environment-dependent.', ['src/lib/ai-router/router.ts', 'src/lib/ai-router/provider-registry.ts'], ['model.invoke']),
  manifest('agent.tool-permissions', 'Permissioned tool execution', 'safety', 'Tools are permission checked during agent execution; each tool still needs focused security tests.', ['src/lib/agent-runtime/tool-loop.ts', 'src/lib/tools'], ['tool.execute'], 'partial'),
  manifest('agent.rag-memory', 'Knowledge retrieval and memory', 'rag', 'Existing retrieval and execution-memory pipeline; tenant isolation and source validation are not fully certified.', ['src/lib/agent-runtime/pipeline.ts', 'src/lib/agent-learning'], ['knowledge.read', 'memory.read', 'memory.write'], 'partial'),
  manifest('agent.evaluation', 'Agent evaluation', 'evaluation', 'Evaluation and quality-control code exists; production benchmark scores are not certified.', ['src/app/api/evaluations/route.ts', 'src/lib/agent-runtime/pipeline.ts'], ['evaluation.run'], 'partial'),
  manifest('agent.human-approval', 'Human approval gate', 'safety', 'Approval-required work must remain gated; workflow continuation and consequential integrations require end-to-end verification.', ['src/lib/approval-engine', 'src/lib/multi-agent-orchestrator/orchestrator.ts'], ['approval.request', 'approval.resolve'], 'partial', true),
  manifest('agent.browser-automation', 'Browser automation', 'browser', 'No certified isolated browser execution adapter is currently present.', [], [], 'not_verified'),
  manifest('agent.external-crm-education-marketing', 'CRM, education and MarketingOS connectors', 'crm', 'No capability is declared enabled here without a verified authenticated tenant-scoped connector.', [], [], 'not_verified', true),
];

export function listAgentCapabilities(filters: { category?: string; status?: string; search?: string } = {}) {
  const search = filters.search?.trim().toLocaleLowerCase();
  return AGENT_CAPABILITIES.filter((item) =>
    (!filters.category || item.category === filters.category) &&
    (!filters.status || item.status === filters.status) &&
    (!search || `${item.id} ${item.name} ${item.description}`.toLocaleLowerCase().includes(search)),
  );
}

export function getAgentCapability(id: string) {
  return AGENT_CAPABILITIES.find((item) => item.id === id) ?? null;
}
