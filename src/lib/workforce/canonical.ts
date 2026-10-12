import { createHash } from 'node:crypto';

/**
 * Canonical JSON: object keys sorted recursively, no insignificant whitespace.
 * Two structurally equal specs always serialize to the same bytes, so their
 * SHA-256 is a stable identity for idempotent provisioning.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) out[key] = sortKeys(child);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function specHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
