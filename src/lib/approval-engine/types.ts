/**
 * Approval Engine Types
 * Risk-based routing: auto-execute, team review, manager approval, or block.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
export type ApprovalAction = 'auto_execute' | 'team_review' | 'manager_approve' | 'block';

export interface ApprovalRequest {
  id: string;
  taskId?: string;
  agentId?: string;
  companyId: string;
  userId: string;
  action: string;           // what the agent wants to do
  riskLevel: RiskLevel;
  requiredAction: ApprovalAction;
  status: ApprovalStatus;
  description: string;
  metadata?: Record<string, unknown>;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalRule {
  id: string;
  companyId: string;
  actionPattern: string;    // regex or exact match
  riskLevel: RiskLevel;
  requiredAction: ApprovalAction;
  maxAutoApproveCost?: number;
  requireMfa?: boolean;
  enabled: boolean;
}

export const DEFAULT_RISK_RULES: Record<RiskLevel, ApprovalAction> = {
  low: 'auto_execute',
  medium: 'team_review',
  high: 'manager_approve',
  critical: 'block',
};

export function determineRequiredAction(
  riskLevel: RiskLevel,
  customRules?: ApprovalRule[],
  action?: string,
  cost?: number,
): ApprovalAction {
  // Check custom rules first
  if (customRules) {
    for (const rule of customRules) {
      if (!rule.enabled) continue;
      if (rule.riskLevel !== riskLevel) continue;
      if (rule.actionPattern && action) {
        try {
          if (new RegExp(rule.actionPattern, 'i').test(action)) {
            // Check cost threshold for auto-approve
            if (rule.requiredAction === 'auto_execute' && rule.maxAutoApproveCost && cost && cost > rule.maxAutoApproveCost) {
              return 'team_review';
            }
            return rule.requiredAction;
          }
        } catch { /* invalid regex, skip */ }
      } else if (!rule.actionPattern) {
        return rule.requiredAction;
      }
    }
  }
  return DEFAULT_RISK_RULES[riskLevel];
}
