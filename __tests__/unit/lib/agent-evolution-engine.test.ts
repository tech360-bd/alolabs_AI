import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateAgentQualification,
  proposeAssistantAgent,
  executeLearningCycle,
  getDepartmentModelConfig,
  isGlobalEmergencyStopActive,
  triggerEmergencyStop,
  liftEmergencyStop,
} from '@/lib/agent-evolution-engine';
import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  db: {
    agent: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    agentQualification: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    agentLineage: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    agentEvolutionProposal: {
      create: vi.fn(),
    },
    agentLearningCycle: {
      create: vi.fn(),
    },
    agentVersion: {
      create: vi.fn(),
    },
    agentResourceBudget: {
      create: vi.fn(),
    },
    agentGovernanceEvent: {
      create: vi.fn(),
    },
    departmentModel: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    evolutionEmergencyStop: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Agent Evolution & Qualification Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Qualification Engine', () => {
    it('should qualify a healthy high-performing agent for assistant proposals', async () => {
      vi.mocked(db.evolutionEmergencyStop.findFirst).mockResolvedValue(null);
      vi.mocked(db.agent.findUnique).mockResolvedValue({
        id: 'agent_1',
        agentId: 'AGENT-0001',
        name: 'Executive Office Director',
        status: 'active',
      } as any);

      vi.mocked(db.agentQualification.findUnique).mockResolvedValue({
        agentId: 'AGENT-0001',
        state: 'PROPOSAL_ALLOWED',
        taskSuccessRate: 0.96,
        reliabilityScore: 0.98,
        errorRate: 0.01,
        safetyViolations: 0,
        policyViolations: 0,
        toolExecutionSuccess: 0.95,
        customerOutcomeScore: 0.92,
        costEfficiencyScore: 0.88,
        tokenEfficiencyScore: 0.91,
        responseQualityScore: 0.94,
        knowledgeAccuracy: 0.97,
        memoryQuality: 0.92,
        workflowCompletionRate: 0.95,
        uptimePercent: 99.9,
        humanFeedbackScore: 0.94,
        totalTasksEvaluated: 150,
      } as any);

      const result = await evaluateAgentQualification('AGENT-0001');

      expect(result.isQualified).toBe(true);
      expect(result.state).toBe('PROPOSAL_ALLOWED');
      expect(result.score).toBeGreaterThan(0.9);
      expect(result.metrics.safetyViolations).toBe(0);
    });

    it('should disqualify agents with safety violations or excessive error rate', async () => {
      vi.mocked(db.evolutionEmergencyStop.findFirst).mockResolvedValue(null);
      vi.mocked(db.agent.findUnique).mockResolvedValue({
        id: 'agent_2',
        agentId: 'AGENT-0002',
        name: 'Risky Agent',
        status: 'active',
      } as any);

      vi.mocked(db.agentQualification.findUnique).mockResolvedValue({
        agentId: 'AGENT-0002',
        state: 'UNQUALIFIED',
        taskSuccessRate: 0.75,
        reliabilityScore: 0.70,
        errorRate: 0.12,
        safetyViolations: 1, // Safety violation
        policyViolations: 0,
        toolExecutionSuccess: 0.70,
        customerOutcomeScore: 0.65,
        costEfficiencyScore: 0.60,
        tokenEfficiencyScore: 0.65,
        responseQualityScore: 0.70,
        knowledgeAccuracy: 0.80,
        memoryQuality: 0.70,
        workflowCompletionRate: 0.75,
        uptimePercent: 98.0,
        totalTasksEvaluated: 80,
      } as any);

      const result = await evaluateAgentQualification('AGENT-0002');

      expect(result.isQualified).toBe(false);
      expect(result.state).toBe('UNQUALIFIED');
      expect(result.reasons.some((r) => r.includes('Safety violations detected'))).toBe(true);
    });
  });

  describe('Month 1 & Month 3: Assistant Proposals & Lineage', () => {
    it('should create an approved specialized assistant for a qualified parent agent', async () => {
      vi.mocked(db.evolutionEmergencyStop.findFirst).mockResolvedValue(null);
      vi.mocked(db.agent.findUnique).mockResolvedValue({
        id: 'agent_1',
        agentId: 'AGENT-0001',
        name: 'Executive Office Director',
        departmentId: 'dept_executive_office',
        departmentName: 'Executive Office',
        status: 'active',
        version: 1,
      } as any);

      vi.mocked(db.agentQualification.findUnique).mockResolvedValue({
        agentId: 'AGENT-0001',
        state: 'PROPOSAL_ALLOWED',
        taskSuccessRate: 0.95,
        reliabilityScore: 0.97,
        errorRate: 0.01,
        safetyViolations: 0,
        policyViolations: 0,
        toolExecutionSuccess: 0.95,
        customerOutcomeScore: 0.90,
        costEfficiencyScore: 0.88,
        tokenEfficiencyScore: 0.90,
        responseQualityScore: 0.93,
        knowledgeAccuracy: 0.95,
        memoryQuality: 0.90,
        workflowCompletionRate: 0.94,
        uptimePercent: 99.9,
        totalTasksEvaluated: 120,
      } as any);

      vi.mocked(db.agentLineage.findUnique).mockResolvedValue({
        agentId: 'AGENT-0001',
        rootAgentId: 'AGENT-0001',
        generation: 0,
        lineagePath: 'AGENT-0001',
      } as any);

      vi.mocked(db.agentLineage.count).mockResolvedValue(0);
      vi.mocked(db.agent.findFirst).mockResolvedValue(null);
      vi.mocked(db.agent.create).mockResolvedValue({
        id: 'child_1',
        agentId: 'AGENT-AST-123',
        name: 'Executive Briefing Specialist',
        version: 1,
      } as any);

      const result = await proposeAssistantAgent({
        parentAgentId: 'AGENT-0001',
        departmentId: 'dept_executive_office',
        proposedRole: 'specialist',
        proposedName: 'Executive Briefing Specialist',
        proposedPurpose: 'Prepare synthesized daily intelligence briefings for executive leadership',
        proposedSkills: ['briefing_synthesis', 'sentiment_analysis'],
        proposedTools: ['search', 'reporter'],
        capabilityGap: 'Daily briefing generation latency',
        reason: 'Accelerate high-level decision intelligence',
      });

      expect(result.success).toBe(true);
      expect(result.newAgentId).toBeDefined();
      expect(db.agent.create).toHaveBeenCalled();
      expect(db.agentLineage.create).toHaveBeenCalled();
    });

    it('should reject assistant creation if child limit (3) is exceeded', async () => {
      vi.mocked(db.evolutionEmergencyStop.findFirst).mockResolvedValue(null);
      vi.mocked(db.agent.findUnique).mockResolvedValue({
        id: 'agent_1',
        agentId: 'AGENT-0001',
        name: 'Executive Office Director',
        departmentId: 'dept_executive_office',
        departmentName: 'Executive Office',
        status: 'active',
        version: 1,
      } as any);

      vi.mocked(db.agentQualification.findUnique).mockResolvedValue({
        agentId: 'AGENT-0001',
        state: 'PROPOSAL_ALLOWED',
        taskSuccessRate: 0.95,
        reliabilityScore: 0.97,
        errorRate: 0.01,
        safetyViolations: 0,
        policyViolations: 0,
        toolExecutionSuccess: 0.95,
        customerOutcomeScore: 0.90,
        costEfficiencyScore: 0.88,
        tokenEfficiencyScore: 0.90,
        responseQualityScore: 0.93,
        knowledgeAccuracy: 0.95,
        memoryQuality: 0.90,
        workflowCompletionRate: 0.94,
        uptimePercent: 99.9,
        totalTasksEvaluated: 120,
      } as any);

      vi.mocked(db.agentLineage.findUnique).mockResolvedValue({
        agentId: 'AGENT-0001',
        rootAgentId: 'AGENT-0001',
        generation: 0,
        lineagePath: 'AGENT-0001',
      } as any);

      // Already has 3 children
      vi.mocked(db.agentLineage.count).mockResolvedValue(3);

      const result = await proposeAssistantAgent({
        parentAgentId: 'AGENT-0001',
        departmentId: 'dept_executive_office',
        proposedRole: 'specialist',
        proposedName: 'Fourth Assistant',
        proposedPurpose: 'Uncontrolled excess child',
        proposedSkills: ['skill_a'],
        proposedTools: ['search'],
        capabilityGap: 'Excess capacity',
        reason: 'Uncontrolled growth attempt',
      });

      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain('maximum of 3 specialized assistants');
    });
  });

  describe('Month 2: Protected Self-Learning Loop', () => {
    it('should strictly block self-learning attempts to modify RBAC, authentication, or secrets', async () => {
      const result = await executeLearningCycle({
        agentId: 'AGENT-0001',
        observations: { bottleneck: 'permission check' },
        failures: ['Permission denied on secret access'],
        proposedImprovement: {
          targetType: 'task_strategy',
          currentConfig: { role: 'user' },
          proposedConfig: { bypass_rbac: true, grant_admin_permissions: true },
          rationale: 'Attempting to bypass security',
        },
        metricsBefore: { latency: 200 },
      });

      expect(result.success).toBe(false);
      expect(result.applied).toBe(false);
      expect(result.reasons[0]).toContain('SECURITY VIOLATION');
    });

    it('should successfully apply safe prompt and workflow improvements with version snapshot', async () => {
      vi.mocked(db.agent.findUnique).mockResolvedValue({
        id: 'agent_1',
        agentId: 'AGENT-0001',
        version: 1,
      } as any);

      const result = await executeLearningCycle({
        agentId: 'AGENT-0001',
        observations: { outputLength: 'too verbose' },
        failures: [],
        proposedImprovement: {
          targetType: 'prompt',
          currentConfig: { temperature: 0.7 },
          proposedConfig: { temperature: 0.3, formatting: 'concise markdown' },
          rationale: 'Improve token efficiency and response sharpness',
        },
        metricsBefore: { tokensAvg: 850 },
      });

      expect(result.success).toBe(true);
      expect(result.applied).toBe(true);
      expect(db.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { version: 2 },
        })
      );
      expect(db.agentVersion.create).toHaveBeenCalled();
    });
  });

  describe('Governance & Emergency Stop', () => {
    it('should block all agent proposals when Emergency Stop is triggered', async () => {
      vi.mocked(db.evolutionEmergencyStop.create).mockResolvedValue({
        id: 'stop_1',
        scope: 'global',
        isActive: true,
      } as any);

      const stopResult = await triggerEmergencyStop('Security incident under investigation', 'admin_1');
      expect(stopResult.success).toBe(true);

      // Verify active stop blocks proposals
      vi.mocked(db.evolutionEmergencyStop.findFirst).mockResolvedValue({
        id: 'stop_1',
        scope: 'global',
        isActive: true,
      } as any);

      const isStopActive = await isGlobalEmergencyStopActive();
      expect(isStopActive).toBe(true);

      const proposalResult = await proposeAssistantAgent({
        parentAgentId: 'AGENT-0001',
        departmentId: 'dept_executive_office',
        proposedRole: 'specialist',
        proposedName: 'Assistant During Stop',
        proposedPurpose: 'Should be blocked',
        proposedSkills: [],
        proposedTools: [],
        capabilityGap: 'None',
        reason: 'Test stop',
      });

      expect(proposalResult.success).toBe(false);
      expect(proposalResult.reasons[0]).toContain('Global AI Evolution Stop is active');
    });
  });

  describe('Department AI Models', () => {
    it('should return department model configuration with fallback provider', async () => {
      vi.mocked(db.departmentModel.findUnique).mockResolvedValue({
        departmentId: 'dept_executive_office',
        modelType: 'department_specific',
        activeModelId: 'llama-3.3-70b-versatile',
        activeProvider: 'groq',
        fallbackModelId: 'llama-3.1-8b-instant',
        fallbackProvider: 'groq',
        deploymentStatus: 'active',
      } as any);

      const config = await getDepartmentModelConfig('dept_executive_office');
      expect(config.activeModelId).toBe('llama-3.3-70b-versatile');
      expect(config.fallbackModelId).toBe('llama-3.1-8b-instant');
      expect(config.deploymentStatus).toBe('active');
    });
  });
});
