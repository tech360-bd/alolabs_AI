/**
 * Strict pricing gate for free-only provider adapters.
 *
 * A model is eligible only when the upstream model catalogue explicitly
 * reports zero input AND output price. Missing, malformed, quota-only, and
 * user-supplied estimates are not evidence of a $0 model and fail closed.
 */
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function explicitZero(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value === 0;
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === 0;
}

/** Returns true only for a machine-readable input/output price pair of zero. */
export function hasExplicitZeroPricing(model: unknown): boolean {
  const row = record(model);
  if (!row) return false;

  const pricing = record(row.pricing) ?? record(row.cost);
  if (pricing) {
    const input = pricing.prompt ?? pricing.input ?? pricing.input_cost_per_token ?? pricing.inputPrice;
    const output = pricing.completion ?? pricing.output ?? pricing.output_cost_per_token ?? pricing.outputPrice;
    if (explicitZero(input) && explicitZero(output)) return true;
  }

  // A single blended rate does not independently prove that both input and
  // output are free. Require the two direction-specific rates below instead.
  const inputRate = row.inputCostPerMillionTokens ?? row.input_cost_per_million_tokens;
  const outputRate = row.outputCostPerMillionTokens ?? row.output_cost_per_million_tokens;
  return explicitZero(inputRate) && explicitZero(outputRate);
}
