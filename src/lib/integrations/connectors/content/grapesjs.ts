/**
 * GrapesJS connector — GrapesJS/grapesjs (BSD-3-Clause).
 *
 * License note: BSD-3-Clause (permissive). GrapesJS is a free/open-source
 * web-builder framework (templates without coding). It is a client-side
 * library, not a backend service. This adapter verifies the asset host is
 * reachable and exposes template-export helpers for AgentOS's site builder.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export interface GrapesTemplate {
  name: string;
  html: string;
  css?: string;
}

/** Sanitize a GrapesJS template export (strip scripts for safe preview). */
export function grapesSanitizeTemplate(t: GrapesTemplate): GrapesTemplate {
  const html = t.html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return { ...t, html };
}

export const grapesjsAdapter: ExternalSystemAdapter = {
  id: 'content.grapesjs',
  category: 'content',
  licenseClass: 'permissive',
  strategy: 'REUSE',
  description: 'GrapesJS (BSD-3) — web-builder framework for templates without coding',
  upstreamRepo: 'GrapesJS/grapesjs',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await guardedFetch('content.grapesjs', joinUrl(ctx.credential.baseUrl, 'grapes.min.js'), {
        timeoutMs: 10_000,
      });
      return { reachable: res.ok, status: res.status, mode: 'static-asset' };
    });
  },
};
