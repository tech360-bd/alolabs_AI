# Server session findings: 503 AI_DEFERRED, voice calls, and a git risk

Three separate things were tangled together in that session. They have different
causes and different statuses, so they are separated here.

---

## 1. Your integration suite passed — that part is confirmed

```
Test Files  19 passed | 1 skipped (20)
     Tests  136 passed | 15 skipped (151)
```

With `env -i HOME=... PATH=... NODE_ENV=test`, which is exactly the fix from the
previous turn. The 15 skips are `mysql-compatibility` waiting for
`MYSQL_TEST_URL`. Nothing to do here.

---

## 2. The 503 `AI_DEFERRED` had a real code cause — now fixed

**Symptom**

```
Live Agent Run HTTP Status: 503
{"success":false,"error":{"code":"AI_DEFERRED",
 "message":"AI execution deferred (AUTHORIZED_ROUTE_FAILED): Authorized
 local/free routes could not complete the request. No paid fallback was attempted."}}
```

**Root cause: a URL-suffix bug, not a policy refusal.** Your `.env` had

```
OLLAMA_BASE_URL=http://localhost:11434/v1
```

`OllamaProvider` speaks Ollama's *native* API and appends `/api/tags` and
`/api/chat` to the endpoint it is given. `normaliseOllamaEndpoint` only added a
missing scheme, so the provider requested:

```
http://localhost:11434/v1/api/tags     ← 404 on a stock Ollama
```

`initialize()` then threw `Ollama is not reachable at http://localhost:11434/v1`
— the exact line in your log. Because the provider never joined the registry,
`prepareCompanyRequest` found no authorized route, and the router **correctly**
deferred rather than billing. The endpoint was right; only the appended suffix
was wrong. Free-only mode was working as designed.

**Fix** (`7627729`): strip a trailing `/v1` and trailing slashes, so both
spellings resolve to the same API root. Deeper paths are preserved so a proxied
prefix (`http://host:11434/ollama`) still works.

`model-tiers.ts` duplicated the same normalisation inline for its local-vs-external
trust check and is fixed alongside it. Had only one been fixed, the provider
would have registered but been filtered out of routing as "external" — the same
outage with a different message.

**Verification** — a real HTTP server speaking the Ollama protocol, not a mock:

```
endpoint -> http://localhost:11434
models discovered: [ 'llama3.2:1b' ]
✓ 1 passed
```

8 new tests, of which **4 fail without the fix**.

**What you need to do:** nothing. `OLLAMA_BASE_URL=.../v1` now works as written.
Keeping it is fine. If you'd rather be explicit, `http://localhost:11434` also
works.

> Note: your Ollama also listens on `127.0.0.1:11434` only. That is fine for an
> app on the same host, but if the Next server ever moves off that machine (or
> into a container) it will need `OLLAMA_HOST=0.0.0.0`.

---

## 3. The voice call failures were the wrong request, not a broken feature

Two procedural mistakes, both of which read like product bugs:

| Attempt | What happened | Why |
|---|---|---|
| `POST /api/voice/conversations` | **405**, then `Unexpected end of JSON input` | That route is **GET-only** (it lists conversations). The 405 body is empty, so `res.json()` throws. |
| `POST /api/voice/calls` | **400** `"from" is required` | The contract needs `from` and `to`. The script sent `agentId`/`fromNumber`/`toNumber`. |

There is also a flow subtlety: the AI greeting does **not** come from call
creation. It comes from the `answer` action, and only when the call carries
`voiceAgentId` **and** `agentType: "ai"`.

Correct sequence (`scripts/voice-smoke-test.mjs` implements all of it):

```bash
PASSWORD='<admin password>' node scripts/voice-smoke-test.mjs
```

1. `POST /api/auth/login` → token
2. `GET /api/voice/agents` → pick an **active** agent
3. `POST /api/voice/calls` with `{from, to, direction, voiceAgentId, agentType:"ai"}`
4. `PATCH /api/voice/calls` with `{callId, action:"answer", detectedLanguage:"bn"}` → greeting
5. `POST /api/voice/conversations/turn` with `{callSessionId, utterance}`
6. `PATCH /api/voice/calls` with `{callId, action:"end", finalState:"completed"}`

**Status, stated precisely:** the script is syntax-checked but **was not executed
end to end against your deployment** — this environment has no seeded admin
account, so login returns 401 here. I am not claiming the voice path is proven
on your machine; I am claiming the two errors you hit are a wrong method and a
wrong payload, both read directly from the route source. Running the script once
will settle it in a few seconds.

Also worth knowing: your `bundles` of agents came back `status: "draft"`. A
draft agent has no phone number and cannot open a conversation, so activate it
first (your PATCH to `active` already did this for the Bangla agent).

---

## 4. A git accident waiting to happen — fixed

You created `services/engineering-worker/.venv`. `.gitignore` covered only
`.tts-venv/`, so that venv was **untracked but committable**: one `git add -A`
would have committed tens of thousands of third-party files (aider, litellm,
scipy, numpy, …) into the repository.

Verified before the fix:

```
git check-ignore -v --no-index services/engineering-worker/.venv/lib/x.py
→ NOT IGNORED -> would be committed
```

Fixed in `541e2cc` by adding `.venv/`, `*/.venv/`, `**/.venv/`, `venv/`,
`*/venv/`. Verified after:

```
.gitignore:115:**/.venv/   services/engineering-worker/.venv/lib/probe.py
```

Two related cautions from the same session:

- `pip install aider-chat` backtracked through ~40 releases because it pins
  `pydantic`, `litellm` and `openai` to exact versions that fight
  `fastapi`/`langgraph`. It eventually resolved, but pin the direct
  dependencies if you script this. `openhands-ai` did not install.
- `nginx -t` failed on the **system** config (`/etc/nginx/ssl/alaminn.info.pem`
  is root-only) and on `sudo -u postgres` (`could not change directory`).
  Neither is about your new `deploy/nginx-central-platform.conf` — that file
  passed a user-scoped test: *"syntax is ok / test is successful"*.

---

## Repo state

- PR [#57](https://github.com/tech360-bd/alolabs_AI/pull/57) — open, mergeable, **CI 4/4 green**
- Commits added this session: `7627729` (Ollama fix), `541e2cc` (gitignore + smoke test), `4b13c7d` (test typecheck cast)
- Full suite: **211 files / 2326 tests passing**, 15 skipped
