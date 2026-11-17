import { describe, expect, it } from 'vitest';
import {
  PROPOSED_THRESHOLDS,
  buildEvalRow,
  detectCriticalEntityFailures,
  evaluateGates,
  type EvalRow,
} from '@/lib/voice/eval-harness';
import { wordErrorRate } from '@/lib/voice/subtitles';

const base = {
  engine: 'piper-bn',
  language: 'bn-BD',
  task: 'asr' as const,
};

function row(
  overrides: Partial<EvalRow> & Pick<EvalRow, 'sampleId' | 'referenceText' | 'hypothesisText'>,
): EvalRow {
  const { sampleId, referenceText, hypothesisText, audioProfile, ...rest } = overrides;
  return {
    ...buildEvalRow({
      ...base,
      sample: { sampleId, referenceText, hypothesisText, audioProfile },
    }),
    ...rest,
  };
}

describe('Bangla voice evaluation harness', () => {
  describe('row construction', () => {
    it('computes WER/CER from the texts instead of trusting a caller-supplied number', () => {
      const built = buildEvalRow({
        ...base,
        // A caller cannot pass wer/cer; they are not part of the input shape.
        sample: { sampleId: 's1', referenceText: 'আমার নাম রহিম', hypothesisText: 'আমার নাম করিম' },
      });
      expect(built.wer).toBeCloseTo(wordErrorRate('আমার নাম রহিম', 'আমার নাম করিম'), 4);
      expect(built.wer).toBeGreaterThan(0);
      expect(built.cer).toBeGreaterThan(0);
      expect(built.cer).toBeLessThanOrEqual(1);
    });

    it('gives a perfect score only for an exact match', () => {
      const built = buildEvalRow({
        ...base,
        sample: { sampleId: 's2', referenceText: 'ঢাকা থেকে চট্টগ্রাম', hypothesisText: 'ঢাকা থেকে চট্টগ্রাম' },
      });
      expect(built.wer).toBe(0);
      expect(built.cer).toBe(0);
    });

    it('refuses a sample with no reference text rather than scoring an empty baseline', () => {
      expect(() =>
        buildEvalRow({ ...base, sample: { sampleId: 's3', referenceText: '   ', hypothesisText: 'কিছু' } }),
      ).toThrow(/referenceText is required/);
    });

    it('drops subjective scores when no reviewer is named', () => {
      const built = buildEvalRow({
        ...base,
        task: 'tts',
        sample: { sampleId: 's4', referenceText: 'স্বাগতম', hypothesisText: 'স্বাগতম' },
        // Scores provided but unattributed — must be discarded.
        reviewer: { reviewerName: '  ', mos: 4.8, naturalness: 4.9, intelligibility: 5 },
      });
      expect(built.reviewerName).toBeNull();
      expect(built.mos).toBeNull();
      expect(built.naturalness).toBeNull();
      expect(built.intelligibility).toBeNull();
    });

    it('keeps reviewer scores in range and rejects out-of-range values', () => {
      const ok = buildEvalRow({
        ...base,
        task: 'tts',
        sample: { sampleId: 's5', referenceText: 'ধন্যবাদ', hypothesisText: 'ধন্যবাদ' },
        reviewer: { reviewerName: 'Native Reviewer A', mos: 4.25, naturalness: 4, intelligibility: 4.5 },
      });
      expect(ok.mos).toBe(4.25);
      expect(ok.reviewerName).toBe('Native Reviewer A');

      const bad = buildEvalRow({
        ...base,
        task: 'tts',
        sample: { sampleId: 's6', referenceText: 'ধন্যবাদ', hypothesisText: 'ধন্যবাদ' },
        reviewer: { reviewerName: 'Native Reviewer B', mos: 9 },
      });
      expect(bad.mos).toBeNull();
    });

    it('leaves latency null when it was not measured', () => {
      const built = buildEvalRow({
        ...base,
        sample: { sampleId: 's7', referenceText: 'হ্যাঁ', hypothesisText: 'হ্যাঁ' },
      });
      expect(built.latencyMs).toBeNull();
    });
  });

  describe('release gates', () => {
    it('reports NOT MEASURED (not a pass) when there is no evidence at all', () => {
      const report = evaluateGates([]);
      expect(report.overall).toBe('incomplete');
      for (const gate of report.gates) {
        expect(gate.verdict).toBe('not_measured');
        expect(gate.applicable).toBe(false);
      }
      expect(report.summary).toMatch(/Nothing was measured/);
    });

    it('is incomplete when ASR is measured but no native reviewer scored TTS', () => {
      const report = evaluateGates([
        row({ sampleId: 'a1', referenceText: 'আজ সকাল দশটা', hypothesisText: 'আজ সকাল দশটা' }),
      ]);
      expect(report.gates.find((g) => g.key === 'asr.clean.wer')!.verdict).toBe('pass');
      expect(report.gates.find((g) => g.key === 'tts.intelligibility')!.verdict).toBe('not_measured');
      expect(report.overall).toBe('incomplete');
    });

    it('passes only when clean AND difficult audio are both evidenced', () => {
      const rows: EvalRow[] = [
        row({ sampleId: 'g1', referenceText: 'আজ সকাল দশটা', hypothesisText: 'আজ সকাল দশটা' }),
        row({ sampleId: 'g2', referenceText: 'অর্ডার নম্বর', hypothesisText: 'অর্ডার নম্বর' }),
        row({
          sampleId: 'g3',
          referenceText: 'আমার meeting টা কবে',
          hypothesisText: 'আমার meeting টা কবে',
          audioProfile: 'noisy',
        }),
      ];
      const tts = buildEvalRow({
        ...base,
        task: 'tts',
        sample: { sampleId: 't1', referenceText: 'স্বাগতম', hypothesisText: 'স্বাগতম', latencyMs: 300 },
        reviewer: { reviewerName: 'Reviewer A', mos: 4.5, naturalness: 4.2, intelligibility: 4.6 },
      });
      const report = evaluateGates([...rows, tts]);
      expect(report.overall).toBe('pass');
      expect(report.gates.filter((g) => g.applicable).every((g) => g.verdict === 'pass')).toBe(true);
      expect(report.gates.every((g) => g.applicable)).toBe(true);
    });

    it('marks a condition with no samples as not applicable instead of silently passing it', () => {
      const report = evaluateGates([
        row({ sampleId: 'u1', referenceText: 'আজ সকাল দশটা', hypothesisText: 'আজ সকাল দশটা' }),
      ]);
      const difficult = report.gates.find((g) => g.key === 'asr.difficult.wer')!;
      expect(difficult.applicable).toBe(false);
      expect(difficult.verdict).toBe('not_measured');
      // Clean audio passes, so the run is not a failure — but the summary must
      // say the noisy/telephone/code-switch conditions were never evaluated.
      expect(report.overall).toBe('incomplete');
      expect(report.summary).toMatch(/Not covered by this corpus/);
    });

    it('fails the clean-WER gate when transcription is bad', () => {
      const report = evaluateGates([
        row({ sampleId: 'b1', referenceText: 'আমার অর্ডার নম্বর হলো এক দুই তিন চার', hypothesisText: 'ভুল' }),
      ]);
      const wer = report.gates.find((g) => g.key === 'asr.clean.wer')!;
      expect(wer.verdict).toBe('fail');
      expect(wer.observed).toBeGreaterThan(PROPOSED_THRESHOLDS.cleanWer);
      expect(report.overall).toBe('fail');
    });

    it('judges noisy/telephone/code-switched audio against the looser threshold', () => {
      const report = evaluateGates([
        row({
          sampleId: 'n1',
          referenceText: 'আমার meeting টা কবে হবে জানাবেন',
          hypothesisText: 'আমার meeting টা কবে হবে জানাবেন',
          audioProfile: 'code_switched',
        }),
      ]);
      const gate = report.gates.find((g) => g.key === 'asr.difficult.wer')!;
      expect(gate.threshold).toBe(PROPOSED_THRESHOLDS.difficultWer);
      expect(gate.samples).toBe(1);
    });

    it('computes the first-audio p95 from measured latencies only', () => {
      const rows = [100, 200, 300, 400, 900].map((latencyMs, i) =>
        buildEvalRow({
          ...base,
          task: 'tts',
          sample: { sampleId: `lat-${i}`, referenceText: 'ক', hypothesisText: 'ক', latencyMs },
        }),
      );
      const gate = evaluateGates(rows).gates.find((g) => g.key === 'tts.firstAudioP95')!;
      expect(gate.observed).toBe(900);
      expect(gate.verdict).toBe('fail');
    });
  });

  describe('critical entity failures override averages', () => {
    it('flags a lost order number even when WER looks acceptable', () => {
      const rows = [
        row({ sampleId: 'c1', referenceText: 'অর্ডার নম্বর ১২৩৪৫', hypothesisText: 'অর্ডার নম্বর' }),
      ];
      const failures = detectCriticalEntityFailures(rows);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/number missing/);
      const report = evaluateGates(rows);
      expect(report.overall).toBe('fail');
      expect(report.summary).toMatch(/critical/i);
    });

    it('flags a fully lost currency expression', () => {
      const rows = [row({ sampleId: 'c2', referenceText: 'মোট ৳ ৪৫০ টাকা', hypothesisText: 'মোট' })];
      const failures = detectCriticalEntityFailures(rows);
      expect(failures.some((f) => /currency missing/.test(f))).toBe(true);
      expect(failures.some((f) => /number missing/.test(f))).toBe(true);
      expect(failures.every((f) => f.includes('c2'))).toBe(true);
    });

    it('catches a dropped amount even when the unit word survives', () => {
      // "৳৪৫০ টাকা" → "টাকা": the unit word remains, so only the number check
      // fires — which is correct, because the value is what was lost.
      const rows = [row({ sampleId: 'c6', referenceText: 'মোট ৳ ৪৫০ টাকা', hypothesisText: 'মোট টাকা' })];
      const failures = detectCriticalEntityFailures(rows);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/number missing/);
    });

    it('flags a dropped currency symbol even when digits survive', () => {
      const rows = [row({ sampleId: 'c5', referenceText: 'মূল্য ৳ ৪৫০', hypothesisText: 'মূল্য ৪৫০' })];
      const failures = detectCriticalEntityFailures(rows);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/currency missing/);
    });

    it('does not flag samples that reproduce the number and currency', () => {
      const rows = [row({ sampleId: 'c3', referenceText: '৳ ৪৫০ টাকা', hypothesisText: '৳ ৪৫০ টাকা' })];
      expect(detectCriticalEntityFailures(rows)).toEqual([]);
    });

    it('ignores samples with no numbers or currency at all', () => {
      const rows = [row({ sampleId: 'c4', referenceText: 'আমি সাহায্য চাই', hypothesisText: 'সাহায্য' })];
      expect(detectCriticalEntityFailures(rows)).toEqual([]);
    });
  });
});
