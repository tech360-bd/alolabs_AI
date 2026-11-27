/**
 * Server-only helpers for the stack register.
 *
 * `stack.ts` is client-safe by design (no Node APIs, no Prisma), which means it
 * cannot import `@/lib/integrations` — that module pulls `@/lib/db`. The adapter
 * list is therefore read here, on the server, and injected.
 */

import { bootstrapIntegrations, integrationRegistry } from '@/lib/integrations';
import { buildStack, type StackAdapter, type StackReport } from './stack';

/**
 * The 26 registered adapters, as plain data.
 *
 * `bootstrapIntegrations()` is idempotent, so calling it from a page render is
 * safe; it only populates the in-process registry.
 */
export function stackAdapters(): StackAdapter[] {
  bootstrapIntegrations();
  return integrationRegistry
    .list()
    .map((adapter) => ({
      id: adapter.id,
      category: adapter.category,
      strategy: adapter.strategy,
      licenseClass: adapter.licenseClass,
      description: adapter.description,
      upstreamRepo: adapter.upstreamRepo,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Full register with adapters joined in. */
export function serverStackReport(): StackReport {
  return buildStack({ adapters: stackAdapters() });
}
