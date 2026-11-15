/**
 * FREE-ONLY MODE — zero paid AI inference spend enforcement.
 *
 * ALO Labs AgentOS — global cost ceiling for external AI inference.
 *
 * When FREE-ONLY MODE is enabled (env `FREE_ONLY_MODE=true`), the platform
 * guarantees $0 external AI inference spend:
 *
 *   - Local inference (Ollama / vLLM / llama.cpp / trusted loopback) is preferred.
 *   - Only verified zero-price provider endpoints are eligible for external calls.
 *   - Paid model endpoints are blocked at routing time (never selected).
 *   - Paid fallback is prohibited — a failed free route defers, never bills.
 *   - No automatic credit purchase, subscription, or paid overage is possible:
 *     `autoBillingEnabled` is ignored and `maxPaidBudgetUsd` is treated as 0.
 *   - No paid provider can be activated without explicit Super Admin approval
 *     (which itself is refused while FREE-ONLY MODE is on).
 *
 * This is a *global* ceiling. Per-company paid gating already exists in
 * `src/lib/multi-tenant-ai/service.ts` (CompanyBudget.paidApiAllowed,
 * ModelRoutingPolicy.allowPaid, profile `approved_paid`). FREE-ONLY MODE sits
 * above all of it: even a company that has paidApiAllowed=true cannot spend
 * while the global switch is on.
 *
 * Cost distinction: FREE-ONLY MODE covers *external AI inference* spend only.
 * Infrastructure, electricity, hosting and maintenance costs are out of scope
 * and are never reported as $0.
 *
 * The mode is read from the environment at call time (not cached at import),
 * so operators can flip it without a code change. Default is OFF (fail-open
 * to existing per-company policy) — enabling it is a deliberate operator act.
 */

export interface FreeOnlyEnv {
  FREE_ONLY_MODE?: string;
  /** Legacy alias accepted for operators who already set LOCAL_ONLY. */
  LOCAL_ONLY?: string;
  [key: string]: string | undefined;
}

function envFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/**
 * True when the global FREE-ONLY MODE switch is on.
 *
 * `FREE_ONLY_MODE` is the explicit switch. `LOCAL_ONLY=true` (existing env)
 * also implies FREE-ONLY MODE, because local-only routing already refuses
 * every non-local provider — but FREE-ONLY MODE is broader: it additionally
 * blocks paid *local-adjacent* routes and forces the $0 ceiling even when
 * verified-free external providers are configured.
 */
export function isFreeOnlyMode(env: FreeOnlyEnv = process.env): boolean {
  const explicit = envFlag(env.FREE_ONLY_MODE);
  if (explicit !== undefined) return explicit;
  return envFlag(env.LOCAL_ONLY) === true;
}

/** Human-readable description of the current mode for admin UIs and logs. */
export function freeOnlyModeDescription(env: FreeOnlyEnv = process.env): string {
  return isFreeOnlyMode(env)
    ? 'FREE-ONLY MODE is ON: external AI inference spend is capped at $0. Only local inference and verified zero-price providers are eligible; paid routes are blocked.'
    : 'FREE-ONLY MODE is OFF: per-company paid policy applies (CompanyBudget.paidApiAllowed, ModelRoutingPolicy.allowPaid, approved_paid profile).';
}

/**
 * Whether a candidate route kind is allowed under FREE-ONLY MODE.
 * `local` and `verified_free` are always allowed; `paid` is never allowed.
 */
export function freeOnlyAllowsRouteKind(routeKind: 'local' | 'verified_free' | 'paid' | undefined): boolean {
  return routeKind !== 'paid';
}

/**
 * Effective paid budget ceiling under FREE-ONLY MODE.
 * Returns 0 when the mode is on, otherwise the caller's configured ceiling.
 */
export function effectivePaidBudgetUsd(configuredCeiling: number, env: FreeOnlyEnv = process.env): number {
  return isFreeOnlyMode(env) ? 0 : Math.max(0, configuredCeiling);
}

/**
 * Whether paid API use is allowed at all under the current mode.
 * FREE-ONLY MODE always returns false, regardless of per-company flags.
 */
export function paidApiAllowedInMode(perCompanyAllowed: boolean, env: FreeOnlyEnv = process.env): boolean {
  if (isFreeOnlyMode(env)) return false;
  return perCompanyAllowed;
}

/**
 * Whether automatic billing (credit purchase / subscription / overage) is
 * allowed. FREE-ONLY MODE always forbids it — there is no code path that
 * purchases credits, so this is a belt-and-braces assertion for audits.
 */
export function autoBillingAllowedInMode(env: FreeOnlyEnv = process.env): boolean {
  return !isFreeOnlyMode(env);
}

/**
 * Provider kinds whose upstream catalogue is metered (paid) rather than $0.
 *
 * Deliberately excluded:
 *  - `openrouter-free`, `unorouter-free`, `openai-compatible-free` — adapters
 *    enforce an upstream $0 pricing gate by construction.
 *  - `ollama`, `llama-cpp`, `custom-self-hosted` — local inference, $0 API charge.
 *  - quota-based free tiers (`gemini`, `cerebras`, `cloudflare-workers-ai`,
 *    `huggingface`, `github-models`) — metered by *quota*, not by *price*; the
 *    human verification flow decides whether a given model is free.
 * `openai-compatible` is not listed because a self-hosted/compatible endpoint is
 * commonly $0; the policy engine still refuses to treat it as free without a
 * verification row.
 */
export const FREE_ONLY_PAID_PROVIDER_KINDS: ReadonlySet<string> = new Set([
  'openai',
  'openrouter',
  'groq',
  'deepseek',
  'mistral',
  'qwen',
  'cohere',
  'sambanova',
  'nvidia',
  'zai-sdk',
]);

/**
 * Fail-closed assertion for provider registration: throws when a paid provider
 * kind is submitted while FREE-ONLY MODE is on.
 */
export function assertPaidProviderAllowed(
  providerKind: string,
  env: FreeOnlyEnv = process.env,
): void {
  if (!isFreeOnlyMode(env)) return;
  if (!FREE_ONLY_PAID_PROVIDER_KINDS.has(providerKind)) return;
  throw new Error(
    `FREE-ONLY MODE is enabled: paid provider kind "${providerKind}" cannot be registered. ` +
      'Only local inference and verified zero-price providers are eligible. ' +
      'Disable FREE_ONLY_MODE (Super Admin action) to register a paid provider.',
  );
}
