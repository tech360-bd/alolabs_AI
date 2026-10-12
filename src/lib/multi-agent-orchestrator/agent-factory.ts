/**
 * Agent Factory
 * Creates temporary agents from AgentFactorySpec.
 * Validates specs, enforces limits, handles expiration and archiving.
 */

import { db } from '@/lib/db';
import { getEventBus } from '@/lib/event-bus';
import type { AgentFactorySpec } from './types';

const MAX_TEMP_AGENTS_PER_COMPANY = 100;
const DEFAULT_EXPIRATION_MINUTES = 60;

// ─── Validation ──────────────────────────────────────────────────

function validateSpec(spec: AgentFactorySpec): string | null {
  if (!spec.name || spec.name.trim().length === 0) {
    return 'Agent name is required';
  }
  if (spec.name.length > 100) {
    return 'Agent name must be 100 characters or less';
  }
  if (!spec.departmentId) {
    return 'departmentId is required';
  }
  if (!spec.role) {
    return 'role is required';
  }
  if (!spec.systemPrompt || spec.systemPrompt.trim().length === 0) {
    return 'systemPrompt is required';
  }

  const validRoles = [
    'manager', 'planner', 'execution', 'qa', 'report',
    'automation', 'safety', 'memory', 'productivity', 'specialist',
  ];
  if (!validRoles.includes(spec.role)) {
    return `Invalid role: ${spec.role}. Must be one of: ${validRoles.join(', ')}`;
  }

  const validModelPolicies = ['fast', 'balanced', 'reasoning', 'coding', 'vision'];
  if (!validModelPolicies.includes(spec.modelPolicy)) {
    return `Invalid modelPolicy: ${spec.modelPolicy}. Must be one of: ${validModelPolicies.join(', ')}`;
  }

  const validMemoryProfiles = ['none', 'short', 'standard', 'long'];
  if (!validMemoryProfiles.includes(spec.memoryProfile)) {
    return `Invalid memoryProfile: ${spec.memoryProfile}. Must be one of: ${validMemoryProfiles.join(', ')}`;
  }

  if (spec.budgetLimit < 0) {
    return 'budgetLimit must be non-negative';
  }

  if (spec.expirationMinutes !== undefined && spec.expirationMinutes < 1) {
    return 'expirationMinutes must be at least 1';
  }

  return null;
}

// ─── Agent Factory ────────────────────────────────────────────────

export class AgentFactory {
  private eventBus = getEventBus();

