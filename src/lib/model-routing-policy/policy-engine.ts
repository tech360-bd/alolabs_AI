/**
 * Model Routing Policy Engine
 * ALO Labs AIOS — Evaluates routing policies in priority order to determine
 * the best provider and model for a given AI request context.
 */

import type {
  RoutingPolicy,
  RoutingContext,
  RoutingDecision,
  PolicyCondition,
  ProviderStatus,
} from './types';
import type { AIProvider } from '@/lib/ai-router/types';

// ─── Default Policies ──────────────────────────────────────────

const DEFAULT_POLICIES: RoutingPolicy[] = [
  // 1. Low complexity → groq fast model
  {
    id: 'policy-low-complexity',
    name: 'Low Complexity Routing',
    description: 'Routes low-complexity requests to Groq fast model for speed and cost efficiency.',
    priority: 10,
    enabled: true,
    condition: {
      type: 'complexity',
      complexityLevel: 'low',
    },
    action: {
      type: 'route_to_provider',
      provider: 'groq',
      model: 'fast',
    },
  },

  // 2. Medium complexity → groq balanced
  {
    id: 'policy-medium-complexity',
    name: 'Medium Complexity Routing',
    description: 'Routes medium-complexity requests to Groq balanced model for quality-speed tradeoff.',
    priority: 20,
    enabled: true,
    condition: {
      type: 'complexity',
      complexityLevel: 'medium',
    },
    action: {
      type: 'route_to_provider',
      provider: 'groq',
      model: 'balanced',
    },
  },

  // 3. High complexity → openrouter reasoning
  {
    id: 'policy-high-complexity',
    name: 'High Complexity Routing',
    description: 'Routes high-complexity requests to OpenRouter reasoning model for maximum quality.',
    priority: 30,
    enabled: true,
    condition: {
      type: 'complexity',
      complexityLevel: 'high',
    },
    action: {
      type: 'route_to_provider',
      provider: 'openrouter',
      model: 'reasoning',
    },
  },

  // 4. Privacy: private → ollama (on-premise)
  {
    id: 'policy-privacy-private',
    name: 'Private Data Routing',
    description: 'Routes requests with private data to Ollama for on-premise processing.',
    priority: 5,
    enabled: true,
    condition: {
      type: 'privacy',
      privacyLevel: 'private',
    },
    action: {
      type: 'route_to_provider',
      provider: 'ollama',
    },
  },

  // 5. Groq unavailable → openrouter fallback
  {
    id: 'policy-groq-fallback',
    name: 'Groq Fallback',
    description: 'Falls back to OpenRouter when Groq is unavailable.',
    priority: 100,
    enabled: true,
    condition: {
      type: 'provider_unavailable',
      provider: 'groq',
    },
    action: {
      type: 'fallback',
      fallbackProviders: ['openrouter', 'ollama', 'zai-sdk'],
    },
  },

  // 6. Provider rate limited → next available
  {
    id: 'policy-rate-limit-fallback',
    name: 'Rate Limit Fallback',
    description: 'Falls back to next available provider when the selected provider is rate-limited.',
    priority: 90,
    enabled: true,
    condition: {
      type: 'provider_rate_limited',
    },
    action: {
      type: 'fallback',
      fallbackProviders: ['groq', 'openrouter', 'zai-sdk', 'ollama'],
    },
  },

  // 7. Budget exceeded → reject
  {
    id: 'policy-budget-exceeded',
    name: 'Budget Limit',
    description: 'Rejects requests when the department budget has been exceeded.',
    priority: 1,
    enabled: true,
    condition: {
      type: 'budget_exceeded',
    },
    action: {
      type: 'reject',
      reason: 'Department monthly budget limit exceeded. Request cannot be processed.',
    },
  },
];

// ─── Condition Evaluation ──────────────────────────────────────

