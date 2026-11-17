#!/usr/bin/env tsx
/**
 * Bangla voice benchmark runner — writes REAL evaluation rows and prints the
 * release-gate report. See docs/BANGLA_VOICE_MODEL_EVALUATION.md.
 *
 * Usage (dry run — nothing is written, gates still evaluated):
 *   npx tsx scripts/run-voice-benchmark.ts --corpus corpus.json --engine piper --task asr --dry-run
 *
 * Usage (persist to VoiceBenchmark):
 *   DATABASE_URL=file:./db/custom.db npx tsx scripts/run-voice-benchmark.ts \
 *     --corpus corpus.json --engine piper --engine-version 1.2.0 --task asr
 *
 * Corpus format (`--corpus`): JSON array of samples
 *   [{ "sampleId": "bn-clean-001", "referenceText": "…", "hypothesisText": "…",
 *      "audioProfile": "clean", "latencyMs": 420,
 *      "review": { "reviewerName": "…", "mos": 4.3, "naturalness": 4.1,
 *                  "intelligibility": 4.5 } }]
 *
 * The `hypothesisText` must be the engine's actual output — you generate it
 * with the engine under test, outside this script, so the harness never
 * invents output. Samples without a `review` produce MOS gates of
 * NOT MEASURED, which is the honest result when no native speaker listened.
 *
 * Exit code 1 when any gate fails, 2 when the run is incomplete (unmeasured
 * gates), 0 only when every gate passes. CI can therefore block a quality
 * claim on a real measurement.
 */
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import {
  buildEvalRow,
  evaluateGates,
  type AudioProfile,
  type EvalRow,
  type EvalTask,
  type ReviewerScores,
} from '../src/lib/voice/eval-harness';

interface CorpusEntry {
  sampleId: string;
  referenceText: string;
  hypothesisText: string;
  audioProfile?: AudioProfile;
  latencyMs?: number;
  review?: ReviewerScores;
}

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  return next && !next.startsWith('--') ? next : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const corpusPath = arg('corpus');
  const engine = arg('engine');
  const task = (arg('task', 'asr') as EvalTask | undefined) ?? 'asr';
  const language = arg('language', 'bn-BD') ?? 'bn-BD';
  const engineVersion = arg('engine-version');
  const companyId = arg('company-id') ?? null;
  const dryRun = hasFlag('dry-run');

  if (!corpusPath || !engine) {
    console.error('Usage: tsx scripts/run-voice-benchmark.ts --corpus <file.json> --engine <id> [--task tts|asr] [--dry-run]');
    process.exit(3);
  }
  if (task !== 'tts' && task !== 'asr') {
    console.error(`Unknown --task "${task}" (expected tts or asr)`);
    process.exit(3);
  }

  const entries = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('Corpus must be a non-empty JSON array.');
    process.exit(3);
  }

  const rows: EvalRow[] = entries.map((entry) =>
    buildEvalRow({
      engine,
      engineVersion,
      language,
      task,
      sample: {
        sampleId: entry.sampleId,
        referenceText: entry.referenceText,
        hypothesisText: entry.hypothesisText,
        audioProfile: entry.audioProfile,
        latencyMs: entry.latencyMs,
      },
      reviewer: entry.review,
    }),
  );

  const report = evaluateGates(rows);

  console.log(`\nEngine : ${engine}${engineVersion ? ` v${engineVersion}` : ''}`);
  console.log(`Task   : ${task}   Language: ${language}   Samples: ${rows.length}`);
  console.log('─'.repeat(78));
  for (const gate of report.gates) {
    const observed = gate.observed === null ? 'NOT MEASURED' : gate.observed.toFixed(4);
    console.log(
      `${gate.verdict.toUpperCase().padEnd(13)} ${gate.label.padEnd(42)} ${observed.padStart(12)} ${gate.unit}`,
    );
  }
  if (report.criticalFailures.length > 0) {
    console.log('\nCRITICAL number/currency failures (block release regardless of averages):');
    for (const failure of report.criticalFailures) console.log(`  - ${failure}`);
  }
  console.log('─'.repeat(78));
  console.log(`Overall: ${report.overall.toUpperCase()}`);
  console.log(report.summary);

  if (dryRun) {
    console.log('\n--dry-run set: no rows written.');
    process.exit(report.overall === 'pass' ? 0 : report.overall === 'fail' ? 1 : 2);
  }

  let written = 0;
  for (const row of rows) {
    await db.voiceBenchmark.create({
      data: {
        companyId,
        engine: row.engine,
        engineVersion: row.engineVersion ?? null,
        language: row.language,
        task: row.task,
        sampleId: row.sampleId,
        reviewerName: row.reviewerName,
        referenceText: row.referenceText,
        hypothesisText: row.hypothesisText,
        wer: row.wer,
        cer: row.cer,
        mos: row.mos,
        naturalness: row.naturalness,
        intelligibility: row.intelligibility,
        latencyMs: row.latencyMs,
        audioProfile: row.audioProfile,
        notes: row.notes,
      },
    });
    written++;
  }
  console.log(`\nWrote ${written} VoiceBenchmark row(s).`);
  await db.$disconnect();
  process.exit(report.overall === 'pass' ? 0 : report.overall === 'fail' ? 1 : 2);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await db.$disconnect().catch(() => undefined);
  process.exit(3);
});
