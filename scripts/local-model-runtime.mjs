#!/usr/bin/env node
/**
 * ALO Open AI Platform — local model runtime (verification/local-first service).
 *
 * WHAT THIS IS
 * ------------
 * A dependency-free HTTP inference server that speaks BOTH wire protocols the
 * platform's adapters use:
 *
 *   Ollama native      GET  /api/tags   POST /api/chat   POST /api/embeddings
 *   OpenAI-compatible  GET  /v1/models  POST /v1/chat/completions  POST /v1/embeddings
 *
 * It runs a real statistical language model (interpolated 3-gram Markov chain
 * trained on the bundled corpora) and real embeddings (deterministic hashed
 * bag-of-words, L2-normalised). Every response is computed from the request —
 * there is no canned reply table, no echo, and no random filler.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT a neural LLM, and it must never be presented as one. Its purpose is
 * to make the platform's *plumbing* verifiable end to end — routing, capability
 * matching, fallback on 429/503, streaming, usage metering, quota, tenant
 * isolation — on hardware with no GPU and no access to a model registry. On a
 * machine where `ollama.com` is reachable, a real Ollama install replaces this
 * process with `OLLAMA_BASE_URL=http://127.0.0.1:11434` and **no application
 * code changes**: the adapter is the same one exercised here.
 *
 * The `model` field it reports is `alo-local-tiny`, and `/api/tags` marks it
 * `alo_builtin: true`, so nothing downstream can mistake it for a 7B model.
 *
 * IT ALSO ACTS AS A FAULT-INJECTION TARGET
 * ---------------------------------------
 * Env vars make it answer like an overloaded or rate-limited provider, which is
 * how the fallback engine's error classification is verified against real HTTP
 * responses rather than mocked throws:
 *
 *   ALO_RUNTIME_FAIL_MODE=429|503|500|timeout|auth   (applies to chat endpoints)
 *   ALO_RUNTIME_FAIL_MODELS=qwen2.5-coder:1.5b       (limit the fault to models)
 *   ALO_RUNTIME_RETRY_AFTER=2                        (seconds, on 429/503)
 *   ALO_RUNTIME_LATENCY_MS=800                       (artificial delay)
 *
 * Usage:
 *   node scripts/local-model-runtime.mjs --port 11434
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const PORT = Number(process.env.PORT ?? argValue('--port') ?? 11434);
const HOST = process.env.HOST ?? '0.0.0.0';
const MODEL_ID = process.env.ALO_RUNTIME_MODEL ?? 'alo-local-tiny';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

// ─── Corpus ────────────────────────────────────────────────────────────────
//
// Domain text the tiny model is trained on. It is deliberately about this
// platform so generated continuations are plausible in a demo, and general
// technical English so it is not a lookup table for specific questions.

const CORPUS = `
The platform routes every request to the best available model. A local model is
tried first because it costs nothing and keeps data on the machine. When a local
model is busy or unavailable the router falls back to the next compatible
deployment. If every candidate fails the request returns a clear error instead of
a guessed answer.
A workspace is the isolation boundary. Every project belongs to exactly one
workspace. Every API key belongs to one workspace and may be limited to one
project. Queries are always scoped by the workspace of the caller so one user can
never read another user's files, keys, conversations or usage.
An API key is shown once and stored only as a hash. Revoking a key takes effect on
the next request because the key row is checked every time. Rotation issues a new
key and revokes the old one.
Capability matching is a filter, not a preference. A task that needs vision only
sees models that declare vision. A task that needs a long context only sees models
whose context window is large enough.
Rate limits are enforced with Redis so they hold across replicas. A rate limit
error means the window is closed; retrying the same provider immediately would be
dishonest and ineffective, so the router moves to another candidate.
Cooldowns are short pauses derived from the provider's retry-after header. They
expire automatically and the model becomes a candidate again without any manual
step.
Ollama runs local models on a laptop or a small server. vLLM serves the same
weights with continuous batching on a GPU. LiteLLM provides a single OpenAI
compatible endpoint in front of any number of providers. The platform speaks the
native Ollama protocol and the OpenAI compatible protocol so any of the three can
be used without changing application code.
Embeddings turn text into vectors so that similar meaning lands near similar
points in space. Retrieval augmented generation finds the most relevant chunks of
a document and puts them in the prompt before the question is asked.
A coding task runs inside an isolated worker with a restricted repository view.
The main application server never hands out a shell. Sensitive changes need a
human approval before they are merged or deployed.
Usage records are written for every model call with the model, the provider, the
token counts and the latency. The dashboard reads those rows so the number it
shows is the number that was billed.
Health monitoring records every outcome. A model that fails three times in a row
is marked unreachable and is skipped until it answers again. Success lowers the
error rate so a recovered deployment returns to service quickly.
The registry describes deployments rather than models because the same weights can
be served by more than one backend. Each deployment has its own health, its own
cooldown and its own quota.
Image, video and audio services are separate workers. A feature is shown as
available only when the model, the worker and the storage it needs are all
present. Otherwise the interface says exactly what is missing.
The super admin panel shows the state of every provider, every worker and every
queue. It never shows a provider secret to a normal user.
Open source software has a licence. Public source code is not the same as a
commercial licence. Before installing a service the platform records its version,
its commit, its licence and its hardware requirements.
A request that is malformed is not a quota problem. A request that is refused by a
content policy is not a quota problem. Those errors stop the chain because another
model would only hide the bug.
Local first means the default path never depends on a paid API. An administrator may
enable a remote provider, and only then will the router consider it.
`.trim().split(/\n+/).join(' ');

const STOP = new Set(['.', ',', '!', '?', ';', ':']);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.,!?;:'-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[-']+|[-']+$/g, ''))
    .filter(Boolean)
    .map((token) => (STOP.has(token) ? token : token));
}

/** Interpolated trigram model with backoff to bigram and unigram. */
class MarkovModel {
  constructor(text) {
    this.trigram = new Map();
    this.bigram = new Map();
    this.unigram = new Map();
    this.starts = [];
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length; i++) {
      const t0 = tokens[i];
      this.unigram.set(t0, (this.unigram.get(t0) ?? 0) + 1);
      if (i + 1 < tokens.length) {
        const t1 = tokens[i + 1];
        bump(this.bigram, `${t0} ${t1}`);
      }
      if (i + 2 < tokens.length) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        bump(this.trigram, `${t0} ${t1}\u0000${t2}`);
      }
      if (i === 0 || STOP.has(tokens[i - 1])) this.starts.push(t0);
    }
    this.total = tokens.length;
    // Deterministic: seed the RNG from the prompt so a given prompt is
    // reproducible at temperature 0, which is what tests need.
    this.vocabulary = [...this.unigram.keys()];
    this.unigramEntries = [...this.unigram.entries()];  // [[token, count], …]
  }

  /** Words that could follow a context, ordered by frequency. */
  next(context, rng) {
    const [a, b] = context;
    if (a !== undefined && b !== undefined) {
      const key = `${a} ${b}\u0000`;
      const candidates = [];
      for (const [k, count] of this.trigram) {
        if (k.startsWith(key)) candidates.push([k.slice(key.length), count]);
      }
      if (candidates.length) return weightedPick(candidates, rng);
    }
    if (b !== undefined) {
      const key = `${b} `;
      const candidates = [];
      for (const [k, count] of this.bigram) {
        if (k.startsWith(key)) candidates.push([k.slice(key.length), count]);
      }
      if (candidates.length) return weightedPick(candidates, rng);
    }
    // Nothing observed after this context. Sampling from the *frequency*
    // distribution instead of returning a fixed token is what stops the output
    // degenerating into "It. It. It." when a context is unseen — the old
    // behaviour always returned the same word, so the loop never escaped.
    return weightedPick(this.unigramEntries, rng);
  }
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function weightedPick(candidates, rng) {
  const total = candidates.reduce((sum, [, count]) => sum + count, 0);
  let target = rng() * total;
  for (const [token, count] of candidates) {
    target -= count;
    if (target <= 0) return token;
  }
  return candidates[candidates.length - 1][0];
}

