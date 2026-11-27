import { describe, expect, it } from 'vitest';
import { providersFromEnvironment } from '@/lib/ai-router/provider-registry';

describe('self-hosted provider defaults', () => {
  it('does not register hosted ZAI unless the operator explicitly opts in', () => {
    expect(providersFromEnvironment({ NODE_ENV: 'test' }).map((provider) => provider.name)).not.toContain('zai-sdk');
    expect(providersFromEnvironment({ NODE_ENV: 'test',  ZAI_SDK_ENABLED: 'false' }).map((provider) => provider.name)).not.toContain('zai-sdk');
    expect(providersFromEnvironment({ NODE_ENV: 'test',  ZAI_SDK_ENABLED: 'true' }).map((provider) => provider.name)).toContain('zai-sdk');
  });

  it('does not invent a local inference service when none is configured', () => {
    expect(providersFromEnvironment({ NODE_ENV: 'test' }).map((provider) => provider.name)).not.toContain('openai-compatible:local-gateway');
  });
});

describe('self-hosted OpenAI-compatible server auto-registration', () => {
  it('registers a trusted-local vLLM endpoint with its declared models', () => {
    const specs = providersFromEnvironment({
      NODE_ENV: 'test',
      VLLM_BASE_URL: 'http://localhost:8000/v1',
      VLLM_MODELS: 'Qwen/Qwen2.5-7B-Instruct, meta-llama/Llama-3.1-8B-Instruct',
    });
    const vllm = specs.find((s) => s.name === 'vllm');
    expect(vllm).toBeDefined();
    expect(vllm?.isLocal).toBe(true);
    const instance = vllm?.create();
    expect(instance).toBeDefined();
  });

  it('registers every self-hosted server kind from its own env variables', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      VLLM_BASE_URL: 'http://127.0.0.1:8000/v1',
      VLLM_MODELS: 'm1',
      LOCALAI_BASE_URL: 'http://127.0.0.1:8080/v1',
      LOCALAI_MODELS: 'm1',
      LITELLM_BASE_URL: 'http://127.0.0.1:4000/v1',
      LITELLM_MODELS: 'm1',
      TGI_BASE_URL: 'http://127.0.0.1:80/v1',
      TGI_MODELS: 'm1',
      LM_STUDIO_BASE_URL: 'http://127.0.0.1:1234/v1',
      LM_STUDIO_MODELS: 'm1',
      JAN_BASE_URL: 'http://127.0.0.1:1337/v1',
      JAN_MODELS: 'm1',
      TEXT_GENERATION_WEBUI_BASE_URL: 'http://127.0.0.1:5000/v1',
      TEXT_GENERATION_WEBUI_MODELS: 'm1',
    };
    const names = providersFromEnvironment(env).map((s) => s.name);
    for (const kind of ['vllm', 'localai', 'litellm-proxy', 'tgi', 'lm-studio', 'jan', 'text-generation-webui']) {
      expect(names).toContain(kind);
    }
  });

  it('refuses to register a self-hosted server on a public endpoint (fail closed)', () => {
    const specs = providersFromEnvironment({
      NODE_ENV: 'test',
      VLLM_BASE_URL: 'https://public.example.com/v1',
      VLLM_MODELS: 'm1',
    });
    expect(specs.map((s) => s.name)).not.toContain('vllm');
  });

  it('refuses to register a self-hosted server without a declared model list', () => {
    const specs = providersFromEnvironment({
      NODE_ENV: 'test',
      VLLM_BASE_URL: 'http://localhost:8000/v1',
    });
    expect(specs.map((s) => s.name)).not.toContain('vllm');
  });
});
