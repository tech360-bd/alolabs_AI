#!/usr/bin/env tsx
/**
 * Static capacity report: what the workforce's model policies actually demand.
 *
 *   npx tsx scripts/tier-capacity.ts
 *   npx tsx scripts/tier-capacity.ts --json
 *
 * Reads the committed workforce inventory (docs/workforce/agents.csv) and maps
 * each agent's `model_policy` to a concrete model through the same resolver the
 * runtime uses. The point is to see the demand *before* pointing 2,000 agents at
 * one GPU: the router has a circuit breaker but no per-model admission control.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODEL_TIERS,
  resolveModelForTier,
  type ModelTier,
} from '../src/lib/ai-router/model-tiers';

interface Row {
  model_policy?: string;
  department_slug?: string;
  lifecycle_status?: string;
}

/** Rough quantized weight footprint, GB. Order-of-magnitude only. */
const APPROX_WEIGHTS_GB: Record<ModelTier, number> = {
  reasoning: 47,
  balanced: 20,
  coding: 20,
  vision: 6,
  fast: 1.5,
  embedding: 0.3,
};

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((name, i) => {
      row[name] = cells[i] ?? '';
    });
    return row as Row;
  });
}

/** Handles the quoting this inventory actually uses (no embedded newlines). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function main(): void {
  const json = process.argv.includes('--json');
  const csvPath = join(process.cwd(), 'docs', 'workforce', 'agents.csv');
  const rows = parseCsv(readFileSync(csvPath, 'utf-8'));

  const counts = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const row of rows) {
    const policy = (row.model_policy ?? '').trim() || 'balanced';
    counts.set(policy, (counts.get(policy) ?? 0) + 1);
    const status = (row.lifecycle_status ?? 'unknown').trim();
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }

  const tiers = [...MODEL_TIERS].map((tier) => {
    const agents = counts.get(tier) ?? 0;
    return {
      tier,
      model: resolveModelForTier(tier),
      agents,
      approxWeightsGb: APPROX_WEIGHTS_GB[tier],
      // Every agent needing the model at once would need its own copy of the
      // weights only if you ran a process per agent; the real constraint is
      // concurrent sequences. This column is a floor for "one model resident".
    };
  });

  const unknownPolicies = [...counts.keys()].filter(
    (policy) => !(MODEL_TIERS as readonly string[]).includes(policy),
  );

  const report = {
    source: 'docs/workforce/agents.csv',
    agents: rows.length,
    tiers,
    lifecycle: Object.fromEntries([...byStatus.entries()].sort()),
    unknownPolicies,
    note:
      'Weights are per resident model, not per agent. Concurrency limits come from GPU slots; ' +
      'the router has no per-tier admission control yet.',
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Agents in inventory: ${rows.length}`);
  console.log('');
  console.log('Tier       Model                          Agents   Weights(Gb)');
  for (const tier of tiers) {
    console.log(
      `${tier.tier.padEnd(10)} ${tier.model.padEnd(30)} ${String(tier.agents).padStart(6)}   ${String(tier.approxWeightsGb).padStart(6)}`,
    );
  }
  console.log('');
  console.log('Lifecycle:', Object.entries(report.lifecycle).map(([k, v]) => `${k}=${v}`).join(', '));
  if (unknownPolicies.length > 0) {
    console.log('Unmapped policies (resolve to balanced):', unknownPolicies.join(', '));
  }
  const reasoning = counts.get('reasoning') ?? 0;
  if (reasoning > 0) {
    console.log('');
    console.log(
      `Attention: ${reasoning} agents are policy-tier "reasoning" (${resolveModelForTier('reasoning')}).`,
    );
    console.log(
      'Do not dispatch them concurrently onto one GPU. Raise worker slots only after measuring p95.',
    );
  }
}

main();
