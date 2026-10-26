/**
 * Link coverage — shared types.
 *
 * One row per upstream link (site or repository) from the reference list, with
 * the *files in this repository* that prove the capability exists, plus an
 * honest verdict. The super admin dashboard renders this data; the API route
 * re-verifies it against the working tree on request.
 *
 * Nothing in this file imports Node APIs, so it is safe in a client bundle.
 */

/** What we can truthfully say about a link. */
export type CoverageVerdict =
  /** The artefact exists here and is exercised by code or tests. */
  | 'implemented'
  /** An equivalent subsystem already exists here; upstream code was not copied. */
  | 'in_kind'
  /** Useful as a design/feature reference only; porting it would duplicate something else. */
  | 'reference'
  /** Concrete, implementable, and not implemented. The `gap` field names the next step. */
  | 'gap'
  /** Cannot apply: native mobile/OS runtime, model weights, hardware, or content-only. */
  | 'not_applicable';

export type CoverageSourceKind = 'repository' | 'site';

export type EvidenceKind =
  | 'route'
  | 'library'
  | 'panel'
  | 'test'
  | 'doc'
  | 'config'
  | 'page'
  | 'schema'
  | 'directory';

/** A single file (or directory) in this repo that backs the claim. */
export interface CoverageEvidence {
  /** Human label rendered in the dashboard. */
  label: string;
  /** Repository-relative path. Never absolute, never external. */
  path: string;
  kind: EvidenceKind;
}

/** Upstream metadata fetched with `gh api` on the day the row was checked. */
export interface UpstreamMeta {
  stars?: number;
  language?: string;
  archived?: boolean;
  /** ISO date (YYYY-MM-DD) of the check. */
  checkedAt: string;
}

/** One link from the reference list. */
export interface CoverageEntry {
  /** Stable slug, unique across the registry. */
  id: string;
  /** Upstream URL exactly as sent. */
  url: string;
  kind: CoverageSourceKind;
  category: string;
  /** One line explaining what the link is, in plain terms. */
  upstream: string;
  verdict: CoverageVerdict;
  /** What exists here, stated so it can be disproved by opening a file. */
  claim: string;
  evidence: CoverageEvidence[];
  /** Present for `gap` and for partial `in_kind` rows: the missing step. */
  gap?: string;
  upstreamMeta?: UpstreamMeta;
}

// ─── Verification result shapes ──────────────────────────────────────────────

/** Result of probing one evidence path on disk. */
export type EvidenceStatus = 'verified' | 'missing' | 'unverifiable';

export interface EvidenceCheck extends CoverageEvidence {
  exists: boolean;
  /** verified = read from disk; missing = registry claims it, disk does not have it;
   *  unverifiable = the filesystem is not readable from this runtime. */
  status: EvidenceStatus;
  isDirectory: boolean;
  bytes: number;
  lines: number;
  /** First 12 hex characters of SHA-256, or null for directories. */
  sha256Prefix: string | null;
  error?: string;
}

export interface EntryCheck {
  id: string;
  url: string;
  kind: CoverageSourceKind;
  category: string;
  verdict: CoverageVerdict;
  claim: string;
  gap?: string;
  /** Evidence paths that resolved on disk. */
  verified: number;
  /** Evidence paths the registry claims but disk does not have. */
  missing: string[];
  evidence: EvidenceCheck[];
}

export interface CoverageSummary {
  links: number;
  repositories: number;
  sites: number;
  implemented: number;
  inKind: number;
  reference: number;
  gap: number;
  notApplicable: number;
  evidencePaths: number;
  evidenceVerified: number;
  missingPaths: number;
  unverifiablePaths: number;
  /** Entries whose every evidence path resolved. */
  entriesFullyVerified: number;
}

export interface CoverageReport {
  /** ISO timestamp of this check. */
  generatedAt: string;
  /** `live` = working tree read; `baseline` = filesystem unreachable (e.g. standalone build). */
  mode: 'live' | 'baseline';
  /** Root that was probed, when live. */
  root: string | null;
  summary: CoverageSummary;
  categories: { name: string; links: number; gaps: number }[];
  entries: EntryCheck[];
  /** Files across src/ and docs/ that the working tree exposes, when live. */
  inventory: { srcFiles: number; docsFiles: number } | null;
  warnings: string[];
}

/** Minimal filesystem surface the verifier needs. Injected so it is testable. */
export interface FileProbe {
  /** Returns null when the path cannot be read at all. */
  stat(relativePath: string): {
    exists: boolean;
    isDirectory: boolean;
    bytes: number;
    lines: number;
    sha256Prefix: string | null;
  } | null;
  /** Counts files under a directory tree, or null when unreadable. */
  countFiles(relativePath: string): number | null;
}
