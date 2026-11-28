import { describe, expect, it } from 'vitest';
import {
  applyGuardedRedaction,
  formatAnthropicMessagesResponse,
  formatGeminiGenerateResponse,
  formatOpenAIChatResponse,
  formatOpenAIResponsesResult,
  parseAnthropicMessagesRequest,
  parseGeminiGenerateRequest,
  parseOpenAIChatRequest,
  parseOpenAIResponsesRequest,
} from '@/lib/ai-router/protocol-gateway';
import {
  acquireTenantSlot,
  normalizeCapabilityToRouter,
} from '@/lib/ai-router/command-router';
import {
  SUPPLIED_SOURCES,
  VETTED_ECOSYSTEM_ASSETS,
  getPaginatedDiscoveryStats,
} from '@/lib/ecosystem/asset-vault';
import {
  CODING_HARNESS_DEFINITIONS,
  isProtectedBranch,
  validateSandboxWorkspacePath,
} from '@/lib/coding-agents/harness-registry';
import {
  classifyToolRisk,
  compactToolOutput,
  optimizeToolCallBatch,
} from '@/lib/coding-agents/tool-optimizer';
import {
  QA_VIEWPORT_PRESETS,
  classifyBrowserAction,
} from '@/lib/browser/agent-session';
import { signLiveKitAccessToken } from '@/lib/integrations/connectors/telephony/livekit';
import { computeObsWebSocketAuth } from '@/lib/integrations/connectors/media/obs-websocket';
import { bootstrapIntegrations, integrationRegistry } from '@/lib/integrations';
import { searchFreeResources } from '@/lib/free-resources';

describe('Multi-Protocol Gateway & Guarded Redaction', () => {
  it('translates Anthropic Messages request and formats response', () => {
    const req = parseAnthropicMessagesRequest({
      model: 'claude-sonnet-4-5',
      system: 'Be concise',
      max_tokens: 512,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Ping' }] },
      ],
    });
    expect(req.messages[0]?.role).toBe('system');
    expect(req.messages[0]?.content).toBe('Be concise');
    expect(req.messages[1]?.content).toBe('Ping');

    const formatted = formatAnthropicMessagesResponse(
      {
        id: 'resp-1',
        model: 'llama3.2:latest',
        content: 'Pong',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 42,
      },
      'claude-sonnet-4-5',
    );
    expect(formatted.type).toBe('message');
    expect(formatted.role).toBe('assistant');
    expect(formatted.content[0]?.text).toBe('Pong');
  });

  it('translates OpenAI Chat, OpenAI Responses, and Gemini GenerateContent payloads', () => {
    const chatReq = parseOpenAIChatRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(chatReq.model).toBe('gpt-4o');

    const respReq = parseOpenAIResponsesRequest({
      model: 'o3-mini',
      instructions: 'System note',
      input: 'Summarize architecture',
    });
    expect(respReq.messages[0]?.content).toBe('System note');
    expect(respReq.messages[1]?.content).toBe('Summarize architecture');

    const geminiReq = parseGeminiGenerateRequest(
      'gemini-2.5-flash',
      {
        systemInstruction: { parts: [{ text: 'Be helpful' }] },
        contents: [{ role: 'user', parts: [{ text: 'Status?' }] }],
      },
    );
    expect(geminiReq.model).toBe('gemini-2.5-flash');
    expect(geminiReq.messages[0]?.role).toBe('system');
    expect(geminiReq.messages[1]?.role).toBe('user');

    const mockAiRes = {
      id: 'res-1',
      model: 'qwen2.5-coder:7b',
      content: 'Ready',
      finishReason: 'stop' as const,
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      latencyMs: 12,
    };

    expect(formatOpenAIChatResponse(mockAiRes).object).toBe('chat.completion');
    expect(formatOpenAIResponsesResult(mockAiRes).object).toBe('response');
    expect(formatGeminiGenerateResponse(mockAiRes).candidates[0]?.content.parts[0]?.text).toBe('Ready');
  });

  it('redacts sensitive API tokens and private keys in guarded privacy mode', () => {
    const raw =
      'Use sk-abc12345678901234567890 and ghp_abcdef1234567890abcdef1234567890 with Bearer my-secret-token-value-12345';
    const { messages, redactedCount } = applyGuardedRedaction([{ role: 'user', content: raw }]);
    const sanitized = messages[0]!.content;
    expect(redactedCount).toBe(3);
    expect(sanitized).not.toContain('sk-abc12345678901234567890');
    expect(sanitized).not.toContain('ghp_abcdef1234567890abcdef1234567890');
    expect(sanitized).not.toContain('my-secret-token-value-12345');
  });
});

