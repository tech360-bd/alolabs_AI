# Bangla speech engine (TTS)

How this project produces **real Bangla audio**, what it actually sounds like,
and what it cannot do. Read the honest-limitations section before making any
quality claim in a demo, a proposal, or a customer conversation.

---

## What is deployed

| Piece | Location |
| --- | --- |
| Engine | `scripts/bangla-tts-sidecar.py` — espeak-ng (bundled with `piper-tts`) over HTTP |
| Setup | `bash scripts/setup-bangla-tts.sh` |
| Adapter | `src/lib/voice/speech-adapters/http-engine.ts` (existing `piper` contract) |
| Config | `VOICE_TTS_PROVIDER=piper`, `VOICE_TTS_BASE_URL`, `VOICE_TTS_LANGUAGES=bn-BD`, `VOICE_TTS_VOICE=bn` |
| Tests | `__tests__/lib/voice/audio-concat.test.ts`, `__tests__/lib/voice/speech-health-liveness.test.ts`, `__tests__/api/storage-file-download.test.ts` |

The sidecar needs **one** dependency (`piper-tts`), no API key, and no network
access at runtime. It serves both adapter contracts, so switching to a hosted
provider later is an env change, not a code change:

```
POST {base}?text=...        -> audio/wav      (contract: piper)
POST {base}/audio/speech    -> JSON body      (contract: openai)
GET  {base}                 -> health JSON    (piper probe)
GET  {base}/models          -> health JSON    (openai probe)
```

## Getting it running

```bash
bash scripts/setup-bangla-tts.sh          # installs + verifies, fails loudly
PYTHONPATH=./.tts-venv python3 scripts/bangla-tts-sidecar.py --port 8880
```

Then in `.env`:

```bash
VOICE_TTS_PROVIDER=piper
VOICE_TTS_BASE_URL=http://127.0.0.1:8880
VOICE_TTS_LANGUAGES=bn-BD
VOICE_TTS_VOICE=bn
```

Verify the app agrees — this is the only claim that matters:

```bash
curl -s localhost:3011/api/voice/health   # speech.tts.available must be true
```

## Honest quality statement

espeak-ng is a **formant synthesiser**, not a neural model.

**It does:** pronounce Bangla correctly from the real Bengali dictionary
(`ঢাকা` → `ɖʰˈaka`), read Bengali numerals and the taka sign, handle mixed
Bangla/English text, run offline in milliseconds, and cost nothing.

**It does not:** sound human. It is robotic, with flat prosody and no emotional
range. It is right for IVR prompts, order/amount read-outs, dev and CI, and as a
fallback when a better engine is down. It is **not** right for customer-facing
marketing audio, and it must not be described as natural or human-like.

## Why not a neural Bangla voice?

Every neural Bangla option needs weights that are not obtainable in every
environment. This was investigated, not assumed:

| Option | Blocker |
| --- | --- |
| Piper `.onnx` voices | Piper's 51 supported locales **do not include Bangla** — there is no Bangla voice to download |
| Silero `v3_indic` (`bengali_male`/`bengali_female`) | Weights served from `models.silero.ai`, unreachable from this environment |
| sherpa-onnx VITS | **No Bengali assets exist** in its GitHub releases; weights live on Hugging Face |

What *was* available is the espeak-ng engine and Bengali dictionary that ship
inside the `piper-tts` wheel — so that is what this project uses, honestly
labelled.

**To upgrade later:** re-point `VOICE_TTS_PROVIDER=openai` +
`VOICE_TTS_BASE_URL` at a hosted Bangla TTS endpoint. Nothing else changes.

## Bugs this work fixed

These were found by running the engine end to end, not by reading code.

1. **Multi-chunk WAVs were corrupted.** Long text is split into sentences and
   synthesised separately. The parts were byte-concatenated, so the file's
   header declared the first sentence's length while 4× more audio followed —
   players played sentence one and stopped. It reported `status: completed`,
   `simulated: false`, and real audio, so nothing looked wrong. Fixed in
   `src/lib/voice/audio-concat.ts`: one RIFF header, correct lengths,
   mismatched sample rates rejected instead of silently mixed.

2. **Reported duration was an estimate, not the truth.** A 5.6 s file was
   recorded as 5.8 s from a `bytes / 48 000` guess (the engine runs at
   22 050 Hz). The merged WAV is now measured, so the stored duration matches
   the audio.

3. **Health was a one-shot boot probe.** Killing the engine left
   `/api/voice/health` reporting `available: true` forever — the dashboard
   claimed a capability that no longer existed. Now re-probed (throttled, 10 s)
   so it follows reality in both directions.

4. **Engine failures were unreadable.** A dead engine surfaced Node's bare
   `fetch failed`, with the real cause (`ECONNREFUSED …:8880`) hidden in
   `err.cause`. The error now names the URL and the cause.

5. **Audio could not play in the browser.** The storage route served every
   file as `application/octet-stream` + `attachment`. Audio and video now
   stream `inline` with their recorded type. The upload-security rule is
   unchanged: HTML/SVG still force a download with `nosniff`.

## Regression coverage

- `audio-concat.test.ts` (14) — header integrity, duration summing, and refusal
  to mix sample rates.
- `speech-health-liveness.test.ts` (8) — health follows the engine down and back
  up against a **real socket**; errors name the URL and cause; zero-byte audio
  is rejected; content type follows the bytes.
- `storage-file-download.test.ts` (7) — audio/video inline; HTML/SVG still
  download; a `.mp3`-named HTML upload is still not inlined.

## Operational notes

- The sidecar binds `127.0.0.1` by default. Do not expose it publicly: it has no
  authentication and will synthesise any text it is sent.
- Text over 4 000 characters is **refused** (HTTP 413), not truncated —
  silent truncation would deliver a partial message as if it were complete.
- Requesting a voice the engine lacks fails at startup with the list of Bengali
  voices that *are* present, instead of silently falling back to English.