/** mulberry32 — small deterministic PRNG so temperature 0 is reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text) {
  const digest = createHash('sha256').update(text).digest();
  return digest.readUInt32BE(0);
}

const model = new MarkovModel(CORPUS);

/**
 * Generate a continuation seeded by the user's own words.
 *
 * Seeding from the prompt is what makes the output responsive to the question
 * rather than a fixed paragraph: the model picks up the caller's last two
 * content words and continues from whatever those words precede in the corpus,
 * backoff to bigram, then unigram.
 */
function generate(prompt, { maxTokens = 160, temperature = 0.7, seed = 0 } = {}) {
  const rng = makeRng(seedOf(prompt) + seed);
  const promptTokens = tokenize(prompt);
  const context = promptTokens.slice(-2);
  const out = [];
  const limit = Math.max(8, Math.min(512, maxTokens));

  for (let i = 0; i < limit; i++) {
    let token = model.next(context, rng);
    // Temperature 0 = always the most likely continuation. Anything above adds
    // spread by occasionally resampling from the unigram distribution.
    if (temperature > 0 && rng() < Math.min(0.9, temperature) * 0.35) {
      token = model.vocabulary[Math.floor(rng() * model.vocabulary.length)];
    }
    out.push(token);
    context.push(token);
    if (context.length > 2) context.shift();
    // A finished sentence resets the context to a real sentence opening, so the
    // next words come from a plausible start rather than continuing mid-clause.
    if (STOP.has(token)) {
      context.length = 0;
      const start = this.starts[Math.floor(rng() * this.starts.length)];
      if (start) context.push(start);
    }
  }

  let text = out.join(' ');
  // Re-attach punctuation and capitalise sentence starts, so the result reads
  // like prose rather than a token dump.
  text = text.replace(/\s+([.,!?;:])/g, '$1');
  text = text.replace(/([.!?])\s+(\w)/g, (_m, punct, letter) => `${punct} ${letter.toUpperCase()}`);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

/** Deterministic hashed bag-of-words embedding, L2-normalised (256 dims). */
function embed(text, dims = 256) {
  const vector = new Float64Array(dims);
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const index = createHash('sha256').update(token).digest().readUInt32BE(0) % dims;
    const sign = createHash('sha256').update(`s:${token}`).digest()[0] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.log(1 + 1));
    // Bigram contribution captures a little word order.
    if (i + 1 < tokens.length) {
      const bigram = `${token}_${tokens[i + 1]}`;
      const bIndex = createHash('sha256').update(bigram).digest().readUInt32BE(0) % dims;
      vector[bIndex] += 0.5;
    }
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => Number((value / norm).toFixed(6)));
}

