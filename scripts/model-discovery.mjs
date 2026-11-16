#!/usr/bin/env node
/**
 * ALO Labs — Weekly open-source AI model discovery (Phase 12).
 *
 * Read-only discovery: fetches the current public model catalogue from
 * OpenRouter's public API (no credentials) and, when reachable, the Ollama
 * library index. Produces a Markdown report of free-lane models and Ollama library entries.
 * Neither free pricing nor inclusion in a catalogue proves an open-source licence.
 *
 * HARD RULES:
 * - This script NEVER activates, registers, replaces or routes any
 *   production model. It only writes a report for human review.
 * - Every entry carries its source URL and retrieval date.
 * - Nothing here is production-eligible until a human reviewer verifies the
 *   licence, terms and behaviour against official documentation.
 *
 * Usage:
 *   node scripts/model-discovery.mjs                 # stdout report
 *   node scripts/model-discovery.mjs --out FILE      # also write FILE
 */

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';

const RETRIEVED_AT = new Date().toISOString();

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} responded HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} responded HTTP ${res.status}`);
  return res.text();
}

// Avoid Number(null), Number('') and numeric underflow treating missing or
// non-zero prices as zero. Only accept an explicit, syntactically zero value.
function isExplicitZeroPrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value === 0;
  if (typeof value !== 'string') return false;
  return /^\+?0+(?:\.0+)?(?:e[+-]?\d+)?$/i.test(value.trim());
}

/**
 * Free-lane models from OpenRouter. A lane is treated as free ONLY when the
 * API itself reports an explicit zero price for BOTH prompt and completion.
 * Anything else is not evidence of $0 and is excluded (fail-closed).
 */
export function extractFreeModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter((m) => typeof m?.id === 'string')
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      promptPrice: m.pricing?.prompt ?? null,
      completionPrice: m.pricing?.completion ?? null,
      supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
      description: typeof m.description === 'string' ? m.description.slice(0, 400) : null,
    }))
    .filter((m) => {
      return isExplicitZeroPrice(m.promptPrice) && isExplicitZeroPrice(m.completionPrice);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Ollama library: names + description blurbs (community index page). */
export function extractOllamaModels(html) {
  const names = new Set();
  const re = /href="\/library\/([a-z0-9][a-z0-9._:-]*)"/gi;
  let match;
  while ((match = re.exec(html)) !== null) names.add(match[1]);
  return [...names].sort();
}

function toolCalling(params) {
  return params.includes('tool_choice') || params.includes('tools') ? 'yes (per API)' : 'not advertised';
}

export function buildReport({ openrouter, ollama }) {
  const lines = [];
  lines.push('# Weekly AI Model Discovery Report (human review required)');
  lines.push('');
  lines.push(`- Retrieval date (UTC): ${RETRIEVED_AT}`);
  lines.push('- Sources:');
  lines.push(`  - OpenRouter public models API: ${OPENROUTER_MODELS_URL}`);
  lines.push(`  - Ollama library index: ${OLLAMA_LIBRARY_URL}`);
  lines.push('- **Review policy:** discovery output is INFORMATION ONLY; free pricing or');
  lines.push('  catalogue inclusion does not establish an open-source licence. No model becomes');
  lines.push('  production-eligible without human review of the official licence, commercial');
  lines.push('  terms, privacy policy and behaviour tests. This workflow never activates,');
  lines.push('  replaces or routes production models.');
  lines.push('');

  if (openrouter.error) {
    lines.push(`## OpenRouter free lanes — FETCH FAILED`);
    lines.push('');
    lines.push(`Error: ${openrouter.error}. Verify manually at https://openrouter.ai/models?max_price=0`);
  } else {
    lines.push(`## OpenRouter free-lane models (${openrouter.models.length})`);
    lines.push('');
    lines.push('| Model ID | Name | Context | Tool calling | Retrieved (UTC) |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const m of openrouter.models) {
      lines.push(
        `| \`${m.id}\` | ${m.name} | ${m.contextLength ?? 'n/a'} | ${toolCalling(m.supportedParameters)} | ${RETRIEVED_AT} |`,
      );
    }
    lines.push('');
    lines.push('Pricing evidence: the API reports explicit $0 prompt AND completion prices for');
    lines.push('the lanes above. Other modalities and fees may have separate charges; verify');
    lines.push('all pricing before use. Free-tier');
    lines.push('rate limits (RPM/RPD) are enforced by OpenRouter per account and are NOT visible');
    lines.push('in this API — verify current limits at https://openrouter.ai/docs#limits before use.');
  }
  lines.push('');

  if (ollama.error) {
    lines.push('## Ollama library — FETCH FAILED');
    lines.push('');
    lines.push(`Error: ${ollama.error}. Verify manually at ${OLLAMA_LIBRARY_URL}`);
  } else {
    lines.push(`## Ollama library index (${ollama.models.length} model families)`);
    lines.push('');
    lines.push('Names only — licence and size must be verified per model page (Apache-2.0,');
    lines.push('MIT, Llama community terms etc. differ per family):');
    lines.push('');
    lines.push(ollama.models.map((n) => `- [${n}](${OLLAMA_LIBRARY_URL}/${n})`).join('\n'));
  }
  lines.push('');
  lines.push('## Human review checklist before any model becomes production-eligible');
  lines.push('');
  lines.push('1. Licence and commercial-use terms from the official model page.');
  lines.push('2. Privacy / data-retention policy of the serving provider.');
  lines.push('3. Current free-tier limits (RPM/RPD/token caps) from official docs.');
  lines.push('4. Tool-calling and JSON-mode behaviour verified by real tests.');
  lines.push('5. Performance benchmark on the ALO Labs server hardware (CPU/RAM only).');
  lines.push('6. Explicit Super Admin approval recorded in the audit ledger.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outFile = outIndex !== -1 ? process.argv[outIndex + 1] : null;

  const [openrouter, ollama] = await Promise.all([
    fetchJson(OPENROUTER_MODELS_URL)
      .then((payload) => ({ models: extractFreeModels(payload) }))
      .catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
    fetchText(OLLAMA_LIBRARY_URL)
      .then((html) => ({ models: extractOllamaModels(html) }))
      .catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
  ]);

  const report = buildReport({ openrouter, ollama });
  process.stdout.write(report);
  if (outFile) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outFile, report);
    console.error(`\n[discovery] report written to ${outFile}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[discovery] failed:', err);
    process.exit(1);
  });
}
