import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── DeepSeek Provider ────────────────────────────────────────────

describe('DeepSeek Provider', () => {
  it('should be instantiable', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const { DeepSeekProvider } = await import('@/lib/ai-router/deepseek-provider');
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
    expect(provider.name).toBe('deepseek');
  });

  it('should list supported models', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const { DeepSeekProvider } = await import('@/lib/ai-router/deepseek-provider');
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models.map((m: any) => m.id)).toContain('deepseek-chat');
    expect(models.map((m: any) => m.id)).toContain('deepseek-coder');
  });

  it('should throw on initialize without API key', async () => {
    const { DeepSeekProvider } = await import('@/lib/ai-router/deepseek-provider');
    const provider = new DeepSeekProvider({ apiKey: '' });
    await expect(provider.initialize()).rejects.toThrow('API key is required');
  });

  it('should have correct context lengths', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const { DeepSeekProvider } = await import('@/lib/ai-router/deepseek-provider');
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    const chat = models.find((m: any) => m.id === 'deepseek-chat');
    expect(chat.contextLength).toBe(64_000);
    const coder = models.find((m: any) => m.id === 'deepseek-coder');
    expect(coder.contextLength).toBe(128_000);
  });
});

// ─── Qwen Provider ────────────────────────────────────────────────

describe('Qwen Provider', () => {
  it('should be instantiable', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('should list 3 models', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    expect(models.length).toBe(3);
  });

  it('should have correct model IDs', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    const ids = models.map((m: any) => m.id);
    expect(ids).toContain('qwen-turbo');
    expect(ids).toContain('qwen-plus');
    expect(ids).toContain('qwen-max');
  });

  it('should have qwen-turbo with 1.3M context', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    const turbo = models.find((m: any) => m.id === 'qwen-turbo');
    expect(turbo.contextLength).toBe(1_300_000);
  });

  it('should throw on initialize without API key', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: '' });
    await expect(provider.initialize()).rejects.toThrow('API key is required');
  });
});

// ─── Mistral Provider ─────────────────────────────────────────────

describe('Mistral Provider', () => {
  it('should be instantiable', async () => {
    const { MistralProvider } = await import('@/lib/ai-router/mistral-provider');
    const provider = new MistralProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('should list 4 models', async () => {
    const { MistralProvider } = await import('@/lib/ai-router/mistral-provider');
    const provider = new MistralProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    expect(models.length).toBe(4);
  });

  it('should include mistral-tiny, small, medium, large', async () => {
    const { MistralProvider } = await import('@/lib/ai-router/mistral-provider');
    const provider = new MistralProvider({ apiKey: 'test-key' });
    const models = await provider.listModels();
    const ids = models.map((m: any) => m.id);
    expect(ids).toContain('mistral-tiny');
    expect(ids).toContain('mistral-small');
    expect(ids).toContain('mistral-medium');
    expect(ids).toContain('mistral-large');
  });

  it('should throw on initialize without API key', async () => {
    const { MistralProvider } = await import('@/lib/ai-router/mistral-provider');
    const provider = new MistralProvider({ apiKey: '' });
    await expect(provider.initialize()).rejects.toThrow('API key is required');
  });
});

// ─── Llama (Ollama) Provider ──────────────────────────────────────

describe('Llama Provider (Ollama)', () => {
  it('should be instantiable', async () => {
    const { LlamaProvider } = await import('@/lib/ai-router/llama-provider');
    const provider = new LlamaProvider();
    expect(provider).toBeDefined();
  });

  it('should list 3 static models', async () => {
    const { LlamaProvider } = await import('@/lib/ai-router/llama-provider');
    const provider = new LlamaProvider();
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThanOrEqual(3);
  });

  it('should include llama3 and codellama', async () => {
    const { LlamaProvider } = await import('@/lib/ai-router/llama-provider');
    const provider = new LlamaProvider();
    const models = await provider.listModels();
    const ids = models.map((m: any) => m.id);
    expect(ids).toContain('llama3');
    expect(ids).toContain('codellama');
  });

  it('should use Ollama as provider name', async () => {
    const { LlamaProvider } = await import('@/lib/ai-router/llama-provider');
    const provider = new LlamaProvider();
    expect(provider.name).toBe('ollama-llama');
  });
});

// ─── Health Check Tests ───────────────────────────────────────────

describe('AI Provider Health Checks', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DeepSeek health check should return unhealthy when fetch fails', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const { DeepSeekProvider } = await import('@/lib/ai-router/deepseek-provider');
    const provider = new DeepSeekProvider({ apiKey: 'test-key', endpoint: 'http://localhost:99999' });
    const health = await provider.healthCheck();
    expect(health.isHealthy).toBe(false);
    expect(health.errorRate).toBe(1);
  });

  it('Qwen health check should return unhealthy when fetch fails', async () => {
    const { QwenProvider } = await import('@/lib/ai-router/qwen-provider');
    const provider = new QwenProvider({ apiKey: 'test-key', endpoint: 'http://localhost:99999' });
    const health = await provider.healthCheck();
    expect(health.isHealthy).toBe(false);
  });

  it('Mistral health check should return unhealthy when fetch fails', async () => {
    const { MistralProvider } = await import('@/lib/ai-router/mistral-provider');
    const provider = new MistralProvider({ apiKey: 'test-key', endpoint: 'http://localhost:99999' });
    const health = await provider.healthCheck();
    expect(health.isHealthy).toBe(false);
  });
});

