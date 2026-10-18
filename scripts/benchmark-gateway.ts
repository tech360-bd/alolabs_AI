#!/usr/bin/env npx tsx
/**
 * Model gateway benchmark (READ-ONLY).
 *
 * Measures what the gateway can actually do right now, per configured model
 * alias / pinned model:
 *
 *   - availability      : did the call succeed at all
 *   - latency           : wall-clock ms (p50 / p95 over N samples)
 *   - throughput        : completion tokens per second
 *   - json_validity     : can it return parseable JSON on request
 *   - tool_calling      : does it emit a tool call the router can extract
 *
 * It never writes to the database and never downloads models. Run it on the
 * production host after configuring providers:
 *
 *   npx tsx scripts/benchmark-gateway.ts
 *   npx tsx scripts/benchmark-gateway.ts --samples 5 --json > bench.json
 *   npx tsx scripts/benchmark-gateway.ts --models balanced,reasoning
 */

import { ensureRouterSynced } from '@/lib/ai-router';
import type { AITool } from '@/lib/ai-router/types';

const TOOLS: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Search the company knowledge base.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

interface Sample {
  ok: boolean;
  latencyMs: number;
  tokensPerSecond: number | null;
  totalTokens: number;
  error?: string;
}

async function timed(fn: () => Promise<{ totalTokens: number }>): Promise<Sample> {
  const start = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - start;
    return {
      ok: true,
      latencyMs,
      totalTokens: result.totalTokens,
      tokensPerSecond: latencyMs > 0 ? Number(((result.totalTokens / latencyMs) * 1000).toFixed(2)) : null,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      tokensPerSecond: null,
      totalTokens: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const samples = Math.max(1, Math.min(10, parseInt(argValue('--samples', '3'), 10) || 3));
  const models = argValue('--models', 'fast,balanced,reasoning,coding')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const router = await ensureRouterSynced({ force: true });
  const providers = router.getProviderSummaries();

  const report: Array<Record<string, unknown>> = [];

  for (const model of models) {
    const latency: Sample[] = [];
    for (let i = 0; i < samples; i += 1) {
      latency.push(
        await timed(async () => {
          const response = await router.chat({
            model,
            messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
            maxTokens: 32,
            temperature: 0,
          });
          return { totalTokens: response.usage.totalTokens };
        }),
      );
    }

    const jsonSample = await timed(async () => {
      const response = await router.chat({
        model,
        messages: [
          { role: 'system', content: 'Answer only with a JSON object, no prose.' },
          { role: 'user', content: 'Return {"status":"ok","count":3}' },
        ],
        maxTokens: 64,
        temperature: 0,
      });
      const text = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
      JSON.parse(text);
      return { totalTokens: response.usage.totalTokens };
    });

    const toolSample = await timed(async () => {
      const response = await router.chat({
        model,
        messages: [{ role: 'user', content: 'Find our refund policy. Use the search_knowledge tool.' }],
        tools: TOOLS,
        maxTokens: 128,
        temperature: 0,
      });
      if (!response.toolCalls || response.toolCalls.length === 0) {
        throw new Error('Model did not emit a tool call');
      }
      if (response.toolCalls[0].function.name !== 'search_knowledge') {
        throw new Error(`Unexpected tool: ${response.toolCalls[0].function.name}`);
      }
      return { totalTokens: response.usage.totalTokens };
    });

    const okLatencies = latency.filter((sample) => sample.ok).map((sample) => sample.latencyMs);
    report.push({
      model,
      availability: latency.filter((sample) => sample.ok).length / latency.length,
      latencyP50Ms: percentile(okLatencies, 50),
      latencyP95Ms: percentile(okLatencies, 95),
      tokensPerSecond:
        latency.filter((s) => s.ok && s.tokensPerSecond).length > 0
          ? Number(
              (
                latency.filter((s) => s.ok && s.tokensPerSecond).reduce((sum, s) => sum + (s.tokensPerSecond ?? 0), 0) /
                latency.filter((s) => s.ok && s.tokensPerSecond).length
              ).toFixed(2),
            )
          : null,
      jsonValidity: jsonSample.ok,
      toolCalling: toolSample.ok,
      errors: [...latency, jsonSample, toolSample].filter((s) => !s.ok).map((s) => s.error).slice(0, 3),
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), providers, models: report }, null, 2));
    return;
  }

  console.log('MODEL GATEWAY BENCHMARK — read-only');
  console.log(`providers: ${providers.map((p) => `${p.provider}${p.circuitOpen ? '(circuit open)' : ''}`).join(', ') || '(none)'}`);
  console.log('');
  console.log('model      avail   p50ms   p95ms   tok/s   json   tools');
  for (const row of report) {
    console.log(
      `${String(row.model).padEnd(10)} ${String(Math.round(Number(row.availability) * 100)).padStart(4)}% ` +
        `${String(row.latencyP50Ms ?? '-').padStart(6)} ${String(row.latencyP95Ms ?? '-').padStart(6)} ` +
        `${String(row.tokensPerSecond ?? '-').padStart(6)}  ${row.jsonValidity ? 'yes' : 'NO'}   ${row.toolCalling ? 'yes' : 'NO'}`,
    );
  }
  const failures = report.filter((row) => Number(row.availability) === 0);
  if (failures.length) {
    console.log('\nUnavailable models (configure a provider before claiming capability):');
    for (const row of failures) console.log(`  ${row.model}: ${(row.errors as string[])[0] ?? 'no provider'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
