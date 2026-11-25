#!/usr/bin/env node
/**
 * Bangla voice smoke test — the CORRECT request contract.
 *
 * Two mistakes caused every earlier attempt to fail with a misleading error:
 *
 *  1. `POST /api/voice/conversations` does not exist. That route is GET-only
 *     (it lists conversations), so POST returns 405 and an empty body — which
 *     is why `await res.json()` threw "Unexpected end of JSON input". A call
 *     is opened with `POST /api/voice/calls`, not `/conversations`.
 *
 *  2. `/api/voice/calls` requires the fields `from` and `to`. Sending
 *     `agentId`/`fromNumber`/`toNumber` fails validation with
 *     400 `{"error":"Invalid request: \"from\" is required"}`.
 *
 * A third detail matters for the AI greeting: the conversation only opens when
 * the call carries `voiceAgentId` AND `agentType: "ai"`, and the opening
 * greeting is produced by the `answer` action, not by call creation.
 * See src/app/api/voice/calls/route.ts (POST and PATCH).
 *
 * Usage:
 *   node scripts/voice-smoke-test.mjs
 *   BASE=http://127.0.0.1:3011 EMAIL=... PASSWORD=... node scripts/voice-smoke-test.mjs
 */

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const EMAIL = process.env.EMAIL ?? 'admin@alolabs.net';
const PASSWORD = process.env.PASSWORD ?? '';
const TEST_CALLER = process.env.TEST_CALLER ?? '+8801700000001';
const TEST_DESTINATION = process.env.TEST_DESTINATION ?? '+8809600000001';

if (!PASSWORD) {
  console.error('Set PASSWORD (and EMAIL if not the default admin) before running.');
  process.exit(2);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function fail(step, response, body) {
  console.error(`\n✗ ${step} — HTTP ${response.status}`);
  console.error(typeof body === 'string' ? body : JSON.stringify(body).slice(0, 600));
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const loginBody = await readJson(login);
if (!login.ok) fail('login', login, loginBody);
const token = loginBody.token ?? loginBody.data?.token;
if (!token) fail('login', login, 'no token in response');

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  Cookie: `token=${token}; auth_token=${token}`,
};
console.log(`✓ login (${EMAIL})`);

const agentsRes = await fetch(`${BASE}/api/voice/agents`, { headers });
const agentsBody = await readJson(agentsRes);
if (!agentsRes.ok) fail('GET /api/voice/agents', agentsRes, agentsBody);
const agents = Array.isArray(agentsBody) ? agentsBody : agentsBody.agents ?? agentsBody.data ?? [];
if (agents.length === 0) fail('GET /api/voice/agents', agentsRes, 'no voice agents provisioned');
const agent = agents.find((candidate) => candidate.status === 'active') ?? agents[0];
console.log(`✓ agents: ${agents.length} found; using "${agent.name}" (${agent.id}, status=${agent.status})`);

// `from` / `to` are the required field names. `voiceAgentId` + `agentType: 'ai'`
// are what make the AI conversation open on answer.
const callRes = await fetch(`${BASE}/api/voice/calls`, {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': `smoke-${Date.now()}` },
  body: JSON.stringify({
    from: TEST_CALLER,
    to: agent.phoneNumber ?? TEST_DESTINATION,
    direction: 'inbound',
    voiceAgentId: agent.id,
    agentType: 'ai',
  }),
});
const callBody = await readJson(callRes);
if (!callRes.ok) fail('POST /api/voice/calls', callRes, callBody);
const callId = callBody.data?.id ?? callBody.id;
if (!callId) fail('POST /api/voice/calls', callRes, callBody);
console.log(`✓ call opened: ${callId} (simulated=${callBody.data?.simulated ?? 'n/a'})`);
if (callBody.notice) console.log(`  note: ${callBody.notice}`);

const answerRes = await fetch(`${BASE}/api/voice/calls`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ callId, action: 'answer', detectedLanguage: 'bn' }),
});
const answerBody = await readJson(answerRes);
if (!answerRes.ok) fail('PATCH answer', answerRes, answerBody);
console.log(`✓ answered; conversationOpened=${answerBody.data?.conversationOpened ?? false}`);
if (answerBody.data?.greeting) console.log(`  greeting (${answerBody.data.language ?? 'bn'}): ${answerBody.data.greeting}`);

const turnRes = await fetch(`${BASE}/api/voice/conversations/turn`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ callSessionId: callId, utterance: 'আমি ভিসা নিয়ে জানতে চাই।', bargeIn: false }),
});
const turnBody = await readJson(turnRes);
if (!turnRes.ok) fail('POST /api/voice/conversations/turn', turnRes, turnBody);
const reply = turnBody.data?.reply ?? turnBody.data?.agentReply ?? turnBody.data;
console.log(`✓ turn accepted: ${typeof reply === 'string' ? reply.slice(0, 300) : JSON.stringify(reply).slice(0, 300)}`);

const endRes = await fetch(`${BASE}/api/voice/calls`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ callId, action: 'end', finalState: 'completed', reason: 'smoke test' }),
});
const endBody = await readJson(endRes);
if (!endRes.ok) fail('PATCH end', endRes, endBody);
console.log('✓ call ended');

console.log('\nVoice call path works end to end against this deployment.');
console.log('Note: a 503 AI_DEFERRED on the turn means no authorized inference route');
console.log('resolved — check OLLAMA_BASE_URL / LOCAL_INFERENCE_URL, not the voice API.');