describe('Command Router Capabilities & Concurrency Guards', () => {
  it('maps extended routing capabilities onto AI Router capability primitives', () => {
    expect(normalizeCapabilityToRouter('chat')).toBe('chat');
    expect(normalizeCapabilityToRouter('coding')).toBe('code-generation');
    expect(normalizeCapabilityToRouter('tool-calling')).toBe('function-calling');
    expect(normalizeCapabilityToRouter('image-input')).toBe('vision');
    expect(normalizeCapabilityToRouter('reasoning')).toBe('reasoning');
  });

  it('enforces per-tenant concurrency ceilings and releases slots cleanly', () => {
    const tenant = `test-tenant-${Date.now()}`;
    const r1 = acquireTenantSlot(tenant, 2);
    const r2 = acquireTenantSlot(tenant, 2);
    const r3 = acquireTenantSlot(tenant, 2);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    r1.release();
    const r4 = acquireTenantSlot(tenant, 2);
    expect(r4.allowed).toBe(true);
    r2.release();
    r4.release();
  });
});

describe('Ecosystem Asset Vault & License Gatekeeper', () => {
  it('tracks all 30 supplied sources and paginated discovery stats', () => {
    const stats = getPaginatedDiscoveryStats();
    expect(SUPPLIED_SOURCES.length).toBe(30);
    expect(stats.totalSuppliedSources).toBe(30);
    expect(stats.totalVettedAssets).toBeGreaterThanOrEqual(25);
  });

  it('correctly isolates AGPL-3.0, GPL-2.0, custom-commercial, and unlicensed repositories', () => {
    const fcc = VETTED_ECOSYSTEM_ASSETS.find((a) => a.fullName === 'Alishahryar1/free-claude-code');
    expect(fcc?.licenseSpdx).toBe('AGPL-3.0-only');
    expect(fcc?.boundaryRequired).toBe('external_service_only');

    const tenX = VETTED_ECOSYSTEM_ASSETS.find((a) => a.fullName === 'perrypixel/10x-Tool-Calls');
    expect(tenX?.licenseSpdx).toBe('NONE');
    expect(tenX?.compatibilityStatus).toBe('incompatible');

    const obs = VETTED_ECOSYSTEM_ASSETS.find((a) => a.fullName === 'obsproject/obs-studio');
    expect(obs?.licenseSpdx).toBe('GPL-2.0');
    expect(obs?.boundaryRequired).toBe('external_service_only');

    const nococrm = VETTED_ECOSYSTEM_ASSETS.find((a) => a.fullName === 'nocobase/NocoCRM');
    expect(nococrm?.compatibilityStatus).toBe('restricted');
  });
});

