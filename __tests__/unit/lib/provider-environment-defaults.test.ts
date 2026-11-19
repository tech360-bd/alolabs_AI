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
