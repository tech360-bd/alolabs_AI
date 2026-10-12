/**
 * Approval Engine
 * Routes agent actions based on risk level with configurable rules.
 */

import type { ApprovalRequest, ApprovalRule, ApprovalAction, ApprovalStatus, RiskLevel } from './types';
import { determineRequiredAction } from './types';
import { getEventBus, EventTypes } from '@/lib/event-bus';

class ApprovalEngine {
  private requests = new Map<string, ApprovalRequest>();
  private rules = new Map<string, ApprovalRule[]>(); // companyId -> rules
  private defaultExpiryMs = 86_400_000; // 24 hours

  // ─── Rule Management ───────────────────────────────────────

  setRules(companyId: string, rules: ApprovalRule[]): void {
    this.rules.set(companyId, rules);
  }

  getRules(companyId: string): ApprovalRule[] {
    return this.rules.get(companyId) ?? [];
  }

  addRule(companyId: string, rule: ApprovalRule): void {
    const existing = this.rules.get(companyId) ?? [];
    existing.push(rule);
    this.rules.set(companyId, existing);
  }

  removeRule(companyId: string, ruleId: string): boolean {
    const rules = this.rules.get(companyId);
    if (!rules) return false;
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx < 0) return false;
    rules.splice(idx, 1);
    return true;
  }

  // ─── Approval Flow ──────────────────────────────────────────

  /**
   * Submit an action for approval routing.
   * Returns the approval decision.
   */
  async submit(params: {
    agentId?: string;
    companyId: string;
    userId: string;
    taskId?: string;
    action: string;
    riskLevel: RiskLevel;
    description: string;
    metadata?: Record<string, unknown>;
    cost?: number;
  }): Promise<{ approved: boolean; request: ApprovalRequest; requiredAction: ApprovalAction }> {
    const companyRules = this.rules.get(params.companyId) ?? [];
    const requiredAction = determineRequiredAction(
      params.riskLevel,
      companyRules,
      params.action,
      params.cost,
    );

    const request: ApprovalRequest = {
      id: `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: params.taskId,
      agentId: params.agentId,
      companyId: params.companyId,
      userId: params.userId,
      action: params.action,
      riskLevel: params.riskLevel,
      requiredAction,
      status: requiredAction === 'auto_execute' ? 'auto_approved' : 'pending',
      description: params.description,
      metadata: params.metadata,
      expiresAt: new Date(Date.now() + this.defaultExpiryMs),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.requests.set(request.id, request);

    const approved = requiredAction === 'auto_execute';

    // Emit event
    try {
      const bus = getEventBus();
      await bus.publish({
        id: `evt_${Date.now()}`,
        type: approved ? EventTypes.APPROVAL_GRANTED : EventTypes.APPROVAL_REQUESTED,
        source: 'approval-engine',
        companyId: params.companyId,
        userId: params.userId,
        data: { requestId: request.id, action: params.action, riskLevel: params.riskLevel, requiredAction },
        priority: params.riskLevel === 'critical' ? 'critical' : params.riskLevel === 'high' ? 'high' : 'normal',
        timestamp: new Date(),
      });
    } catch { /* event bus may not be initialized */ }

    return { approved, request, requiredAction };
  }

  /** Approve a pending request */
  approve(requestId: string, reviewerId: string, note?: string): ApprovalRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== 'pending') return undefined;

    req.status = 'approved';
    req.reviewedBy = reviewerId;
    req.reviewedAt = new Date();
    req.reviewNote = note;
    req.updatedAt = new Date();

    return req;
  }

  /** Reject a pending request */
  reject(requestId: string, reviewerId: string, note?: string): ApprovalRequest | undefined {
    const req = this.requests.get(requestId);
    if (!req || req.status !== 'pending') return undefined;

    req.status = 'rejected';
    req.reviewedBy = reviewerId;
    req.reviewedAt = new Date();
    req.reviewNote = note;
    req.updatedAt = new Date();

    return req;
  }

  // ─── Query ──────────────────────────────────────────────────

  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  getPending(companyId?: string): ApprovalRequest[] {
    const now = Date.now();
    let results = Array.from(this.requests.values()).filter(
      r => r.status === 'pending' && (!r.expiresAt || r.expiresAt.getTime() > now),
    );
    if (companyId) results = results.filter(r => r.companyId === companyId);
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getHistory(companyId?: string, limit = 50): ApprovalRequest[] {
    let results = Array.from(this.requests.values()).filter(r => r.status !== 'pending');
    if (companyId) results = results.filter(r => r.companyId === companyId);
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
  }

  getStats(companyId?: string) {
    let all = Array.from(this.requests.values());
    if (companyId) all = all.filter(r => r.companyId === companyId);
    return {
      total: all.length,
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved' || r.status === 'auto_approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
      expired: all.filter(r => r.status === 'expired').length,
      byRiskLevel: {
        low: all.filter(r => r.riskLevel === 'low').length,
        medium: all.filter(r => r.riskLevel === 'medium').length,
        high: all.filter(r => r.riskLevel === 'high').length,
        critical: all.filter(r => r.riskLevel === 'critical').length,
      },
    };
  }
}

// Singleton
let _instance: ApprovalEngine | null = null;
export function getApprovalEngine(): ApprovalEngine {
  if (!_instance) _instance = new ApprovalEngine();
  return _instance;
}

export { DEFAULT_RISK_RULES, determineRequiredAction } from './types';
export type { ApprovalRequest, ApprovalRule, ApprovalAction, ApprovalStatus, RiskLevel } from './types';
