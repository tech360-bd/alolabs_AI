/**
 * Bangla voice evaluation harness (docs/BANGLA_VOICE_MODEL_EVALUATION.md §6–7).
 *
 * WHY THIS EXISTS
 * ---------------
 * The platform is forbidden from claiming Bangla speech quality it has not
 * measured. The `VoiceBenchmark` table stores raw evidence; this module turns a
 * corpus run into those rows AND applies the release gates from the evaluation
 * plan so a report can say "passes / fails / not measured" mechanically instead
 * of by opinion.
 *
 * HONESTY RULES ENCODED HERE
 * ---------------------------
 * - WER/CER are always derived from reference vs hypothesis text. A caller
 *   cannot supply a pre-computed number.
 * - MOS / naturalness / intelligibility require a named human reviewer, because
 *   they are subjective native-speaker judgements. Without a reviewer the value
 *   is dropped, never defaulted.
 * - A missing measurement stays missing. `null` in the report means "not
 *   measured", which is different from a failing score, and the report states
 *   that explicitly.
 * - A high mean can never override a critical failure (the plan's §6.1 rule).
 */

import { characterErrorRate, wordErrorRate } from './subtitles';

export type EvalTask = 'tts' | 'asr';
export type AudioProfile = 'clean' | 'noisy' | 'telephone' | 'code_switched';

export interface CorpusSample {
  /** Stable id from the corpus manifest; used for the DB unique-ish row. */
  sampleId: string;
  /** Human-authored reference sentence (never machine-generated). */
  referenceText: string;
  /** What the engine actually produced / transcribed. */
  hypothesisText: string;
  audioProfile?: AudioProfile;
  /** Measured wall-clock latency for this sample, ms. Omit when not measured. */
  latencyMs?: number;
}

export interface ReviewerScores {
  /** MUST be a real person who listened to the sample. */
  reviewerName: string;
  mos?: number;
  naturalness?: number;
  intelligibility?: number;
  notes?: string;
}

export interface EvalRow {
  engine: string;
  engineVersion?: string;
  language: string;
  task: EvalTask;
  sampleId: string;
  audioProfile: AudioProfile;
  referenceText: string;
  hypothesisText: string;
  wer: number;
  cer: number;
  latencyMs: number | null;
  reviewerName: string | null;
  mos: number | null;
  naturalness: number | null;
  intelligibility: number | null;
  notes: string | null;
}

const MOS_MIN = 1;
const MOS_MAX = 5;

function clampMos(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < MOS_MIN || value > MOS_MAX) return null;
  return value;
}

/**
 * Build one benchmark row. Review scores are only attached when a reviewer is
 * named; `reviewerScores` is ignored entirely otherwise (so an unattributed
 * score can never enter the database pretending to be a native-speaker result).
 */
export function buildEvalRow(input: {
  engine: string;
  engineVersion?: string;
  language: string;
  task: EvalTask;
  sample: CorpusSample;
  reviewer?: ReviewerScores;
}): EvalRow {
  const { sample, reviewer } = input;
  const reference = sample.referenceText.trim();
  const hypothesis = sample.hypothesisText.trim();
  if (!reference) throw new Error(`sample ${sample.sampleId}: referenceText is required`);

  const reviewerName = reviewer?.reviewerName?.trim() || null;

  return {
    engine: input.engine,
    engineVersion: input.engineVersion ?? undefined,
    language: input.language,
    task: input.task,
    sampleId: sample.sampleId,
    audioProfile: sample.audioProfile ?? 'clean',
    referenceText: reference,
    hypothesisText: hypothesis,
    // Computed, never client-supplied.
    wer: Math.round(wordErrorRate(reference, hypothesis) * 10_000) / 10_000,
    cer: Math.round(characterErrorRate(reference, hypothesis) * 10_000) / 10_000,
    latencyMs:
      typeof sample.latencyMs === 'number' && sample.latencyMs >= 0
        ? Math.round(sample.latencyMs)
        : null,
    reviewerName,
    mos: reviewerName ? clampMos(reviewer?.mos) : null,
    naturalness: reviewerName ? clampMos(reviewer?.naturalness) : null,
    intelligibility: reviewerName ? clampMos(reviewer?.intelligibility) : null,
    notes: reviewerName ? reviewer?.notes?.trim() || null : null,
  };
}

