/**
 * GitHub repository intelligence — assessment.
 *
 * Before a repository can be considered for integration it is inspected for what
 * it *is*, not what its README claims: metadata, licence, activity, the manifest,
 * the install scripts (the classic code-execution vector), CI workflows, and
 * whether this platform already does the same thing.
 *
 * Two rules shape the implementation:
 *
 * 1. **Nothing is invented.** Every fact in the report came from a GitHub API
 *    response in this call, and each section carries `unavailable` with the reason
 *    when it could not be read (rate limit, 404, missing token). A missing advisory
 *    feed is reported as missing — it is not converted into "no vulnerabilities".
 * 2. **The verdict is a rule, not a mood.** Each finding carries a weight, the
 *    verdict is derived from the findings, and the report prints the findings so a
 *    reviewer can disagree with the rule.
 */

import { parseRepositoryReference, type RepositoryRef } from './parse';

export type RepoVerdict = 'safe_to_integrate' | 'safe_after_review' | 'isolated_evaluation_only' | 'reject';

export interface RepoFinding {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  /** Which section of the report produced it. */
  source: 'metadata' | 'manifest' | 'scripts' | 'ci' | 'licence' | 'activity' | 'duplication' | 'advisories';
}

export interface RepoAssessment {
  ref: RepositoryRef;
  fetchedAt: string;
  /** Anything that could not be read, with the reason. */
  unavailable: { section: string; reason: string }[];
  repository: {
    description: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    language: string | null;
    archived: boolean;
    disabled: boolean;
    defaultBranch: string;
    pushedAt: string | null;
    createdAt: string | null;
    sizeKb: number;
    topics: string[];
    homepage: string | null;
  } | null;
  licence: { spdx: string | null; name: string | null; permissive: boolean | null } | null;
  activity: { lastCommitAt: string | null; recentCommits: number; latestRelease: string | null; stale: boolean } | null;
  manifest: {
    path: string;
    name: string | null;
    version: string | null;
    packageManager: string | null;
    engines: Record<string, string>;
    dependencyCount: number;
    devDependencyCount: number;
    scripts: Record<string, string>;
  } | null;
  structure: { rootEntries: string[]; hasDockerfile: boolean; hasWorkflows: boolean; hasLockfile: boolean; hasVercelConfig: boolean };
  advisories: { available: boolean; count: number | null; reason?: string };
  duplication: { matchedCapability: string | null; note: string };
  findings: RepoFinding[];
  verdict: RepoVerdict;
  verdictReason: string;
}

/** GitHub's licence metadata only knows a handful of SPDX ids; treat these as permissive. */
const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'CC0-1.0', 'MPL-2.0']);
const COPYLEFT = new Set(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'SSPL-1.0']);

export interface AssessOptions {
  /** GitHub token. Without it the API allows 60 requests/hour and no advisories. */
  token?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Known capability names, used to detect a duplicate of something we already have. */
  knownCapabilities?: readonly string[];
  now?: Date;
}

const API = 'https://api.github.com';

/** Shape of `GET /repos/:owner/:repo`. */
interface RepoApiRow {
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  disabled: boolean;
  default_branch: string;
  pushed_at: string | null;
  created_at: string | null;
  size: number;
  topics?: string[];
  homepage: string | null;
  license: { spdx_id: string | null; name: string | null } | null;
}

/** Shape of one entry from `GET /repos/:owner/:repo/contents`. */
interface ContentRow {
  name: string;
  type: string;
}

/** Shape of one entry from `GET /repos/:owner/:repo/commits`. */
interface CommitRow {
  commit: { committer: { date: string } };
}

async function ghJson<T>(
  path: string,
  options: AssessOptions,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${API}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        'user-agent': 'alolabs-agentos-repository-intelligence',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) return { ok: false, reason: 'not found (404)' };
    if (response.status === 403 || response.status === 429) {
      return { ok: false, reason: 'GitHub API rate limit or permission denied' };
    }
    if (!response.ok) return { ok: false, reason: `GitHub returned ${response.status}` };
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'request failed' };
  }
}

/** Install-time scripts are the only place a dependency-free install can run code. */
const DANGEROUS_SCRIPT = /\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b|\bnode\s+-e\b|\beval\b|\bbase64\s+-d\b|\bpowershell\b|\bInvoke-WebRequest\b/i;

