# Bangla Voice Model Evaluation and Speech Platform Plan

**Status:** Phase 0 research and evaluation protocol — no model downloaded, installed, or run
**Date:** 2026-10-31
**Primary target:** Bangladeshi Bangla (`bn-BD`), with English, Hindi, Arabic, and Bangla-English code-switching as separately tested capabilities.

## 1. Executive finding

“Multilingual” is not evidence of acceptable Bangladeshi Bangla. The repository contains voice UI, queued job records, media request contracts, and subtitle helpers, but **no verified local TTS/ASR engine, Bangla voice artifact, native-speaker evaluation, or measured speech latency**. The governed media path intentionally defers generation, and direct transcription calls are disabled.

The most defensible local-first evaluation shortlist is:

- **TTS:** AI4Bharat Indic Parler-TTS and the pinned `vits_rasa_13` model as Bengali candidates; Piper as an engine for a separately licensed, authorized Bangla voice; Kokoro as an English/Hindi comparator, not a Bangla solution.
- **ASR:** faster-whisper with carefully pinned Whisper checkpoints; AI4Bharat IndicConformer Bengali/multilingual models; SimulStreaming as an incremental Whisper policy candidate.
- **VAD:** Silero VAD as a candidate, with telephone-audio and double-talk tests.
- **Diarization:** prefer call-leg speaker labels first. Evaluate pyannote-style diarization separately; do not equate anonymous speaker labels with verified identity.
- **Cloning:** deferred until model rights and voice-owner consent are both resolved. IndicF5 is a research candidate, not cleared for commercial deployment.

No candidate is approved for production by this document. If none passes native Bangla review, the product must not claim human-like or production-quality Bangla speech. The fallback is a funded licensed-voice/custom-model effort or an explicitly approved external provider—not a silent downgrade.

Owner-supplied studio projects such as Voicebox and VoiceStudio are recorded in [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md). They are **product/workflow candidates, not speech-model approvals**: their code licenses, bundled model weights, voice-cloning rights, Bangla quality, latency, and AGPL/commercial terms must be evaluated separately before any integration.

## 2. Evidence and license separation

Every speech artifact has up to five separate rights questions:

1. Inference/training **code** license.
2. Model **weights/checkpoint** license and acceptable-use terms.
3. Training-data rights and attribution.
4. Individual **voice/speaker** rights and consent.
5. Rights and restrictions on **generated output**.

A permissive GitHub license does not clear a downloaded checkpoint. A model card does not prove that every speaker consented to commercial cloning. A consent checkbox does not prove ownership. Record the exact artifact revision, file hashes, license text, source URL, reviewer, and permitted use before enabling a model.

### 2.1 TTS candidates