  /**
   * Create a temporary agent from a spec.
   */
  async createAgent(spec: AgentFactorySpec): Promise<{
    id: string;
    agentId: string;
    name: string;
    type: string;
    expiresAt: Date;
  }> {
    // Validate spec
    const validationError = validateSpec(spec);
    if (validationError) {
      throw new Error(validationError);
    }

    // Check department exists
    const department = await db.department.findUnique({
      where: { id: spec.departmentId },
    });
    if (!department) {
      throw new Error(`Department ${spec.departmentId} not found`);
    }

    // Check temporary agent limit for company
    // We use the department as a proxy for the company context
    const tempAgentCount = await db.agent.count({
      where: {
        departmentId: spec.departmentId,
        type: 'temporary',
        status: 'active',
      },
    });

    if (tempAgentCount >= MAX_TEMP_AGENTS_PER_COMPANY) {
      throw new Error(
        `Maximum temporary agents (${MAX_TEMP_AGENTS_PER_COMPANY}) reached for this department. Archive some before creating new ones.`,
      );
    }

    // Generate agent ID
    const agentCount = await db.agent.count();
    const agentId = `AGENT-TEMP-${String(agentCount + 1).padStart(4, '0')}`;
    const slug = `temp-${agentId.toLowerCase()}-${Date.now().toString(36)}`;
    const expirationMinutes = spec.expirationMinutes ?? DEFAULT_EXPIRATION_MINUTES;
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Create the agent in DB
    const agent = await db.agent.create({
      data: {
        agentId,
        name: spec.name,
        slug,
        departmentId: spec.departmentId,
        departmentName: department.name,
        purpose: spec.systemPrompt.slice(0, 500),
        type: 'temporary',
        role: spec.role,
        allowedSkills: JSON.stringify(spec.skills),
        allowedTools: JSON.stringify(spec.tools),
        inputSchema: JSON.stringify({ type: 'text' }),
        outputSchema: spec.outputSchema
          ? JSON.stringify(spec.outputSchema)
          : '{}',
        productivityRules: JSON.stringify({
          modelPolicy: spec.modelPolicy,
          memoryProfile: spec.memoryProfile,
          allowedProviders: spec.allowedProviders,
          budgetLimit: spec.budgetLimit,
          evaluationPolicy: spec.evaluationPolicy ?? 'default',
          triggers: spec.triggers ?? [],
          expiresAt: expiresAt.toISOString(),
        }),
        status: 'active',
        version: 1,
      },
    });

    // Assign permissions
    if (spec.permissions.length > 0) {
      await Promise.all(
        spec.permissions.map((perm) =>
          db.agentPermission.create({
            data: {
              agentId: agent.id,
              resourceId: perm,
              accessLevel: 'execute',
            },
          }),
        ),
      );
    }

    // Emit event
    try {
      await this.eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'agent.created',
        source: 'agent-factory',
        companyId: 'default-company',
        data: {
          agentId,
          agentDbId: agent.id,
          name: spec.name,
          type: 'temporary',
          departmentId: spec.departmentId,
          role: spec.role,
          expiresAt: expiresAt.toISOString(),
          temporary: true,
        },
        priority: 'normal',
        timestamp: new Date(),
      });
    } catch {
      // Event bus failure is non-critical
    }

    return {
      id: agent.id,
      agentId,
      name: spec.name,
      type: 'temporary',
      expiresAt,
    };
  }

  /**
   * Clone an existing agent as a temporary agent.
   */
  async cloneAgent(
    sourceAgentId: string,
    overrides?: Partial<AgentFactorySpec>,
  ): Promise<{
    id: string;
    agentId: string;
    name: string;
    type: string;
    expiresAt: Date;
  }> {
    const sourceAgent = await db.agent.findUnique({
      where: { agentId: sourceAgentId },
    });

    if (!sourceAgent) {
      throw new Error(`Source agent ${sourceAgentId} not found`);
    }

    // Get source agent permissions
    const sourcePermissions = await db.agentPermission.findMany({
      where: { agentId: sourceAgent.id },
    });

    const spec: AgentFactorySpec = {
      name: overrides?.name ?? `${sourceAgent.name} (Clone)`,
      departmentId: overrides?.departmentId ?? sourceAgent.departmentId,
      role: overrides?.role ?? sourceAgent.role,
      systemPrompt: overrides?.systemPrompt ?? sourceAgent.purpose,
      skills: overrides?.skills ?? JSON.parse(sourceAgent.allowedSkills || '[]'),
      tools: overrides?.tools ?? JSON.parse(sourceAgent.allowedTools || '[]'),
      knowledge: overrides?.knowledge ?? [],
      memoryProfile: overrides?.memoryProfile ?? 'standard',
      modelPolicy: overrides?.modelPolicy ?? 'balanced',
      allowedProviders: overrides?.allowedProviders ?? [],
      permissions: overrides?.permissions ?? sourcePermissions.map((p) => p.resourceId),
      budgetLimit: overrides?.budgetLimit ?? 10,
      expirationMinutes: overrides?.expirationMinutes,
      outputSchema: overrides?.outputSchema ?? JSON.parse(sourceAgent.outputSchema || '{}'),
      evaluationPolicy: overrides?.evaluationPolicy,
      triggers: overrides?.triggers,
    };

    return this.createAgent(spec);
  }

  /**
   * Archive a temporary agent (soft delete).
   */
  async archiveAgent(agentDbId: string): Promise<void> {
    const agent = await db.agent.findUnique({
      where: { id: agentDbId },
    });

    if (!agent) {
      throw new Error(`Agent with id ${agentDbId} not found`);
    }

    if (agent.type !== 'temporary') {
      throw new Error('Only temporary agents can be archived via the factory');
    }

    await db.agent.update({
      where: { id: agentDbId },
      data: {
        status: 'archived',
        updatedAt: new Date(),
      },
    });

    // Emit event
    try {
      await this.eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'agent.archived',
        source: 'agent-factory',
        companyId: 'default-company',
        data: {
          agentId: agent.agentId,
          agentDbId,
          action: 'archived',
        },
        priority: 'normal',
        timestamp: new Date(),
      });
    } catch {
      // Event bus failure is non-critical
    }
  }

  /**
   * Get details of a temporary agent.
   */
  async getAgent(agentDbId: string) {
    const agent = await db.agent.findUnique({
      where: { id: agentDbId },
      include: {
        permissions: true,
        memory: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!agent) {
      throw new Error(`Agent with id ${agentDbId} not found`);
    }

    // Parse productivity rules for expiration info
    let expiresAt: string | null = null;
    try {
      const rules = JSON.parse(agent.productivityRules);
      expiresAt = rules.expiresAt ?? null;
    } catch {
      // no-op
    }

    return {
      id: agent.id,
      agentId: agent.agentId,
      name: agent.name,
      slug: agent.slug,
      type: agent.type,
      role: agent.role,
      departmentId: agent.departmentId,
      departmentName: agent.departmentName,
      purpose: agent.purpose,
      status: agent.status,
      allowedSkills: JSON.parse(agent.allowedSkills || '[]'),
      allowedTools: JSON.parse(agent.allowedTools || '[]'),
      outputSchema: JSON.parse(agent.outputSchema || '{}'),
      permissions: agent.permissions.map((p) => ({
        resourceId: p.resourceId,
        accessLevel: p.accessLevel,
      })),
      expiresAt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      isTemporary: agent.type === 'temporary',
    };
  }

  /**
   * Archive all expired temporary agents.
   * Should be called periodically.
   */
  async archiveExpiredAgents(): Promise<number> {
    const now = new Date();
    let archivedCount = 0;

    // Find all active temporary agents
    const tempAgents = await db.agent.findMany({
      where: {
        type: 'temporary',
        status: 'active',
      },
    });

    for (const agent of tempAgents) {
      let expiresAt: string | null = null;
      try {
        const rules = JSON.parse(agent.productivityRules);
        expiresAt = rules.expiresAt ?? null;
      } catch {
        continue;
      }

      if (expiresAt && new Date(expiresAt) < now) {
        try {
          await this.archiveAgent(agent.id);
          archivedCount++;
        } catch {
          // Continue archiving others
        }
      }
    }

    return archivedCount;
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let _instance: AgentFactory | null = null;
export function getAgentFactory(): AgentFactory {
  if (!_instance) _instance = new AgentFactory();
  return _instance;
}