function scriptFindings(scripts: Record<string, string>): RepoFinding[] {
  const findings: RepoFinding[] = [];
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];
  for (const [name, command] of Object.entries(scripts)) {
    if (!lifecycle.includes(name)) continue;
    if (DANGEROUS_SCRIPT.test(command)) {
      findings.push({
        id: `script.${name}.dangerous`,
        severity: 'critical',
        title: `\`${name}\` downloads and executes code`,
        detail: `"${name}": "${command.slice(0, 200)}" — install-time execution of a remote payload. Never run this with network or filesystem privileges; isolate it or vendor the artefact.`,
        source: 'scripts',
      });
    } else if (/node|sh|bash|python/.test(command)) {
      findings.push({
        id: `script.${name}.exec`,
        severity: 'medium',
        title: `\`${name}\` runs a program at install time`,
        detail: `"${name}": "${command.slice(0, 200)}" — executes locally on install. Review before adding to a workspace with credentials.`,
        source: 'scripts',
      });
    }
  }
  return findings;
}

/** Match a repository against capabilities this platform already implements. */
function duplicationFindings(ref: RepositoryRef, topics: readonly string[], known: readonly string[]): { matched: string | null; findings: RepoFinding[] } {
  if (known.length === 0) return { matched: null, findings: [] };
  const haystack = `${ref.repo} ${topics.join(' ')}`.toLowerCase();
  const matched = known.find((capability) => haystack.includes(capability.toLowerCase())) ?? null;
  if (!matched) return { matched: null, findings: [] };
  return {
    matched,
    findings: [
      {
        id: 'duplication.existing_capability',
        severity: 'info',
        title: `Possibly duplicates an existing capability: ${matched}`,
        detail:
          `This repository's name or topics match "${matched}", which the stack register already lists. ` +
          'Read the register entry before integrating: the useful outcome may be an adapter, not a second implementation.',
        source: 'duplication',
      },
    ],
  };
}

/**
 * Assess one repository.
 *
 * A 404 is a finding, not an error: a repository that cannot be read cannot be
 * evaluated, and the verdict says so.
 */