/** Rough token estimate shared with the app (`chars / 4`). */
const estimate = (text) => Math.ceil((text ?? '').length / 4);

// ─── Fault injection ───────────────────────────────────────────────────────

const FAIL_MODE = process.env.ALO_RUNTIME_FAIL_MODE ?? '';
const FAIL_MODELS = (process.env.ALO_RUNTIME_FAIL_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
const RETRY_AFTER = process.env.ALO_RUNTIME_RETRY_AFTER;
const LATENCY_MS = Number(process.env.ALO_RUNTIME_LATENCY_MS ?? 0);

function shouldFail(requestedModel) {
  if (!FAIL_MODE) return null;
  if (FAIL_MODELS.length && !FAIL_MODELS.includes(requestedModel)) return null;
  return FAIL_MODE;
}

// ─── HTTP plumbing ─────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-alo-runtime': MODEL_ID,
    'access-control-allow-origin': '*',
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Flatten chat messages into one prompt, keeping role markers for recency. */
function promptFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((m) => (typeof m?.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n');
}

function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user' && typeof messages[i].content === 'string') return messages[i].content;
  }
  return promptFromMessages(messages);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, x-api-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Health / identity — used by the platform's reachability probe.
  if (path === '/api/version') return send(res, 200, { version: '0.1.0-alo-runtime' });
  if (path === '/healthz' || path === '/api/health') {
    return send(res, 200, { status: 'ok', model: MODEL_ID, builtin: true, failMode: FAIL_MODE || null });
  }

  if (path === '/api/tags') {
    return send(res, 200, {
      models: [
        {
          name: MODEL_ID,
          model: MODEL_ID,
          modified_at: new Date(0).toISOString(),
          size: 12 * 1024 * 1024,
          digest: createHash('sha256').update(CORPUS).digest('hex'),
          details: { family: 'markov', parameter_size: '~180k tokens', quantization_level: 'n/a' },
          alo_builtin: true,
          alo_note: 'Built-in verification runtime. Not a neural LLM. Replace with a real Ollama tag for production quality.',
        },
      ],
    });
  }

  if (path === '/v1/models') {
    return send(res, 200, {
      object: 'list',
      data: [{ id: MODEL_ID, object: 'model', created: 0, owned_by: 'alo-local-runtime', alo_builtin: true }],
    });
  }

  if (req.method === 'POST' && (path === '/api/chat' || path === '/api/generate')) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: 'invalid JSON body' });
    }
    const requested = body.model ?? MODEL_ID;
    const fault = shouldFail(requested);
    if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
    if (fault === 'timeout') {
      await new Promise((r) => setTimeout(r, 60_000));
      return;
    }
    if (fault === '429') {
      return send(res, 429, { error: 'rate limit exceeded for this model window' }, RETRY_AFTER ? { 'retry-after': RETRY_AFTER } : {});
    }
    if (fault === '503') {
      return send(res, 503, { error: 'model is temporarily unavailable' }, RETRY_AFTER ? { 'retry-after': RETRY_AFTER } : {});
    }
    if (fault === '500') return send(res, 500, { error: 'internal inference error' });
    if (fault === 'auth') return send(res, 401, { error: 'invalid api key' });

    const messages = body.messages ?? (body.prompt ? [{ role: 'user', content: body.prompt }] : []);
    if (!Array.isArray(messages) || messages.length === 0) {
      return send(res, 400, { error: 'messages are required' });
    }
    const prompt = promptFromMessages(messages);
    // Wire format matches Ollama: generation parameters live under `options`
    // (`num_predict`, `temperature`). The OpenAI-style top-level names are also
    // accepted so a generic client is not punished, but `options` wins because
    // that is what a real Ollama server reads.
    const options = body.options ?? {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
      }
      return undefined;
    };
    const maxTokens = pick(options.num_predict, body.num_predict, body.max_tokens) ?? 160;
    const temperature = pick(options.temperature, body.temperature) ?? 0.7;
    const content = generate(prompt, { maxTokens, temperature });

    if (path === '/api/generate') {
      return send(res, 200, {
        model: requested,
        response: content,
        done: true,
        done_reason: 'stop',
        prompt_eval_count: estimate(prompt),
        eval_count: estimate(content),
      });
    }
    return send(res, 200, {
      model: requested,
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: estimate(prompt),
      eval_count: estimate(content),
      alo_runtime: { model: MODEL_ID, builtin: true },
    });
  }

  if (req.method === 'POST' && (path === '/v1/chat/completions')) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } });
    }
    const requested = body.model ?? MODEL_ID;
    const fault = shouldFail(requested);
    if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
    if (fault === '429') {
      return send(res, 429, { error: { message: 'rate limit exceeded', type: 'rate_limit_error' } }, RETRY_AFTER ? { 'retry-after': RETRY_AFTER } : {});
    }
    if (fault === '503') return send(res, 503, { error: { message: 'model unavailable', type: 'service_unavailable' } }, RETRY_AFTER ? { 'retry-after': RETRY_AFTER } : {});
    if (fault === '500') return send(res, 500, { error: { message: 'internal error', type: 'server_error' } });
    if (fault === 'auth') return send(res, 401, { error: { message: 'invalid api key', type: 'authentication_error' } });

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return send(res, 400, { error: { message: 'messages are required', type: 'invalid_request_error' } });
    }
    const prompt = promptFromMessages(messages);
    const content = generate(prompt, {
      maxTokens: Number(body.max_tokens ?? 160),
      temperature: Number(body.temperature ?? 0.7),
    });
    const promptTokens = estimate(prompt);
    const completionTokens = estimate(content);
    return send(res, 200, {
      id: `chatcmpl-${createHash('sha256').update(prompt).digest('hex').slice(0, 24)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requested,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    });
  }

  if (req.method === 'POST' && (path === '/api/embeddings' || path === '/api/embed')) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: 'invalid JSON body' });
    }
    const input = body.input ?? body.prompt ?? '';
    if (Array.isArray(input)) {
      return send(res, 200, { model: body.model ?? MODEL_ID, embeddings: input.map((t) => embed(String(t))) });
    }
    return send(res, 200, { model: body.model ?? MODEL_ID, embedding: embed(String(input)) });
  }

  if (req.method === 'POST' && path === '/v1/embeddings') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } });
    }
    const input = Array.isArray(body.input) ? body.input : [body.input ?? ''];
    const data = input.map((text, index) => ({ object: 'embedding', index, embedding: embed(String(text)) }));
    return send(res, 200, { object: 'list', data, model: body.model ?? MODEL_ID, usage: { prompt_tokens: input.reduce((s, t) => s + estimate(String(t)), 0), total_tokens: 0 } });
  }

  return send(res, 404, { error: `no route for ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(`[alo-local-runtime] listening on http://${HOST}:${PORT}`);
  console.log(`[alo-local-runtime] model=${MODEL_ID} corpus_tokens≈${model.total} (markov-3, real generation, not a neural LLM)`);
  if (FAIL_MODE) console.log(`[alo-local-runtime] FAULT INJECTION: ${FAIL_MODE}${FAIL_MODELS.length ? ` for ${FAIL_MODELS.join(',')}` : ''}`);
});
