/**
 * Model Routing Policy Engine — Type Definitions
 * ALO Labs AIOS — Policy-based AI model routing.
 */

import type { AIProvider } from '@/lib/ai-router/types';

// ─── Complexity ────────────────────────────────────────────────

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'critical';

export type PrivacyLevel = 'public' | 'internal' | 'confidential' | 'private';

// ─── Provider Status ───────────────────────────────────────────

export interface ProviderStatus {
  provider: AIProvider;
  isHealthy: boolean;
  isRateLimited: boolean;
  currentLoad: number; // 0–1
  estimatedLatencyMs: number;
}

// ─── Policy Conditions ─────────────────────────────────────────

export interface PolicyCondition {
  type:
    | 'complexity'
    | 'privacy'
    | 'provider_unavailable'
    | 'provider_rate_limited'
    | 'budget_exceeded'
    | 'specific_provider'
    | 'specific_model'
    | 'time_of_day'
    | 'always';
  /** For complexity condition */
  complexityLevel?: ComplexityLevel;
  /** For privacy condition */
  privacyLevel?: PrivacyLevel;
  /** For provider condition */
  provider?: AIProvider;
  /** For model condition */
  model?: string;
  /** For time_of_day: hour range [start, end) in UTC */
  hourRange?: [number, number];
  /** For always */
  value?: boolean;
}

// ─── Policy Actions ────────────────────────────────────────────

export type PolicyActionType =
  | 'route_to_provider'
  | 'route_to_model'
  | 'reject'
  | 'fallback'
  | 'queue';

export interface PolicyAction {
  type: PolicyActionType;
  /** Target provider for route_to_provider / fallback */
  provider?: AIProvider;
  /** Target model family for route_to_model */
  model?: string;
  /** Fallback priority list for fallback action */
  fallbackProviders?: AIProvider[];
  /** Reason for rejection */
  reason?: string;
}

// ─── Routing Policy ────────────────────────────────────────────

export interface RoutingPolicy {
  id: string;
  name: string;
  description: string;
  priority: number; // lower = higher priority
  enabled: boolean;
  condition: PolicyCondition;
  action: PolicyAction;
}

// ─── Routing Context (input to evaluate) ───────────────────────

export interface RoutingContext {
  departmentCode?: string;
  complexityLevel: ComplexityLevel;
  privacyLevel: PrivacyLevel;
  requestedProvider?: AIProvider;
  requestedModel?: string;
  providerStatuses: ProviderStatus[];
  currentBudgetUsage: number;
  budgetLimit: number;
  allowedProviders: AIProvider[];
  allowedModels: string[];
  timestamp?: Date;
}

// ─── Routing Decision (output) ─────────────────────────────────

export type DecisionOutcome = 'routed' | 'rejected' | 'queued' | 'no_match';

export interface RoutingDecision {
  outcome: DecisionOutcome;
  provider: AIProvider | null;
  model: string | null;
  reason: string;
  policyId: string | null;
  policyName: string | null;
}
