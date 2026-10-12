/**
 * Model Routing Policy Engine — Public API
 * ALO Labs AIOS — Singleton access to the policy engine.
 */

export type {
  ComplexityLevel,
  PrivacyLevel,
  ProviderStatus,
  PolicyCondition,
  PolicyAction,
  PolicyActionType,
  RoutingPolicy,
  RoutingContext,
  RoutingDecision,
  DecisionOutcome,
} from './types';

import { ModelRoutingPolicyEngine } from './policy-engine';
export { ModelRoutingPolicyEngine };

let _engine: ModelRoutingPolicyEngine | null = null;

export function getModelRoutingPolicyEngine(): ModelRoutingPolicyEngine {
  if (!_engine) _engine = new ModelRoutingPolicyEngine();
  return _engine;
}