export async function assessRepository(input: string, options: AssessOptions = {}): Promise<RepoAssessment> {
  const parsed = parseRepositoryReference(input);
  const fetchedAt = new Date().toISOString();

  if (!parsed.ok) {
    return {
      ref: { owner: '', repo: '', fullName: input.slice(0, 120), htmlUrl: '' },
      fetchedAt,
      unavailable: [{ section: 'parse', reason: parsed.reason }],
      repository: null,
      licence: null,
      activity: null,
      manifest: null,
      structure: { rootEntries: [], hasDockerfile: false, hasWorkflows: false, hasLockfile: false, hasVercelConfig: false },
      advisories: { available: false, count: null, reason: 'repository could not be parsed' },
      duplication: { matchedCapability: null, note: 'not evaluated' },
      findings: [
        {
          id: 'parse.invalid',
          severity: 'high',
          title: 'Not a repository reference',
          detail: parsed.reason,
          source: 'metadata',
        },
      ],
      verdict: 'reject',
      verdictReason: `The reference could not be parsed: ${parsed.reason}`,
    };
  }

  const ref = parsed.ref;
  const unavailable: { section: string; reason: string }[] = [];
  const findings: RepoFinding[] = [];

  const [repoResult, releaseResult, commitsResult, contentsResult] = await Promise.all([
    ghJson<RepoApiRow>(`/repos/${ref.owner}/${ref.repo}`, options),
    ghJson<{ tag_name: string }>(`/repos/${ref.owner}/${ref.repo}/releases/latest`, options),
    ghJson<CommitRow[]>(`/repos/${ref.owner}/${ref.repo}/commits?per_page=5`, options),
    ghJson<ContentRow[]>(`/repos/${ref.owner}/${ref.repo}/contents`, options),
  ]);

  if (!repoResult.ok) {
    unavailable.push({ section: 'metadata', reason: repoResult.reason });
    findings.push({
      id: 'metadata.unreadable',
      severity: 'high',
      title: 'Repository could not be read',
      detail: `${ref.fullName}: ${repoResult.reason}. A repository that cannot be inspected cannot be evaluated.`,
      source: 'metadata',
    });
  }

  const repo = repoResult.ok ? repoResult.data : null;
  if (repo?.archived) {
    findings.push({
      id: 'activity.archived',
      severity: 'high',
      title: 'Repository is archived',
      detail: 'Archived repositories receive no security fixes. Integrating one means owning it from the first day.',
      source: 'activity',
    });
  }
  if (repo?.disabled) {
    findings.push({ id: 'activity.disabled', severity: 'critical', title: 'Repository is disabled by GitHub', detail: 'Disabled for policy reasons.', source: 'activity' });
  }

  const licence = repo?.license
    ? {
        spdx: repo.license.spdx_id,
        name: repo.license.name,
        permissive: repo.license.spdx_id ? PERMISSIVE.has(repo.license.spdx_id) : null,
      }
    : null;

  if (repo && !licence) {
    findings.push({
      id: 'licence.missing',
      severity: 'high',
      title: 'No licence detected',
      detail: 'Without a licence, using the code is legally unsafe. Integration is refused until the licence is established.',
      source: 'licence',
    });
  } else if (licence?.spdx && COPYLEFT.has(licence.spdx)) {
    findings.push({
      id: 'licence.copyleft',
      severity: 'medium',
      title: `Copyleft licence (${licence.spdx})`,
      detail: 'A copyleft licence constrains how the code may be combined with this product. Use it as a separate service behind an API boundary, or not at all.',
      source: 'licence',
    });
  } else if (licence?.spdx === 'NOASSERTION' || (licence && licence.permissive === null)) {
    findings.push({
      id: 'licence.unclear',
      severity: 'medium',
      title: 'Licence needs a human read',
      detail: 'GitHub could not map the licence file to an SPDX id. Read it before reuse.',
      source: 'licence',
    });
  }

  const rootEntries = contentsResult.ok ? contentsResult.data.map((entry) => entry.name) : [];
  if (!contentsResult.ok) unavailable.push({ section: 'structure', reason: contentsResult.reason });

  const structure = {
    rootEntries: rootEntries.slice(0, 100),
    hasDockerfile: rootEntries.some((name) => /^dockerfile/i.test(name)),
    hasWorkflows: rootEntries.includes('.github'),
    hasLockfile: rootEntries.some((name) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(name)),
    hasVercelConfig: rootEntries.includes('vercel.json'),
  };

  // Manifest: package.json is the only one that can execute code at install time.
  let manifest: RepoAssessment['manifest'] = null;
  if (rootEntries.includes('package.json')) {
    const manifestResult = await ghJson<{
      name?: string;
      version?: string;
      packageManager?: string;
      engines?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    }>(`/repos/${ref.owner}/${ref.repo}/contents/package.json`, options);

    if (manifestResult.ok) {
      // The contents API returns base64 for files; the raw media type would avoid
      // this, but a single decode here keeps the request count down.
      const raw = manifestResult.data as unknown as { content?: string; encoding?: string };
      let text: string | null = null;
      if (raw?.content && raw.encoding === 'base64') {
        try {
          text = Buffer.from(raw.content, 'base64').toString('utf8');
        } catch {
          text = null;
        }
      }
      if (text) {
        try {
          const pkg = JSON.parse(text) as {
            name?: string;
            version?: string;
            packageManager?: string;
            engines?: Record<string, string>;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            scripts?: Record<string, string>;
          };
          manifest = {
            path: 'package.json',
            name: pkg.name ?? null,
            version: pkg.version ?? null,
            packageManager: pkg.packageManager ?? null,
            engines: pkg.engines ?? {},
            dependencyCount: Object.keys(pkg.dependencies ?? {}).length,
            devDependencyCount: Object.keys(pkg.devDependencies ?? {}).length,
            scripts: pkg.scripts ?? {},
          };
          findings.push(...scriptFindings(manifest.scripts));
          if (manifest.dependencyCount > 150) {
            findings.push({
              id: 'manifest.dependency_blast_radius',
              severity: 'medium',
              title: `${manifest.dependencyCount} runtime dependencies`,
              detail: 'A dependency tree this size is itself an attack surface and a supply-chain cost.',
              source: 'manifest',
            });
          }
        } catch {
          unavailable.push({ section: 'manifest', reason: 'package.json could not be parsed as JSON' });
        }
      } else {
        unavailable.push({ section: 'manifest', reason: 'package.json content was not returned in a decodable form' });
      }
    } else {
      unavailable.push({ section: 'manifest', reason: manifestResult.reason });
    }
  }

  const pushedAt = repo?.pushed_at ?? null;
  const now = options.now ?? new Date();
  const stale = pushedAt ? now.getTime() - new Date(pushedAt).getTime() > 365 * 24 * 3600 * 1000 : true;
  if (pushedAt && stale) {
    findings.push({
      id: 'activity.stale',
      severity: 'medium',
      title: 'No commits for over a year',
      detail: `Last push ${pushedAt}. Unmaintained dependencies inherit their own vulnerabilities.`,
      source: 'activity',
    });
  }

  const activity = repo
    ? {
        lastCommitAt: commitsResult.ok && commitsResult.data[0] ? commitsResult.data[0].commit.committer.date : pushedAt,
        recentCommits: commitsResult.ok ? commitsResult.data.length : 0,
        latestRelease: releaseResult.ok ? releaseResult.data.tag_name : null,
        stale,
      }
    : null;

  // Advisories need an authenticated token; without one, say so.
  let advisories: RepoAssessment['advisories'] = {
    available: false,
    count: null,
    reason: options.token
      ? 'the advisories endpoint returned no data'
      : 'no GitHub token configured (set GITHUB_TOKEN); advisory status is unknown, not "none"',
  };
  if (options.token) {
    const alerts = await ghJson<Array<unknown>>(`/repos/${ref.owner}/${ref.repo}/dependabot/alerts?state=open&per_page=100`, options);
    if (alerts.ok) {
      advisories = { available: true, count: alerts.data.length };
      if (alerts.data.length > 0) {
        findings.push({
          id: 'advisories.open',
          severity: alerts.data.length > 5 ? 'high' : 'medium',
          title: `${alerts.data.length} open Dependabot alert(s)`,
          detail: 'Dependencies with known advisories. Assess whether the vulnerable paths are reachable before reuse.',
          source: 'advisories',
        });
      }
    } else {
      advisories = { available: false, count: null, reason: alerts.reason };
    }
  }

  const duplication = duplicationFindings(ref, repo?.topics ?? [], options.knownCapabilities ?? []);
  findings.push(...duplication.findings);

  if (structure.hasDockerfile) {
    findings.push({
      id: 'structure.container',
      severity: 'low',
      title: 'Ships a container definition',
      detail: 'Evaluate it in an isolated container with no host mounts and no network egress beyond what the trial needs.',
      source: 'ci',
    });
  }

  const verdict = decideVerdict(findings, archiveOrDisabled(Boolean(repo?.archived) || Boolean(repo?.disabled), Boolean(repo)));

  return {
    ref,
    fetchedAt,
    unavailable,
    repository: repo
      ? {
          description: repo.description,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          language: repo.language,
          archived: repo.archived,
          disabled: repo.disabled,
          defaultBranch: repo.default_branch,
          pushedAt: repo.pushed_at,
          createdAt: repo.created_at,
          sizeKb: repo.size,
          topics: repo.topics ?? [],
          homepage: repo.homepage,
        }
      : null,
    licence,
    activity,
    manifest,
    structure,
    advisories,
    duplication: {
      matchedCapability: duplication.matched,
      note: duplication.matched
        ? `The stack register already covers "${duplication.matched}".`
        : 'No existing capability matched this repository by name or topic.',
    },
    findings,
    verdict,
    verdictReason: explain(verdict, findings),
  };
}

