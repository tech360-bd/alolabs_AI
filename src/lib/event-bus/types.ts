/**
 * Event Bus Type Definitions
 * In-process event sourcing with persistence.
 */

export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  source: string;       // agent ID, service name, or 'system'
  companyId: string;
  userId?: string;
  data: T;
  priority: EventPriority;
  timestamp: Date;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
}

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => void | Promise<void>;

export interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  filter?: (event: DomainEvent) => boolean;
}

// ─── Standard Event Types ──────────────────────────────────────────

export const EventTypes = {
  // Agent lifecycle
  AGENT_CREATED: 'agent.created',
  AGENT_INITIALIZED: 'agent.initialized',
  AGENT_EXECUTION_STARTED: 'agent.execution.started',
  AGENT_EXECUTION_COMPLETED: 'agent.execution.completed',
  AGENT_EXECUTION_FAILED: 'agent.execution.failed',
  AGENT_HEALTH_DEGRADED: 'agent.health.degraded',
  AGENT_HEALTH_RECOVERED: 'agent.health.recovered',

  // Task
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_DELEGATED: 'task.delegated',
  TASK_APPROVAL_REQUESTED: 'task.approval.requested',
  TASK_APPROVED: 'task.approved',
  TASK_REJECTED: 'task.rejected',

  // Multi-agent
  AGENT_DELEGATION_REQUEST: 'multiagent.delegation.request',
  AGENT_DELEGATION_RESULT: 'multiagent.delegation.result',
  AGENT_CONSENSUS_REACHED: 'multiagent.consensus.reached',
  AGENT_ESCALATION: 'multiagent.escalation',

  // Memory
  MEMORY_CREATED: 'memory.created',
  MEMORY_RETRIEVED: 'memory.retrieved',
  MEMORY_EXPIRED: 'memory.expired',

  // Approval
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_DENIED: 'approval.denied',

  // System
  SYSTEM_HEALTH_CHECK: 'system.health.check',
  SYSTEM_ERROR: 'system.error',
  SYSTEM_RECOVERY: 'system.recovery',

  // CRM
  CRM_CONTACT_CREATED: 'crm.contact.created',
  CRM_DEAL_UPDATED: 'crm.deal.updated',

  // Billing
  BILLING_INVOICE_CREATED: 'billing.invoice.created',
  BILLING_PAYMENT_RECEIVED: 'billing.payment.received',

  // Social
  SOCIAL_POST_PUBLISHED: 'social.post.published',
  SOCIAL_ENGAGEMENT: 'social.engagement',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