// ─── Authorization-Bounded Router Failover ─────────────────────────

describe('AI Router policy-bound failover', () => {
  it('does not start an internal retry when the central policy owns failover', async () => {
    const { AIRouter } = await import('@/lib/ai-router/router');
    const { BaseAIProvider } = await import('@/lib/ai-router/provider-base');
    const { AIRouterError } = await import('@/lib/ai-router/types');

    class MockProvider extends BaseAIProvider {
      readonly name = 'ollama' as const;
      supportedModels = [{
        id: 'local-model', name: 'Local', provider: 'ollama' as const, family: 'custom' as const,
        parameters: {}, contextLength: 8192, capabilities: ['chat' as const],
      }];
      readonly complete = vi.fn(async () => {
        throw new AIRouterError('temporary provider failure', 'ollama', 503, true);
      });
      async initialize() { this._initialized = true; }
      async chatCompletion(request: import('@/lib/ai-router/types').AIRequest) { return this.complete(request) as never; }
      async *streamChatCompletion() { return; }
      async healthCheck() {
        return { provider: this.name, isHealthy: true, latencyMs: 0, errorRate: 0, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false };
      }
      async listModels() { return this.supportedModels; }
    }
    class FallbackProvider extends BaseAIProvider {
      readonly name = 'ollama-llama' as const;
      supportedModels = [{
        id: 'local-model', name: 'Local', provider: 'ollama-llama' as const, family: 'custom' as const,
        parameters: {}, contextLength: 8192, capabilities: ['chat' as const],
      }];
      readonly complete = vi.fn(async (request: import('@/lib/ai-router/types').AIRequest) => ({
        id: 'fallback-id', content: 'fallback', model: request.model,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: 'stop' as const, latencyMs: 1,
      }));
      async initialize() { this._initialized = true; }
      async chatCompletion(request: import('@/lib/ai-router/types').AIRequest) { return this.complete(request); }
      async *streamChatCompletion() { return; }
      async healthCheck() {
        return { provider: this.name, isHealthy: true, latencyMs: 0, errorRate: 0, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false };
      }
      async listModels() { return this.supportedModels; }
    }

    const router = new AIRouter();
    const primary = new MockProvider();
    const fallback = new FallbackProvider();
    router.registerProvider(primary, { isLocal: true });
    router.registerProvider(fallback, { isLocal: true });

    await expect(router.chat(
      { model: 'local-model', messages: [{ role: 'user', content: 'hello' }] },
      'company-a',
      undefined,
      { allowFailover: false },
    )).rejects.toThrow('temporary provider failure');
    expect(fallback.complete).not.toHaveBeenCalled();
    await router.destroy();
  });

  it('never chooses a router fallback model outside the server-authorized model set', async () => {
    const { AIRouter } = await import('@/lib/ai-router/router');
    const { BaseAIProvider } = await import('@/lib/ai-router/provider-base');
    const { AIRouterError } = await import('@/lib/ai-router/types');

    const mkModel = (id: string, provider: 'ollama' | 'ollama-llama') => ({
      id, name: id, provider, family: 'custom' as const, parameters: {}, contextLength: 8192,
      capabilities: ['chat' as const],
    });
    class Primary extends BaseAIProvider {
      readonly name = 'ollama' as const;
      supportedModels = [mkModel('allowed-model', this.name)];
      async initialize() { this._initialized = true; }
      async chatCompletion() { throw new AIRouterError('temporary provider failure', this.name, 503, true); }
      async *streamChatCompletion() { return; }
      async healthCheck() { return { provider: this.name, isHealthy: true, latencyMs: 0, errorRate: 0, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false }; }
      async listModels() { return this.supportedModels; }
    }
    class Fallback extends BaseAIProvider {
      readonly name = 'ollama-llama' as const;
      supportedModels = [mkModel('forbidden-model', this.name), mkModel('allowed-model', this.name)];
      readonly complete = vi.fn(async (request: import('@/lib/ai-router/types').AIRequest) => ({
        id: 'fallback-id', content: 'fallback', model: request.model,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: 'stop' as const, latencyMs: 1,
      }));
      async initialize() { this._initialized = true; }
      async chatCompletion(request: import('@/lib/ai-router/types').AIRequest) { return this.complete(request); }
      async *streamChatCompletion() { return; }
      async healthCheck() { return { provider: this.name, isHealthy: true, latencyMs: 0, errorRate: 0, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false }; }
      async listModels() { return this.supportedModels; }
    }

    const router = new AIRouter();
    const primary = new Primary();
    const fallback = new Fallback();
    router.registerProvider(primary, { isLocal: true });
    router.registerProvider(fallback, { isLocal: true });

    const result = await router.chat(
      { model: '', messages: [{ role: 'user', content: 'hello' }] },
      'company-a',
      undefined,
      {
        allowFailover: true,
        allowedProviderNames: ['ollama', 'ollama-llama'],
        allowedModelIds: ['allowed-model'],
      },
    );
    expect(result.model).toBe('allowed-model');
    expect(fallback.complete).toHaveBeenCalledWith(expect.objectContaining({ model: 'allowed-model' }));
    await router.destroy();
  });
});
