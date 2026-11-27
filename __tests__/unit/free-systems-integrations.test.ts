import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TOOL_LOOP_POLICY,
  activepiecesListFlows,
  aiderFormatHunks,
  aiderParseHunks,
  callGptValidateCall,
  callIntelValidate,
  directusListItems,
  dokkuValidateSpec,
  freeClaudeCodeListModels,
  grapesSanitizeTemplate,
  integrationRegistry,
  jarvisAllowsCloud,
  jarvisRequiresApproval,
  librechatListModels,
  litellmChat,
  litellmListModels,
  nocobaseListCollections,
  omnirouteListModels,
  openWebuiListModels,
  sweValidateTrajectory,
  toolLoopShouldContinue,
} from '@/lib/integrations';
import type { ConnectorContext } from '@/lib/integrations';

const ctx = (overrides: Partial<ConnectorContext> = {}): ConnectorContext => ({
  companyId: 'company_test',
  credential: { baseUrl: 'https://selfhosted.example.com', apiKey: 'test-key' },
  ...overrides,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Wave-2 free/open system catalog', () => {
  const ids = integrationRegistry.catalog().map((a) => a.id);

  it('registers every requested system', () => {
    expect(ids).toEqual(
      expect.arrayContaining([
        // AI gateways / routers
        'gateway.litellm',
        'gateway.omniroute',
        'gateway.free-claude-code',
        // Chat UIs
        'ai-chat.librechat',
        'ai-chat.open-webui',
        // Coding agents
        'coding-agent.aider',
        'coding-agent.swe-agent',
        'coding-agent.tool-loop',
        // Content / data
        'content.directus',
        'content.grapesjs',
        // Automation / workflow
        'automation.activepieces',
        'automation.nocobase',
        'automation.temporal',
        'automation.jarvis',
        // Deploy
        'deploy.caprover',
        'deploy.dokku',
        // Telephony / call center
        'telephony.call-gpt',
        'telephony.ai-native-callcenter',
        'telephony.call-intelligence',
        // Media
        'media.infinite-talk',
      ]),
    );
  });

  it('never registers an AVOID strategy and keeps ids unique', () => {
    const all = integrationRegistry.list();
    expect(all.some((a) => a.strategy === 'AVOID')).toBe(false);
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });

  it('enforces the license policy per adapter', () => {
    const byId = new Map(integrationRegistry.list().map((a) => [a.id, a]));
    // Copyleft / source-available / custom licenses may only be API_INTEGRATE
    // or LEARN — never REUSE (which would mean vendoring the code).
    for (const id of [
      'gateway.free-claude-code',
      'ai-chat.open-webui',
      'content.directus',
      'automation.nocobase',
      'automation.jarvis',
      'coding-agent.tool-loop',
    ]) {
      const a = byId.get(id);
      expect(a, id).toBeDefined();
      expect(a?.strategy, id).not.toBe('REUSE');
    }
    expect(byId.get('gateway.free-claude-code')?.strategy).toBe('API_INTEGRATE');
    expect(byId.get('content.grapesjs')?.strategy).toBe('REUSE');
    expect(byId.get('deploy.dokku')?.strategy).toBe('REUSE');
  });
});

describe('LiteLLM connector', () => {
  it('lists models with bearer auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o-mini', owned_by: 'openai' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await litellmListModels(ctx());
    expect(result.ok).toBe(true);
    expect(result.data?.[0]).toEqual({ id: 'gpt-4o-mini', ownedBy: 'openai' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://selfhosted.example.com/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('surfaces HTTP failures as ok:false with status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 401)));
    const result = await litellmListModels(ctx());
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(401);
  });

  it('fails closed without an api key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await litellmListModels(ctx({ credential: { baseUrl: 'https://x.example.com' } }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing apiKey/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chats through the OpenAI-compatible proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ model: 'claude-sonnet', choices: [{ message: { content: 'hi' } }] }),
      ),
    );
    const result = await litellmChat(ctx(), {
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.data).toEqual({ content: 'hi', model: 'claude-sonnet' });
  });
});

describe('gateway routers', () => {
  it('OmniRoute lists provider model ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'a' }, { id: '' }] })));
    const result = await omnirouteListModels(ctx());
    expect(result.data).toEqual(['a']);
  });

  it('Free Claude Code lists model ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'glm-4.6' }] })));
    const result = await freeClaudeCodeListModels(ctx());
    expect(result.data).toEqual(['glm-4.6']);
  });
});

