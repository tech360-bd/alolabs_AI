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