function archiveOrDisabled(flag: boolean, read: boolean): boolean {
  return read && flag;
}

/**
 * Verdict rules, most severe first:
 *
 *   critical finding, archived, unreadable, or no licence  → reject
 *   install-time execution or copyleft                     → isolated evaluation only
 *   any other medium/high finding                          → safe after review
 *   otherwise                                              → safe to integrate
 */
function decideVerdict(findings: readonly RepoFinding[], archivedOrDisabled: boolean): RepoVerdict {
  if (archivedOrDisabled) return 'reject';
  if (findings.some((finding) => finding.id === 'metadata.unreadable' || finding.id === 'parse.invalid')) return 'reject';
  if (findings.some((finding) => finding.id === 'licence.missing' || finding.severity === 'critical')) return 'reject';
  if (findings.some((finding) => finding.id.startsWith('script.') || finding.id === 'licence.copyleft')) {
    return 'isolated_evaluation_only';
  }
  const significant = findings.filter((finding) => finding.severity === 'high' || finding.severity === 'medium');
  if (significant.length > 0) return 'safe_after_review';
  return 'safe_to_integrate';
}

function explain(verdict: RepoVerdict, findings: readonly RepoFinding[]): string {
  const blocking = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high');
  switch (verdict) {
    case 'reject':
      return `Not integrable as-is: ${(blocking[0] ?? findings[0])?.title ?? 'unreadable repository'}.`;
    case 'isolated_evaluation_only':
      return `Evaluate only in isolation: ${(blocking[0] ?? findings[0])?.title ?? 'install-time behaviour'}. Do not run its install or build with credentials or network access to our systems.`;
    case 'safe_after_review':
      return `Integrable after human review of ${blocking.length || findings.length} finding(s); nothing critical was found.`;
    case 'safe_to_integrate':
      return 'No licence, install-script, activity or advisory problem was found by the rules; still review the diff you intend to copy.';
  }
}
