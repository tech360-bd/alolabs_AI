import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractFreeModels, extractOllamaModels, buildReport } from '../../scripts/model-discovery.mjs';

const model = (id, prompt, completion) => ({ id, pricing: { prompt, completion } });

test('only explicit zero prompt and completion prices qualify', () => {
  const rows = [
    model('valid', '0.000', '0'),
    model('numeric', 0, 0),
    model('scientific', '0e-9', '0.0'),
    model('missing', null, null),
    { id: 'no-pricing' },
    model('empty', '', ' '),
    model('bad', 'garbage', '0'),
    model('tiny', '1e-999', '0'),
    model('paid', '0', '0.0001'),
    model('contradictory:free', '0.1', '0'),
    model('unverified:free', null, null),
  ];
  assert.deepEqual(extractFreeModels({ data: rows }).map((m) => m.id), ['numeric', 'scientific', 'valid']);
});

test('report makes the human review and pricing boundaries explicit', () => {
  const models = extractFreeModels({ data: [model('example', '0', '0')] });
  const report = buildReport({ openrouter: { models }, ollama: { models: extractOllamaModels('<a href="/library/llama3">x</a>') } });
  assert.match(report, /does not establish an open-source licence/);
  assert.match(report, /Other modalities and fees may have separate charges/);
  assert.match(report, /Human review checklist/);
  assert.match(report, /`example`/);
  assert.match(report, /\[llama3\]\(https:\/\/ollama\.com\/library\/llama3\)/);
});

test('source failures remain visible and do not suppress review policy', () => {
  const report = buildReport({ openrouter: { error: 'unavailable' }, ollama: { error: 'unavailable' } });
  assert.match(report, /OpenRouter free lanes — FETCH FAILED/);
  assert.match(report, /Ollama library — FETCH FAILED/);
  assert.match(report, /Human review checklist/);
});