describe('chat UI connectors', () => {
  it('LibreChat reads /api/models and tolerates string entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ models: ['gpt-4o', { id: 'o3' }] })));
    const result = await librechatListModels(ctx());
    expect(result.data).toEqual(['gpt-4o', 'o3']);
  });

  it('Open WebUI reads /api/models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'llama3' }] })));
    const result = await openWebuiListModels(ctx());
    expect(result.data).toEqual(['llama3']);
  });
});

describe('coding-agent patterns', () => {
  it('round-trips Aider SEARCH/REPLACE hunks', () => {
    const text = aiderFormatHunks([{ file: 'a.ts', search: 'const x = 1;', replace: 'const x = 2;' }]);
    expect(text).toContain('<<<<<<< SEARCH');
    const parsed = aiderParseHunks(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].search).toBe('const x = 1;');
    expect(parsed[0].replace).toBe('const x = 2;');
  });

  it('ignores malformed Aider output', () => {
    expect(aiderParseHunks('no hunks here')).toEqual([]);
  });

  it('validates SWE-agent trajectories in step order', () => {
    expect(
      sweValidateTrajectory([
        { step: 1, action: 'open file' },
        { step: 2, action: 'apply patch', observation: 'ok' },
      ]).ok,
    ).toBe(true);
    expect(sweValidateTrajectory([{ step: 2, action: 'x' }]).ok).toBe(false);
    expect(sweValidateTrajectory([{ step: 1, action: '' }]).ok).toBe(false);
  });

  it('applies the 10x tool-loop policy', () => {
    expect(toolLoopShouldContinue(DEFAULT_TOOL_LOOP_POLICY, 0, 'next').cont).toBe(true);
    expect(toolLoopShouldContinue(DEFAULT_TOOL_LOOP_POLICY, 0, '   ').cont).toBe(false);
    expect(toolLoopShouldContinue(DEFAULT_TOOL_LOOP_POLICY, 25, 'next').cont).toBe(false);
  });
});

describe('content connectors', () => {
  it('Directus lists collection items with a bounded limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await directusListItems(ctx(), 'articles', { limit: 500 });
    expect(result.data).toEqual([{ id: 1 }]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://selfhosted.example.com/items/articles?limit=100');
  });

  it('GrapesJS template export strips scripts', () => {
    const t = grapesSanitizeTemplate({
      name: 'landing',
      html: '<div>hi</div><script>alert(1)</script>',
    });
    expect(t.html).toBe('<div>hi</div>');
  });
});

describe('automation connectors', () => {
  it('Activepieces lists flow ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'f1' }] })));
    const result = await activepiecesListFlows(ctx());
    expect(result.data).toEqual(['f1']);
  });

  it('NocoBase lists collection names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'leads' }, { key: 'orders' }] })));
    const result = await nocobaseListCollections(ctx());
    expect(result.data).toEqual(['leads', 'orders']);
  });

  it('Jarvis requires approval for sensitive actions and blocks cloud in strict mode', () => {
    expect(jarvisRequiresApproval({ action: 'send email', sensitive: true, approved: null })).toBe(true);
    expect(jarvisRequiresApproval({ action: 'read file', sensitive: false, approved: null })).toBe(false);
    expect(jarvisAllowsCloud('strict')).toBe(false);
    expect(jarvisAllowsCloud('guarded')).toBe(true);
  });
});

describe('deploy + telephony + media patterns', () => {
  it('Dokku validates deploy specs', () => {
    expect(dokkuValidateSpec({ app: 'agentos', gitUrl: 'git@host:repo.git' }).ok).toBe(true);
    expect(dokkuValidateSpec({ app: 'AgentOS', gitUrl: 'git@host:repo.git' }).ok).toBe(false);
    expect(dokkuValidateSpec({ app: 'agentos', gitUrl: '' }).ok).toBe(false);
  });

  it('Call-GPT validates function calls', () => {
    expect(callGptValidateCall({ name: 'transfer', arguments: { to: '+8801' } }).ok).toBe(true);
    expect(callGptValidateCall({ name: '', arguments: {} }).ok).toBe(false);
  });

  it('Call-intelligence validates summaries', () => {
    expect(callIntelValidate({ sentiment: 'positive', intents: ['billing'], actionItems: [] }).ok).toBe(true);
    // @ts-expect-error — deliberately invalid sentiment for the guard test
    expect(callIntelValidate({ sentiment: 'angry', intents: [], actionItems: [] }).ok).toBe(false);
  });
});