// ─── Release gates (docs/BANGLA_VOICE_MODEL_EVALUATION.md §6.1) ──────────────

export interface GateThresholds {
  intelligibilityMos: number;
  naturalnessMos: number;
  cleanWer: number;
  cleanCer: number;
  difficultWer: number;
  firstAudioP95Ms: number;
}

/** Proposed pilot thresholds. The owner must ratify these before they bind. */
export const PROPOSED_THRESHOLDS: GateThresholds = {
  intelligibilityMos: 4.2,
  naturalnessMos: 4.0,
  cleanWer: 0.12,
  cleanCer: 0.06,
  difficultWer: 0.25,
  firstAudioP95Ms: 500,
};

export type GateVerdict = 'pass' | 'fail' | 'not_measured';

export interface GateResult {
  key: string;
  label: string;
  verdict: GateVerdict;
  observed: number | null;
  threshold: number;
  unit: string;
  samples: number;
  /**
   * False when the corpus contained no samples in this gate's scope (e.g. no
   * noisy/telephone audio at all). Such a gate stays `not_measured`; it never
   * counts as a pass, and the report names it as an unevaluated condition.
   */
  applicable: boolean;
  detail?: string;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function lowerIsBetter(
  key: string,
  label: string,
  observed: number | null,
  threshold: number,
  unit: string,
  samples: number,
  applicable: boolean,
): GateResult {
  return {
    key,
    label,
    verdict: observed === null ? 'not_measured' : observed <= threshold ? 'pass' : 'fail',
    observed,
    threshold,
    unit,
    samples,
    applicable,
  };
}

function higherIsBetter(
  key: string,
  label: string,
  observed: number | null,
  threshold: number,
  unit: string,
  samples: number,
  applicable: boolean,
): GateResult {
  return {
    key,
    label,
    verdict: observed === null ? 'not_measured' : observed >= threshold ? 'pass' : 'fail',
    observed,
    threshold,
    unit,
    samples,
    applicable,
  };
}

export interface GateReport {
  thresholds: GateThresholds;
  gates: GateResult[];
  overall: 'pass' | 'fail' | 'incomplete';
  /** Plain-language statement of what the report does and does not prove. */
  summary: string;
  /** Samples that must block release regardless of averages. */
  criticalFailures: string[];
}

/**
 * Evaluate a set of rows against the release gates.
 *
 * `criticalFailures` implements the plan's override rule: a number/currency
 * error means the sample is unusable even when the corpus average looks good.
 * Detection is deliberately conservative — it flags a sample whose reference
 * contains digits/currency and whose hypothesis does not reproduce them.
 */
export function evaluateGates(rows: EvalRow[], thresholds: GateThresholds = PROPOSED_THRESHOLDS): GateReport {
  const asr = rows.filter((r) => r.task === 'asr');
  const tts = rows.filter((r) => r.task === 'tts');
  const cleanAsr = asr.filter((r) => r.audioProfile === 'clean');
  const hardAsr = asr.filter((r) => r.audioProfile !== 'clean');

  const gates: GateResult[] = [
    higherIsBetter(
      'tts.intelligibility',
      'TTS intelligibility MOS',
      mean(tts.map((r) => r.intelligibility).filter((v): v is number => typeof v === 'number')),
      thresholds.intelligibilityMos,
      'MOS 1–5',
      tts.length,
      tts.length > 0,
    ),
    higherIsBetter(
      'tts.naturalness',
      'TTS naturalness MOS',
      mean(tts.map((r) => r.naturalness).filter((v): v is number => typeof v === 'number')),
      thresholds.naturalnessMos,
      'MOS 1–5',
      tts.length,
      tts.length > 0,
    ),
    lowerIsBetter(
      'asr.clean.wer',
      'ASR WER (clean bn-BD)',
      mean(cleanAsr.map((r) => r.wer)),
      thresholds.cleanWer,
      'ratio',
      cleanAsr.length,
      cleanAsr.length > 0,
    ),
    lowerIsBetter(
      'asr.clean.cer',
      'ASR CER (clean bn-BD)',
      mean(cleanAsr.map((r) => r.cer)),
      thresholds.cleanCer,
      'ratio',
      cleanAsr.length,
      cleanAsr.length > 0,
    ),
    lowerIsBetter(
      'asr.difficult.wer',
      'ASR WER (noisy / telephone / code-switch)',
      mean(hardAsr.map((r) => r.wer)),
      thresholds.difficultWer,
      'ratio',
      hardAsr.length,
      hardAsr.length > 0,
    ),
    lowerIsBetter(
      'tts.firstAudioP95',
      'TTS first-audio p95',
      percentile(
        tts.map((r) => r.latencyMs).filter((v): v is number => typeof v === 'number'),
        95,
      ),
      thresholds.firstAudioP95Ms,
      'ms',
      tts.filter((r) => typeof r.latencyMs === 'number').length,
      tts.length > 0,
    ),
  ];

  const criticalFailures = detectCriticalEntityFailures(rows);

  const applicable = gates.filter((g) => g.applicable);
  const unscoped = gates.filter((g) => !g.applicable);

  // A 'pass' verdict means the WHOLE plan was measured and met. A gate that the
  // corpus never exercised is not a pass, so any not-measured gate makes the
  // run 'incomplete' — that is what stops a narrow corpus from being read as a
  // release approval.
  const anyFail = gates.some((g) => g.verdict === 'fail') || criticalFailures.length > 0;
  const allPass = gates.length > 0 && gates.every((g) => g.verdict === 'pass');
  const overall: GateReport['overall'] =
    rows.length === 0 || gates.length === 0 ? 'incomplete' : anyFail ? 'fail' : allPass ? 'pass' : 'incomplete';

  const measured = applicable.filter((g) => g.verdict !== 'not_measured').length;
  const unscopedNote =
    unscoped.length > 0
      ? ` Not covered by this corpus: ${unscoped.map((g) => g.label).join('; ')} — those conditions remain unevaluated.`
      : '';

  const summary =
    overall === 'pass'
      ? `All ${applicable.length} applicable gates met on ${rows.length} samples. This permits the documented pilot use only; it is not a production approval.${unscopedNote}`
      : overall === 'fail'
        ? `${applicable.filter((g) => g.verdict === 'fail').length} gate(s) failed` +
          (criticalFailures.length ? ` and ${criticalFailures.length} critical number/currency failure(s) were found` : '') +
          `. Do NOT advertise this engine as meeting the pilot bar.${unscopedNote}`
        : applicable.length === 0
          ? `No gate is applicable: the corpus contains no ${rows.length === 0 ? 'samples' : 'samples for any scored condition'}. Nothing was measured.`
          : `${measured}/${applicable.length} applicable gates measured; ${gates.length - measured} of ${gates.length} plan gates are still NOT MEASURED. Missing measurements are not passes.${unscopedNote}`;

  return { thresholds, gates, overall, summary, criticalFailures };
}

const DIGIT_RE = /[0-9\u09E6-\u09EF]/;
/**
 * Currency markers split into symbols/codes and unit words. A unit word can
 * survive while the amount it labelled is dropped ("৳৪৫০ টাকা" → "টাকা"), so
 * the number check catches the value loss and this check only reports a fully
 * vanished currency expression.
 */
const CURRENCY_MARKER_RE = /(৳|Tk|TK|USD|EUR|\$|€)/;
const CURRENCY_UNIT_RE = /(taka|টাকা|টাকার|Din|BDT)/;
const CURRENCY_RE = new RegExp(`${CURRENCY_MARKER_RE.source}|${CURRENCY_UNIT_RE.source}`);

/**
 * Flag samples where the reference carries a number or currency amount and the
 * hypothesis does not reproduce it. Numbers and money are the highest-risk
 * speech content in a contact centre, so they override averages.
 */
export function detectCriticalEntityFailures(rows: EvalRow[]): string[] {
  const failures: string[] = [];
  for (const row of rows) {
    const refHasNumber = DIGIT_RE.test(row.referenceText);
    const refHasCurrency = CURRENCY_RE.test(row.referenceText);
    if (!refHasNumber && !refHasCurrency) continue;

    const hyp = row.hypothesisText;
    const numberLost = refHasNumber && !DIGIT_RE.test(hyp);
    const currencyLost = refHasCurrency && !CURRENCY_RE.test(hyp);
    if (numberLost) failures.push(`${row.engine}/${row.sampleId}: number missing from output`);
    if (currencyLost) failures.push(`${row.engine}/${row.sampleId}: currency missing from output`);
  }
  return failures;
}