function matchesCondition(ctx: RoutingContext, condition: PolicyCondition): boolean {
  switch (condition.type) {
    case 'always':
      return condition.value ?? true;

    case 'complexity':
      return ctx.complexityLevel === condition.complexityLevel;

    case 'privacy':
      return ctx.privacyLevel === condition.privacyLevel;

    case 'provider_unavailable': {
      if (!condition.provider) return false;
      const status = ctx.providerStatuses.find(
        (s) => s.provider === condition.provider,
      );
      return status ? !status.isHealthy : true; // treat unknown as unavailable
    }

    case 'provider_rate_limited': {
      // Triggers if the requested or any primary provider is rate-limited
      const target = ctx.requestedProvider;
      if (target) {
        const status = ctx.providerStatuses.find((s) => s.provider === target);
        if (status?.isRateLimited) return true;
      }
      // Also check groq specifically as it's our primary
      const groqStatus = ctx.providerStatuses.find((s) => s.provider === 'groq');
      return groqStatus?.isRateLimited ?? false;
    }

    case 'budget_exceeded':
      return ctx.currentBudgetUsage >= ctx.budgetLimit;

    case 'specific_provider':
      return ctx.requestedProvider === condition.provider;

    case 'specific_model':
      return ctx.requestedModel === condition.model;

    case 'time_of_day': {
      if (!condition.hourRange) return false;
      const now = ctx.timestamp ?? new Date();
      const hour = now.getUTCHours();
      const [start, end] = condition.hourRange;
      if (start <= end) {
        return hour >= start && hour < end;
      }
      // Wraps around midnight
      return hour >= start || hour < end;
    }

    default:
      return false;
  }
}

// ─── Resolve Fallback ──────────────────────────────────────────

function resolveFallback(
  ctx: RoutingContext,
  fallbackProviders: AIProvider[],
): { provider: AIProvider; model: string | null } | null {
  for (const provider of fallbackProviders) {
    // Check if allowed by department config
    if (!ctx.allowedProviders.includes(provider)) continue;

    // Check provider health
    const status = ctx.providerStatuses.find((s) => s.provider === provider);
    if (status && (!status.isHealthy || status.isRateLimited)) continue;

    // Pick the best model from allowed models
    const model = pickBestModel(ctx.allowedModels, provider);
    return { provider, model };
  }
  return null;
}

// ─── Pick Best Model ───────────────────────────────────────────

function pickBestModel(
  allowedModels: string[],
  _provider: AIProvider,
): string | null {
  // Priority order for model selection
  const modelPriority = ['fast', 'balanced', 'reasoning', 'coding', 'vision'];
  for (const m of modelPriority) {
    if (allowedModels.includes(m)) return m;
  }
  return allowedModels[0] ?? null;
}

// ─── Get Provider Status ───────────────────────────────────────

function getProviderStatus(
  ctx: RoutingContext,
  provider: AIProvider,
): ProviderStatus | undefined {
  return ctx.providerStatuses.find((s) => s.provider === provider);
}

// ─── Policy Engine Class ───────────────────────────────────────

export class ModelRoutingPolicyEngine {
  private policies: RoutingPolicy[];

  constructor(initialPolicies?: RoutingPolicy[]) {
    this.policies = initialPolicies ?? [...DEFAULT_POLICIES];
  }

  /**
   * Evaluate all enabled policies against the context in priority order.
   * Returns the first matching policy's decision, or a no_match decision.
   */
  evaluate(ctx: RoutingContext): RoutingDecision {
    // Sort by priority (lower number = higher priority)
    const sorted = this.policies
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const policy of sorted) {
      if (!matchesCondition(ctx, policy.condition)) continue;

      return this.applyAction(ctx, policy);
    }