describe('Coding Harnesses, Tool Optimizer & Browser Guardrails', () => {
  it('blocks protected branches and unsafe workspace paths', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('master')).toBe(true);
    expect(isProtectedBranch('release/v1.0')).toBe(true);
    expect(isProtectedBranch('sandbox/add-tests')).toBe(false);

    expect(validateSandboxWorkspacePath('/etc/passwd').ok).toBe(false);
    expect(validateSandboxWorkspacePath('/tmp/app/.git/hooks').ok).toBe(false);
    expect(validateSandboxWorkspacePath('../escape').ok).toBe(false);
    expect(validateSandboxWorkspacePath('sandboxes/company-1/run-1').ok).toBe(true);
    expect(CODING_HARNESS_DEFINITIONS.length).toBeGreaterThanOrEqual(12);
  });

  it('deduplicates repeated read-only tool calls and gates mutations cleanly', () => {
    const plan = optimizeToolCallBatch([
      { name: 'repo.read_file', args: { path: 'a.ts' } },
      { name: 'repo.read_file', args: { path: 'a.ts' } },
      { name: 'repo.search_code', args: { query: 'hello' } },
      { name: 'repo.apply_patch', args: { path: 'a.ts' } },
    ]);
    expect(plan.originalCount).toBe(4);
    expect(plan.deduplicatedCount).toBe(3);
    expect(plan.batches[0]?.parallelSafe).toBe(true);
    expect(plan.batches[0]?.calls.length).toBe(2);
    expect(plan.batches[1]?.parallelSafe).toBe(false);
    expect(plan.estimatedTokensSaved).toBeGreaterThan(0);

    expect(classifyToolRisk('repo.read_file').requiresApproval).toBe(false);
    expect(classifyToolRisk('social.publish_post').requiresApproval).toBe(true);

    const compacted = compactToolOutput('x'.repeat(10_000), 1000);
    expect(compacted.compactedChars).toBeLessThan(1200);
    expect(compacted.estimatedTokensSaved).toBeGreaterThan(2000);
  });

  it('separates read-only browser QA from approval-gated form/publish mutations', () => {
    expect(classifyBrowserAction('navigate').requiresHumanApproval).toBe(false);
    expect(classifyBrowserAction('screenshot').requiresHumanApproval).toBe(false);
    expect(classifyBrowserAction('submit_form').requiresHumanApproval).toBe(true);
    expect(classifyBrowserAction('publish_content').requiresHumanApproval).toBe(true);
    expect(QA_VIEWPORT_PRESETS.map((v) => v.width)).toEqual([1440, 768, 390]);
  });
});

describe('ONE Runtime Wave-3 Adapters, LiveKit & OBS Auth', () => {
  it('registers all Wave-3 connectors and expands free self-hosted resources', () => {
    bootstrapIntegrations();
    const list = integrationRegistry.list();
    expect(list.length).toBeGreaterThanOrEqual(35);
    expect(integrationRegistry.get('telephony.livekit')).toBeDefined();
    expect(integrationRegistry.get('media.obs-websocket')).toBeDefined();
    expect(integrationRegistry.get('media.joincall')).toBeDefined();
    expect(integrationRegistry.get('coding-agent.opencode')).toBeDefined();
    expect(integrationRegistry.get('coding-agent.browse-mcp')).toBeDefined();
    expect(integrationRegistry.get('content.postmill')).toBeDefined();
    expect(integrationRegistry.get('messaging.larksuite')).toBeDefined();

    expect(searchFreeResources('livekit').length).toBeGreaterThanOrEqual(1);
    expect(searchFreeResources('opencode').length).toBeGreaterThanOrEqual(1);
  });

  it('mints valid LiveKit HS256 JWT tokens and OBS WebSocket v5 SHA-256 auth proofs', () => {
    const jwt = signLiveKitAccessToken({
      apiKey: 'devkey',
      apiSecret: 'secret-signing-key-32-chars-minimum',
      identity: 'user-1',
      roomName: 'alo-standup',
    });
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    const decoded = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      iss: string;
      video: { room: string };
    };
    expect(decoded.iss).toBe('devkey');
    expect(decoded.video.room).toBe('alo-standup');

    const auth = computeObsWebSocketAuth('supersecretpassword', 'salt123', 'challenge456');
    expect(auth).toBe(computeObsWebSocketAuth('supersecretpassword', 'salt123', 'challenge456'));
    expect(auth.length).toBeGreaterThan(20);
  });
});
