/**
 * Temporal connector — temporalio/temporal (MIT).
 *
 * License note: MIT (permissive). Temporal is durable execution for workflows
 * (versioned, replayable, exactly-once activities). AgentOS's job-queue is
 * the in-process path; Temporal is the upgrade path for long-running,
 * human-in-the-loop workflows. This adapter talks to a separately hosted
 * Temporal server via its HTTP API (gRPC gateway).
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (Temporal HTTP API / gRPC gateway):
 *  - GET  {base}/api/v1/namespaces/{ns}/workflows
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export const temporalAdapter: ExternalSystemAdapter = {
  id: 'automation.temporal',
  category: 'automation',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Temporal (MIT) — durable execution for long-running, replayable workflows',
  upstreamRepo: 'temporalio/temporal',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const ns = ctx.credential.extras?.['namespace'] ?? 'default';
      const res = await guardedFetch(
        'automation.temporal',
        joinUrl(ctx.credential.baseUrl, `api/v1/namespaces/${encodeURIComponent(ns)}/workflows`),
        { timeoutMs: 10_000 },
      );
      if (!res.ok) {
        throw new IntegrationError('automation.temporal', 'Temporal health probe failed', res.status);
      }
      return { reachable: true, status: res.status, namespace: ns };
    });
  },
};