    // No policy matched — use default routing to first allowed healthy provider
    return this.defaultRoute(ctx);
  }

  private applyAction(ctx: RoutingContext, policy: RoutingPolicy): RoutingDecision {
    const action = policy.action;

    switch (action.type) {
      case 'route_to_provider': {
        const provider = action.provider;
        if (!provider) {
          return this.makeReject('Policy specifies route_to_provider but no provider given.', policy);
        }

        // Verify provider is allowed
        if (!ctx.allowedProviders.includes(provider)) {
          return this.makeReject(
            `Provider "${provider}" is not allowed for this department.`,
            policy,
          );
        }

        // Check provider health
        const status = getProviderStatus(ctx, provider);
        if (status && !status.isHealthy) {
          // Provider unhealthy — attempt fallback
          const fallback = resolveFallback(ctx, [
            'groq',
            'openrouter',
            'zai-sdk',
            'ollama',
          ]);
          if (fallback) {
            return {
              outcome: 'routed',
              provider: fallback.provider,
              model: action.model ?? fallback.model,
              reason: `Primary provider "${provider}" unhealthy, fell back to "${fallback.provider}".`,
              policyId: policy.id,
              policyName: policy.name,
            };
          }
          return this.makeReject(
            `Provider "${provider}" is unhealthy and no fallback available.`,
            policy,
          );
        }

        return {
          outcome: 'routed',
          provider,
          model: action.model ?? pickBestModel(ctx.allowedModels, provider),
          reason: `Matched policy: ${policy.name}`,
          policyId: policy.id,
          policyName: policy.name,
        };
      }

      case 'route_to_model': {
        const model = action.model;
        // Route to first allowed healthy provider that supports the model
        for (const provider of ctx.allowedProviders) {
          const status = getProviderStatus(ctx, provider);
          if (status && !status.isHealthy) continue;
          if (status?.isRateLimited) continue;
          return {
            outcome: 'routed',
            provider,
            model: model ?? pickBestModel(ctx.allowedModels, provider),
            reason: `Matched policy: ${policy.name}`,
            policyId: policy.id,
            policyName: policy.name,
          };
        }
        return this.makeReject('No healthy provider available for model routing.', policy);
      }

      case 'reject': {
        return this.makeReject(action.reason ?? 'Request rejected by policy.', policy);
      }

      case 'fallback': {
        const providers = action.fallbackProviders ?? ctx.allowedProviders;
        const result = resolveFallback(ctx, providers);
        if (!result) {
          return this.makeReject('All fallback providers unavailable.', policy);
        }
        return {
          outcome: 'routed',
          provider: result.provider,
          model: result.model,
          reason: `Matched policy: ${policy.name} — routed to fallback provider.`,
          policyId: policy.id,
          policyName: policy.name,
        };
      }

      case 'queue': {
        return {
          outcome: 'queued',
          provider: null,
          model: null,
          reason: `Request queued by policy: ${policy.name}`,
          policyId: policy.id,
          policyName: policy.name,
        };
      }

      default:
        return this.makeReject('Unknown policy action type.', policy);
    }
  }

  private defaultRoute(ctx: RoutingContext): RoutingDecision {
    // Try providers in preference order
    const preference: AIProvider[] = ['groq', 'zai-sdk', 'openrouter', 'ollama'];

    for (const provider of preference) {
      if (!ctx.allowedProviders.includes(provider)) continue;
      const status = getProviderStatus(ctx, provider);
      if (status && (!status.isHealthy || status.isRateLimited)) continue;

      return {
        outcome: 'routed',
        provider,
        model: pickBestModel(ctx.allowedModels, provider),
        reason: 'Default routing — no specific policy matched.',
        policyId: null,
        policyName: null,
      };
    }

    return {
      outcome: 'rejected',
      provider: null,
      model: null,
      reason: 'No healthy provider available for default routing.',
      policyId: null,
      policyName: null,
    };
  }

  private makeReject(reason: string, policy: RoutingPolicy): RoutingDecision {
    return {
      outcome: 'rejected',
      provider: null,
      model: null,
      reason,
      policyId: policy.id,
      policyName: policy.name,
    };
  }

  // ─── Policy Management ───────────────────────────────────────

  getPolicies(): RoutingPolicy[] {
    return [...this.policies];
  }

  getEnabledPolicies(): RoutingPolicy[] {
    return this.policies.filter((p) => p.enabled);
  }

  addPolicy(policy: RoutingPolicy): void {
    this.policies.push(policy);
  }

  removePolicy(id: string): boolean {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.policies.splice(idx, 1);
    return true;
  }

  enablePolicy(id: string): boolean {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) return false;
    policy.enabled = true;
    return true;
  }

  disablePolicy(id: string): boolean {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) return false;
    policy.enabled = false;
    return true;
  }
}
