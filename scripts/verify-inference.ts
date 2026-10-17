#!/usr/bin/env tsx
/**
 * Verify the local inference gateway — one real completion per model tier.
 *
 *   npx tsx scripts/verify-inference.ts
 *   npx tsx scripts/verify-inference.ts --base-url http://localhost:11434/v1
 *   npx tsx scripts/verify-inference.ts --tiers reasoning,fast --json
 *
 * This is the check that answers "is the local stack actually serving the
 * models the tier policy names?" — not "is a provider configured?". It sends a
 * real chat completion and fails if the response is empty, truncated or slow.
 *
 * Exit code 0 only when every selected tier responded. No fallback to a paid
 * provider: an unreachable gateway is a failure, not a reason to spend money.
 */

import { MODEL_TIERS, resolveModelForTier, type ModelTier } from '../src/lib/ai-router/model-tiers';

interface TierResult {
  tier: ModelTier;
  model: string;
  ok: boolean;
  latencyMs: number;
  reply?: string;
  tokens?: { prompt: number; completion: number };
  error?: string;
}

interface Options {
  baseUrl: string;
  tiers: ModelTier[];
  timeoutMs: number;
  json: boolean;
  maxTokens: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const baseUrl = (
    get('--base-url') ??
    process.env.LOCAL_INFERENCE_URL ??
    `http://localhost:${process.env.LOCAL_INFERENCE_PORT ?? '20128'}/v1`
  ).replace(/\/+$/, '');

  const tierArg = get('--tiers');
  const tiers = tierArg
    ? (tierArg.split(',').map((t) => t.trim()) as ModelTier[])
    : [...MODEL_TIERS];

  const unknown = tiers.filter((tier) => !MODEL_TIERS.includes(tier));
  if (unknown.length > 0) {
    throw new Error(`Unknown tier(s): ${unknown.join(', ')}. Valid: ${MODEL_TIERS.join(', ')}`);
  }

  return {
    baseUrl,
    tiers,
    timeoutMs: Number(get('--timeout') ?? process.env.LOCAL_INFERENCE_TIMEOUT_MS ?? 120_000),
    json: argv.includes('--json'),
    maxTokens: Number(get('--max-tokens') ?? 32),
  };
}

async function probeTier(options: Options, tier: ModelTier): Promise<TierResult> {
  const model = resolveModelForTier(tier);
  const started = Date.now();

  try {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.LOCAL_INFERENCE_API_KEY
          ? { authorization: `Bearer ${process.env.LOCAL_INFERENCE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Answer with exactly one short sentence.' },
          { role: 'user', content: `Tier ${tier} health check: say which model you are.` },
        ],
        max_tokens: options.maxTokens,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        tier,
        model,
        ok: false,
        latencyMs: Date.now() - started,
        error: `HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      };
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const reply = payload.choices?.[0]?.message?.content?.trim() ?? '';
    return {
      tier,
      model: payload.model ?? model,
      ok: reply.length > 0,
      latencyMs: Date.now() - started,
      reply: reply.slice(0, 200),
      tokens: payload.usage
        ? {
            prompt: payload.usage.prompt_tokens ?? 0,
            completion: payload.usage.completion_tokens ?? 0,
          }
        : undefined,
      error: reply.length > 0 ? undefined : 'empty completion content',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tier, model, ok: false, latencyMs: Date.now() - started, error: message };
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.json) {
    console.log(`Inference gateway: ${options.baseUrl}`);
    console.log(`Tiers: ${options.tiers.join(', ')}\n`);
  }

  const results: TierResult[] = [];
  // Sequential on purpose: a local GPU queues requests anyway, and parallel
  // probes distort the latency number this script exists to report.
  for (const tier of options.tiers) {
    const result = await probeTier(options, tier);
    results.push(result);
    if (!options.json) {
      const status = result.ok ? 'OK  ' : 'FAIL';
      const detail = result.ok
        ? `${result.latencyMs}ms — ${result.reply ?? ''}`
        : `${result.latencyMs}ms — ${result.error ?? 'unknown error'}`;
      console.log(`${status} ${tier.padEnd(9)} ${result.model.padEnd(28)} ${detail}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          baseUrl: options.baseUrl,
          checkedAt: new Date().toISOString(),
          results,
          passed: results.length - failed.length,
          failed: failed.length,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\n${results.length - failed.length}/${results.length} tiers responding`);
    if (failed.length > 0) {
      console.log('Gateway is not ready. Start it with:');
      console.log('  docker compose -f docker-compose.inference.yml up -d ollama');
      console.log('  docker compose -f docker-compose.inference.yml --profile models up model-pull');
    }
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
