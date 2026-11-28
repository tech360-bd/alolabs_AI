import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SuperAdminEcosystemHub from '@/components/enterprise/panels/super-admin-ecosystem-hub';
import McpManagerPanel from '@/components/panels/mcp-manager-panel';

describe('SuperAdminEcosystemHub & McpManagerPanel UI Contracts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/super-admin/ai/command-router')) {
        return new Response(
          JSON.stringify({
            success: true,
            config: {
              strategy: 'free-first',
              privacyMode: 'guarded',
              preferFreeFirst: true,
              preferLocalFirst: true,
              maxConcurrencyPerTenant: 20,
            },
            plan: {
              strategy: 'free-first',
              privacyMode: 'guarded',
              selected: null,
              candidates: [],
            },
            decisions: [],
            protocols: [
              { id: 'anthropic-messages', endpoint: '/api/v1/gateway/anthropic/v1/messages', status: 'active' },
              { id: 'openai-chat', endpoint: '/api/v1/gateway/openai/v1/chat/completions', status: 'active' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/super-admin/ecosystem/vault')) {
        return new Response(
          JSON.stringify({
            success: true,
            summary: {
              totalSuppliedSources: 30,
              totalVettedAssets: 26,
              topicJarvisTotal: 238,
              searchAiCallTotal: 34573,
            },
            dbCounts: {
              sources: 30,
              assets: 26,
              integrations: 18,
              licenses: 26,
              securityReviews: 26,
              versions: 18,
            },
            sources: [],
            licenses: [],
            integrations: [],
            hardware: {
              memory: { totalGb: 16 },
              capabilities: { canRun7bModels: true },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/super-admin/coding-agents')) {
        return new Response(
          JSON.stringify({
            success: true,
            harnesses: [
              {
                id: 'h-1',
                slug: 'opencode',
                name: 'OpenCode (anomalyco)',
                harnessType: 'coding',
                upstreamRepo: 'anomalyco/opencode',
                licenseSpdx: 'MIT',
                sandboxMode: 'isolated_worktree',
                requiresApproval: true,
                cliProbe: { installed: false, detail: 'API mode' },
              },
            ],
            sessions: [],
            tools: [],
            qaViewports: [
              { id: 'desktop', label: 'Desktop (1440x900)', width: 1440, height: 900 },
              { id: 'tablet', label: 'Tablet (768x1024)', width: 768, height: 1024 },
              { id: 'mobile', label: 'Mobile (390x844)', width: 390, height: 844 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/mcp-servers')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'mcp-1',
                name: 'Browse MCP',
                host: 'browse.example.com',
                port: 443,
                protocol: 'https',
                status: 'connected',
                tools: JSON.stringify([{ name: 'browser.inspect_page' }]),
                config: JSON.stringify({ authType: 'bearer', autoStart: true }),
                latencyMs: 44,
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders Ecosystem Control Plane honest telemetry without runtime errors', async () => {
    render(<SuperAdminEcosystemHub />);

    await waitFor(() => {
      expect(screen.getByText(/Ecosystem Control Plane/i)).toBeInTheDocument();
    });
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('30 persisted in DB')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/gateway/anthropic/v1/messages')).toBeInTheDocument();
    expect(screen.getByText('7B local eligible')).toBeInTheDocument();
  });

  it('renders McpManagerPanel reading paginated data.data rows and Test Connection affordance', async () => {
    render(<McpManagerPanel />);

    await waitFor(() => {
      expect(screen.getByText('Browse MCP')).toBeInTheDocument();
    });
    expect(screen.getByText('https://browse.example.com:443')).toBeInTheDocument();
    expect(screen.getByText('browser.inspect_page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Connection/i })).toBeInTheDocument();
  });
});
