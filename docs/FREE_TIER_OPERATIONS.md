# Running ALO Labs at zero marginal cost

Source list: [free-for.dev](https://free-for.dev) (open source, MIT, 1600+ contributors).
This document records **which entries actually apply to this repository**, what
they can do, and — more importantly — what they cannot.

Regenerate the live list at any time:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3011/api/free-resources?usable=1"
```

Or open **Voice & Contact Center → Usage, Billing & API → “Run it at zero
marginal cost.”**

## 1. What was actually integrated

The catalogue lives in `src/lib/free-resources.ts`; it is data, not a vendor
integration. Adding an entry does **not** enable anything.

| Capability | Free option | How it plugs in | Status |
|---|---|---|---|
| Bangla TTS | Piper, Coqui XTTS, Kokoro-FastAPI | `VOICE_TTS_PROVIDER=piper\|openai` + `VOICE_TTS_BASE_URL` | Adapter exists; **no engine deployed here** |
| Bangla ASR | Faster-Whisper-Server | `VOICE_ASR_PROVIDER=openai` + `VOICE_ASR_BASE_URL` | Adapter exists; **no engine deployed here** |
| LLM inference | Groq, Gemini, Cerebras, SambaNova, NVIDIA NIM, Cloudflare, GitHub Models, Hugging Face, Ollama | `AI_PROVIDER_PRESETS` + `AIProviderConfig` | Working path for 9 vendors |
| Storage | MinIO, Supabase, B2 | S3-compatible adapter | MinIO self-hosted path works |
| Hosting / DB / CI / email / monitoring | Fly.io, Render, Neon, GitHub Actions, Brevo, Resend, Grafana, Sentry | operational, not code | See caveats in the API response |

## 2. What cannot be free (stated plainly)

- **PSTN telephony.** Twilio is listed with `free: 'no-free-tier'` on purpose.
  Real inbound/outbound calls cost money per minute and require regulatory
  compliance in Bangladesh. A free carrier does not exist. The provider adapter
  is replaceable, but the minutes are not free.
- **Bangla speech quality.** No free tier grants a tested bn-BD voice. Piper and
  Whisper are free *to run*; whether they produce acceptable Bangla must be
  measured with native speakers and
  `scripts/run-voice-benchmark.ts` before any claim is made.
- **Call concurrency.** Unmeasured on this hardware (2 vCPU / 3.8 GiB). Do not
  quote a simultaneous-call number.

## 3. What was fixed while integrating this

The free-for.dev review exposed a **real configuration bug**, now fixed and
covered by tests:

`freeProviderSpecsFromEnvironment()` has auto-registered **SambaNova** and
**NVIDIA NIM** from `SAMBANOVA_API_KEY` / `NVIDIA_API_KEY` for some time, and
`.env.example` advertises both. But neither vendor had an entry in
`AI_PROVIDER_PRESETS`, so `defaultProviderBaseUrl()` returned `undefined` and
the Super Admin AI Control Plane **could not select a provider the runtime
already supported**. Both presets are now present, host-allowlisted for their
documentation URLs, and the test
`__tests__/unit/lib/ai-provider-catalog.test.ts` asserts that *every* env-driven
free provider resolves a preset and base URL.

## 4. Auto-connection — what the owner asked for, and what is true

> "once connected, our agent will automatically complete all necessary work —
>  just like with other paid AI providers"

The product **does** auto-detect a provider once its credential exists in the
environment: `providersFromEnvironment()` registers it, the router routes to it,
and the Super Admin console lists it. That behaviour is real and tested.

What it does **not** do — and must not claim:

- It cannot create an account for you, accept a vendor's terms, or obtain an
  API key. Browsing to `free-for.dev` and following a link is something a human
  (or this agent, inside the workspace) does; the running server cannot.
- It cannot bypass `FREE_ONLY_MODE` or the AI provider verification workflow
  that requires a human-verified `AIProviderVerification` row before a vendor is
  treated as free.
- It cannot turn a quota tier into a price guarantee. Quotas are tracked by
  `free-tier-quota-tracker`; a vendor may change them without notice.

## 5. Connecting a provider (the actual steps)

```bash
# 1. Put the credential in .env (never commit it)
echo 'GROQ_API_KEY=gsk_...' >> .env

# 2. Register it (Super Admin) or let auto-detection pick it up on restart
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"provider":"groq","name":"Groq free tier"}' \
     http://localhost:3011/api/super-admin/ai/providers

# 3. Verify live behaviour
curl -H "Authorization: Bearer $TOKEN" http://localhost:3011/api/free-resources?usable=1
```

For self-hosted speech, the equivalent is:

```bash
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu
echo 'VOICE_TTS_PROVIDER=openai'        >> .env
echo 'VOICE_TTS_BASE_URL=http://127.0.0.1:8880/v1' >> .env
echo 'VOICE_TTS_MODEL=kokoro'           >> .env
echo 'VOICE_TTS_LANGUAGES=bn-BD'        >> .env
```

Then confirm the engine is genuinely reachable before trusting it:
`GET /api/voice/health` must report `available: true`. Until it does, TTS jobs
fail with `no_speech_provider_configured` and **no audio is fabricated**.

## 6. Verification checklist before any production claim

- [ ] `/api/voice/health` shows the intended engine as `available: true`
- [ ] `scripts/run-voice-benchmark.ts --dry-run` meets the gates in
      `docs/BANGLA_VOICE_MODEL_EVALUATION.md` with a native-speaker panel
- [ ] Free allowances re-read from each vendor page (they change)
- [ ] Data-processing terms reviewed for every hosted vendor that sees customer
      text or audio — several free tiers reserve the right to use inputs for
      product improvement
- [ ] Telephony priced and compliance-checked with a real carrier