| Candidate | Bangla evidence | License/rights finding | Role and limitations | Decision |
|---|---|---|---|---|
| AI4Bharat **Indic Parler-TTS** | Official model-card metadata includes `bn`, `en`, and `hi`; prompt-guided speech | Card declares Apache-2.0; verify the exact checkpoint, access conditions, dependencies, and speaker rights. Arabic is not established by this card | Large multilingual candidate; recommended voice prompts are not arbitrary identity cloning; streaming/latency must be measured | **Priority Bengali evaluation** [2](https://huggingface.co/ai4bharat/indic-parler-tts/blob/main/README.md) |
| AI4Bharat **vits_rasa_13** | Card includes Bengali and other Indian languages | Pinned card declares **CC-BY-4.0**, not the Apache-2.0 claimed by some third-party summaries; verify attribution and underlying Rasa speaker/data rights | VITS candidate for preset voices; Hindi/Arabic and bn-BD naturalness are not established | **Priority lightweight comparison; license review first** [1](https://huggingface.co/ai4bharat/vits_rasa_13/blob/6b321492f11569009343f767be179c385fec0c55/README.md) |
| **Piper** (`OHF-Voice/piper1-gpl`) | Current official voice list reviewed does **not** include Bengali/bn-BD | Engine GPL-3.0; each voice has its own MODEL_CARD. Upstream README is seeking maintainers | Efficient ONNX engine; no verified ready-made Bangla voice in the reviewed list. A custom authorized Bangla voice requires a separate training/evaluation project | **Engine candidate only; not “Bangla supported” today** [source](https://github.com/OHF-Voice/piper1-gpl/blob/057093803be0aa53153abc9d5be9ea4ddec378f8/docs/VOICES.md) |
| **Kokoro** | Reviewed language codes include English/Hindi, not Bengali or Arabic | Code Apache-2.0; upstream describes Apache-licensed weights, but pin the exact artifact | Useful comparator and possible English/Hindi voice; not a Bangla/Arabic answer | **Non-Bangla comparator only** [source](https://github.com/hexgrad/kokoro) |
| **MMS Bengali** (`facebook/mms-tts-ben`) | Explicit Bengali checkpoint | Official card: **CC-BY-NC-4.0** | Noncommercial model; not cleared for a paid SaaS | **Exclude from commercial shortlist** [1](https://huggingface.co/facebook/mms-tts-ben) |
| **Coqui XTTS-v2** | Upstream docs list supported languages without Bengali; toolkit has Bangla text helpers, which are not a trained Bangla voice | Toolkit MPL-2.0; model catalog labels weights CPML. CPML is a noncommercial license; consent does not override it | Cloning/multilingual research candidate, not a Bangla commercial baseline | **Exclude from commercial Bangla baseline** [code/catalog](https://github.com/coqui-ai/TTS/blob/dev/TTS/.models.json), [license explanation](https://www.promptquorum.com/power-local-llm/xtts-v2-review) |
| **Idiap Coqui TTS fork** | Actively maintained fork; includes Bangla G2P helpers | Code MPL-2.0; does not relicense XTTS or other checkpoints | Possible toolkit for separately cleared models | **Evaluate toolkit, not automatic model approval** [source](https://github.com/idiap/coqui-ai-TTS) |
| **IndicF5** | Upstream lists Bengali and reference-audio-guided synthesis | GitHub license detection was absent; an open upstream issue questions base-weight/data provenance and commercial use. Do not rely on an ungated mirror's license label | Potential authorized reference-voice candidate after written clarification | **HOLD pending provenance/license resolution** [source](https://github.com/AI4Bharat/IndicF5), [issue #35](https://github.com/AI4Bharat/IndicF5/issues/35) |
| **Custom licensed VITS/Piper voice** | Can target bn-BD directly | Requires commissioned speaker contracts, corpus rights, training-code review, and model/output terms | Best long-term control over pronunciation and voice identity, but adds data/training cost | **Fallback/strategic track after pilot evidence** |

The original `rhasspy/piper` repository is archived; do not select it as the maintained engine merely because older tutorials reference it. The newer Piper engine's GPL obligations must be reviewed for the chosen distribution/service model. Isolating inference behind a service boundary is an operational choice, not a legal exemption.

### 2.2 ASR, VAD, and diarization candidates

| Candidate | Evidence | Streaming/quality boundary | License/decision |
|---|---|---|---|
| **Whisper + faster-whisper** | Whisper includes Bengali in its multilingual language set; faster-whisper is an optimized inference implementation | Offline model; partial captions require VAD/chunking or an incremental policy. Bangla WER, dialect robustness and code-switching are unmeasured | Code/Whisper weights described as MIT upstream; pin checkpoint and verify. **Baseline batch + incremental evaluation** [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| **IndicConformer Bengali/multilingual** | Upstream lists Bengali (`bn`) and releases CTC/RNNT models | Repository describes recognition, not a guaranteed low-latency streaming server. Streaming/cache behavior must be proven for the exact model | Repository/model cards reviewed declare MIT; verify artifact and NeMo dependencies. **Priority Indic comparison** [1](https://github.com/AI4Bharat/IndicConformerASR) |
| **SimulStreaming** | Upstream describes incremental processing of originally offline Whisper models | Incremental policy, not proof of native streaming or Bangla accuracy; compare stabilization delay and revisions | Current README says MIT, while an older release is labeled noncommercial. **Pin a reviewed MIT revision; do not use “latest” blindly** [1](https://github.com/ufal/SimulStreaming), [4](https://github.com/ufal/SimulStreaming/releases) |
| **WhisperStreaming** | Local-agreement incremental transcription | Upstream says it is being superseded by SimulStreaming | Comparator only unless a specific backend advantage is demonstrated [2](https://github.com/ufal/whisper_streaming) |
| **Silero VAD** | Local speech activity detection | Telephone noise, backchannels, music and double-talk need calibration | Actual repository LICENSE is MIT despite a confusing README badge; pin and review. **Candidate, not a turn-taking policy** [source](https://github.com/snakers4/silero-vad) |
| **pyannote-audio** | Speaker diarization toolkit | Offline/online behavior and pretrained pipeline terms differ; noisy two-party calls still need evaluation | Code MIT; checkpoint access/terms are separate. **Optional after consent and license review** [source](https://github.com/pyannote/pyannote-audio) |
| Hosted multilingual ASR/TTS | May provide useful quality/latency fallback | External audio transfer, cost, residency, retention and country support must be verified | **Optional explicit tenant/provider opt-in only; never mandatory for core operation** |

Indian-language Bengali training data may not represent Bangladeshi pronunciation, vocabulary, or code-switching. Report India/Bangladesh cohort results separately where known; do not hide a bn-BD failure inside an aggregate “Bengali” score.

## 3. Local versus external capability map

| Capability | Local/self-hosted path | External dependency or approval |
|---|---|---|
| Batch Bangla TTS | Approved model + isolated inference worker + FFmpeg export | Model/voice rights; suitable hardware |
| Streaming TTS | Chunk/generation-aware worker and paced telephony playout | Must measure first-audio latency; no claim yet |
| Voice design | Supported synthetic presets/style prompts and pronunciation controls | No impersonation; model-specific controls only |
| Authorized cloning | Cleared model + consent/identity workflow + private voice artifacts | Speaker rights, model commercial terms, counsel approval |
| Batch/live ASR | Whisper/Conformer candidates, VAD, incremental policy | Native evaluation; hardware; microphone/telephone consent |
| Audio enhancement/segmentation | Separate optional audio workers | Model licenses and quality tests; never block core PBX on creative tools |
| Subtitles/transcripts | Existing SRT/VTT helpers can be reused after tests | Real timestamps/corrections; no fabricated transcript |
| Speaker labels | Call-leg metadata or diarization output | Biometric identification requires a separate lawful/consent analysis |
| Real telephone audio | Local PBX can route internal SIP tests | PSTN still requires authorized carrier connectivity |
| Long-form/batch studio | Durable jobs + object storage | Quotas, retention, copyright/voice permissions |

## 4. Evaluation corpus: authorized Bangladeshi Bangla

### 4.1 Pilot composition (proposed, not collected)

Start with **24 adult speakers and at least 600 original utterances** (about 25 per speaker), expanding only after the protocol works. Aim for balanced self-reported female/male representation and include other gender identities voluntarily without forcing disclosure. Recruit native Bangladeshi speakers across Dhaka and several regional backgrounds, including Chattogram, Sylhet, Rajshahi/Khulna and northern/rural speakers where feasible. Do not treat a region label as a reliable dialect annotation.

Collect both clean microphone audio and telephone-path audio. Create noisy/codec variants from authorized clean recordings, but count them as derived conditions—not additional independent speakers. Keep speaker identity disjoint between development and final test sets. If a model is later fine-tuned, use a speaker-disjoint train/dev/test split and a locked, never-trained-on final test set.

Suggested coverage:

| Dimension | Minimum pilot coverage |
|---|---|
| Language | Standard Bangladeshi Bangla; natural Bangla-English code-switching; separate English/Hindi/Arabic sets |
| Utterance length | Short commands, medium dialogue turns, long 30–90 second passages |
| Prosody | Statements, questions, lists, corrections, polite requests, complaints |
| Business content | Support, appointments, orders, lead qualification, banking-neutral payment questions, policy exceptions |
| Hard tokens | Names, addresses, phone digits, dates, times, currency, decimals, product/SKU codes, URLs |
| Regional variation | Vocabulary/pronunciation notes from speakers; no caricature or forced accent |
| Acoustic conditions | Clean, moderate noise, difficult noise; narrowband and wideband; different devices/rooms |
| Dialogue conditions | Interruptions, backchannels, overlapping speech, hesitation, speaker changes |

Public corpora such as Mozilla Common Voice Bengali may supplement evaluation only after license, speaker-use terms, and overlap/contamination checks. They do not replace the bn-BD test set. Never use customer calls or uploaded voice samples for evaluation/training without a compatible lawful basis and explicit purpose.

### 4.2 Original script examples

These are scripts to record, **not existing audio or test results**:

- “আপনার অর্ডারটি কি আজ বিকেলের মধ্যে পৌঁছে গেছে?”
- “আমি একজন মানুষের সাথে কথা বলতে চাই।”
- “আগামী মঙ্গলবার সকাল সাড়ে দশটায় একটি appointment বুক করতে চাই।”
- “মোট বিল ১,২৫০ টাকা, নাকি ১,২০৫ টাকা?”
- “আমার ফোন নম্বরের শেষ চার ডিজিট শূন্য, সাত, দুই, নয়।”
- “Please call me back after ৫টা, কিন্তু আজ রাত নয়।”
- “ধানমন্ডি ২৭ নম্বর রোডের ঠিকানায় ডেলিভারি দিতে পারবেন?”
- “এই সেবার শর্তগুলো আমাকে সহজ বাংলায় বুঝিয়ে বলুন।”

A linguist should review scripts for natural Bangladeshi usage, Bengali/Arabic numerals, currency spoken forms, honorifics, and code-switch conventions before recording.

### 4.3 Consent and data handling

Provide Bangla and English information sheets. Separate consent for:

- Recording and research evaluation.
- Storage duration and named processors/locations.
- Model fine-tuning, if any.
- Voice synthesis or cloning, if any.
- Public sample publication, if any.

Consent to transcribe is **not** consent to clone. Record speaker ID, consent version, purpose, signature/verification method, date, expiry, compensation, withdrawal channel, and permitted derivatives. Use pseudonymous IDs in evaluation files; keep identity/consent records access-controlled. Pay speakers/reviewers fairly; do not collect children's voices in the initial pilot.

Store immutable original audio plus a documented processing chain. Hash files, record sample rate/channels/device/codec, and preserve raw transcripts. Restrict access to the evaluation team; encrypt storage and backups. Withdrawal must disable future use and trigger the documented deletion/derived-artifact process, subject to any legally required retention.

## 5. Text normalization and scoring

Bangla evaluation must not silently “fix” model errors through inconsistent normalization.

- Preserve raw text and a versioned normalized form.
- Use Unicode NFC consistently; document treatment of ZWJ/ZWNJ, hasanta, vowel signs, punctuation, and Bengali/Latin digits.
- Define spoken-form expansion for currency, dates, times, phone numbers, addresses, and abbreviations.
- Tokenize Bangla and English consistently; score code-switch spans separately.
- Keep proper names and business terms in a reviewed lexicon, not an ad-hoc replacement list that masks errors.
- Publish the normalization script/version and allow reviewers to inspect raw differences.

ASR metrics:

- `WER = (substitutions + deletions + insertions) / reference words`.
- `CER = (character substitutions + deletions + insertions) / reference characters`.
- Entity exact-match/error rate for numbers, currency, dates, phone digits, addresses and names.
- Code-switch span error rate and language-confusion rate.
- Insertion/hallucination rate on silence/noise-only clips.
- Endpoint delay, partial-hypothesis revision rate, final-transcript delay, real-time factor.
- Results by speaker, gender cohort, region, noise/SNR, codec, utterance length and language condition.

Report confidence intervals using speaker-aware bootstrap or an equivalent method; thousands of augmented clips from one speaker are not thousands of independent samples. Confidence values from a model are not automatically calibrated probabilities.

## 6. Native-speaker TTS evaluation

Use randomized, blinded playback. Hide model/provider names and normalize loudness without clipping. Include natural reference recordings only where rights permit. At least three native Bangladeshi reviewers should rate each core sample; reviewers must not be the speaker being cloned.

Score on documented 1–5 scales:

1. Intelligibility.
2. Pronunciation accuracy.
3. Naturalness/prosody, including question intonation.
4. Conversational suitability and pacing.
5. Overall preference in pairwise comparisons.

Also run a blind transcription task: listeners type what they heard, and WER/entity errors measure intelligibility. Log mispronounced words, skipped/added words, robotic joins, unnatural pauses, digit/currency errors, and code-switch failures. “Human-like” is prohibited marketing language unless a justified, reviewed claim is supported by evidence; even then prefer precise measured descriptions.

Synthetic style labels such as “warm” or “calm” describe the requested rendering. They are not evidence of the speaker's or listener's actual emotional state.

### 6.1 Proposed release thresholds — owner must ratify

These are **targets, not achieved results**:

| Metric | Proposed pilot threshold |
|---|---|
| Intelligibility MOS | Mean ≥ 4.2/5; no critical cohort below 3.8 |
| Naturalness MOS | Mean ≥ 4.0/5; review cohort gaps > 0.5 |
| Blind-listener transcription | Critical entity error ≤ 1%; overall WER ≤ 5% on core clean scripts |
| Pronunciation | No systematic failure on approved business lexicon, digits, currency or dates |
| Code-switching | No dropped English content; reviewed acceptability ≥ 90% on core mixed scripts |
| ASR clean bn-BD | Provisional WER ≤ 12%, CER ≤ 6%; owner may revise after baseline |
| ASR difficult/noisy/code-switch | Report separately; provisional WER ≤ 25%, critical entity error ≤ 5% |
| TTS responsiveness | p95 first audio chunk ≤ 500 ms on the selected pilot hardware; sustained real-time playback |
| Conversation | p95 customer-end-of-speech to first audible response ≤ 2.0 s, including barge-in tests |
| Safety | Zero unapproved voice identities, fabricated business facts, or concealed recording in acceptance tests |

A high average cannot override a critical number/currency error or a failing cohort. Arabic, Hindi and English require their own native review before being advertised. If thresholds are not met, label the capability experimental/unavailable and keep production calling on approved human/PBX flows.

## 7. Benchmark procedure and report contract

No benchmark was run in Phase 0. The current sandbox has 2 visible CPUs, about 3.8 GiB RAM and no observed GPU; it is not the target speech host.

For each candidate:

1. Record code commit, model revision, file hashes, license, voice rights, dependency lock, container digest and hardware.
2. Verify the artifact can be obtained through the approved network/storage process. Do not download weights during Phase 0.
3. Run a small smoke set, then the locked evaluation set. No test-set tuning.
4. Measure cold start and warm inference separately; state precision/quantization and batch size.
5. Test one stream, then ramp concurrency while recording latency, RTF, throughput, CPU/RAM/GPU/VRAM, disk/network, errors and audio dropouts.
6. Replay identical telephone codecs/noise conditions across candidates.
7. Measure end-to-end conversation latency, not just isolated model latency.
8. Run interruption, silence, noisy input, long text, mixed scripts, provider/model timeout and worker restart cases.
9. Have native reviewers score blinded outputs and inspect failures.
10. Publish a signed decision: approved use, restrictions, hardware envelope, known failure modes, fallback, and next review date.

Report template fields left intentionally unknown:

```text
Candidate / exact revision / hashes: NOT RUN
Code / weights / voice / output rights: PENDING REVIEW
Hardware and OS: NOT SELECTED
bn-BD ASR WER / CER: NOT MEASURED
Code-switch entity error: NOT MEASURED
TTS MOS / blind transcription WER: NOT MEASURED
First-audio p50 / p95 / p99: NOT MEASURED
End-to-end turn latency: NOT MEASURED
Sustainable concurrent streams: NOT MEASURED
Native reviewer panel / disagreement: NOT CONVENED
Decision: NOT APPROVED FOR PRODUCTION
```

## 8. Studio and voice-library design after evaluation

### 8.1 Real controls, not decorative sliders

- Language/accent and voice: only verified artifacts.
- Speed/pitch: native model control where supported; otherwise documented post-processing with quality review.
- Pauses: text segmentation or supported SSML; do not advertise universal SSML.
- Stability/expressiveness/emotion: expose only for models that actually implement them.
- Pronunciation dictionary: tenant-scoped, versioned, reviewed entries with examples and audit; never global cross-tenant leakage.
- Output: WAV PCM, MP3 and web-appropriate compressed formats through a tested FFmpeg pipeline; telephone narrowband export is a separate transcode.
- Long form: sentence-aware chunking, continuity checks, bounded joins, retries and durable batch jobs.
- Streaming: first-chunk events, cancellation, generation IDs and backpressure.

### 8.2 Voice design and authorized cloning

Voice design creates a synthetic, authorized voice configuration; it must not target a real person's identity deceptively. Cloning requires:

- Verified voice owner and authority to grant the requested rights.
- A live consent phrase or equivalent verification where appropriate, plus identity checks proportionate to risk.
- Explicit scope: synthesis vs training, commercial use, languages, territories, duration, sublicensing, and public examples.
- Consent record/version, revocation endpoint/process, access permissions, and usage audit.
- Private reference audio and derived embeddings/models; no cross-tenant reuse.
- Revocation that disables new generation and handles derived artifacts, cached audio, backups and legal holds transparently.
- Abuse/complaint handling, rate limits, impersonation checks and provenance metadata.

A watermark or C2PA-style metadata can support provenance but is not proof that misuse is impossible. Disclose AI speech in calls according to the approved policy and applicable law.

## 9. Implementation gates

- **Phase 1:** tenant-bound speech job/asset contracts, consent/provenance schema, quotas, audit, provider capability registry; no fake model activation.
- **Phase 3A:** authorized corpus and license review; batch TTS/ASR benchmarks and native review.
- **Phase 3B:** studio/library, pronunciation controls, real exports, correction workflow; streaming only after measured latency.
- **Phase 3C:** cloning only after separate rights/consent/security approval; otherwise remain disabled.
- **Phase 4:** integrate approved speech with telephone media, barge-in and human handoff.
- **Phase 7:** repeat evaluation on production-like hardware/telephone paths, failure/soak tests, privacy and backup-restore checks.

**Stop condition:** no production Bangla voice claim, automated Bangla calling, or cloning release without the evidence above and explicit owner approval. See [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) and [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md).
