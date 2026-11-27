/**
 * GitHub repository intelligence — parsing.
 *
 * Turning a pasted link into an owner/repo pair sounds trivial until the link is
 * `https://github.com/owner/repo/tree/main/src`, or ends in `.git`, or is a bare
 * `owner/repo`. This module is the single place that decides what a link points
 * at, and it refuses anything that is not a repository rather than guessing.
 */

export interface RepositoryRef {
  owner: string;
  repo: string;
  /** Canonical `owner/repo`. */
  fullName: string;
  /** The URL to show the operator. */
  htmlUrl: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Hosts that serve a repository; mirrors are not silently accepted. */
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export type ParseResult = { ok: true; ref: RepositoryRef } | { ok: false; reason: string };

export function parseRepositoryReference(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'No repository was given.' };
  if (raw.length > 2_048) return { ok: false, reason: 'The repository reference is too long.' };

  // Bare `owner/repo`.
  if (!raw.includes('://') && !raw.startsWith('git@')) {
    const parts = raw.split('/').filter(Boolean);
    if (parts.length !== 2) {
      return { ok: false, reason: 'Expected a GitHub URL or "owner/repo".' };
    }
    return buildRef(parts[0], parts[1]);
  }

  if (raw.startsWith('git@')) {
    // git@github.com:owner/repo.git
    const match = raw.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (!match) return { ok: false, reason: 'That SSH remote could not be parsed.' };
    if (!GITHUB_HOSTS.has(match[1].toLowerCase())) return { ok: false, reason: `Unsupported host: ${match[1]}.` };
    return buildRef(match[2], match[3]);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `"${raw.slice(0, 120)}" is not a valid URL.` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `Only http(s) links are accepted (received "${url.protocol}").` };
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: `Only github.com repositories are supported (received "${url.hostname}").` };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return { ok: false, reason: 'The link does not name a repository.' };

  // /orgs/<org>/repositories is an organisation page, not a repository.
  if (segments[0].toLowerCase() === 'orgs') {
    return {
      ok: false,
      reason: 'That link is an organisation listing, not a repository. Send a specific repository URL.',
    };
  }
  // Reserved top-level paths that are never an owner.
  const reserved = new Set(['topics', 'collections', 'marketplace', 'sponsors', 'settings', 'login', 'features', 'explore']);
  if (reserved.has(segments[0].toLowerCase())) {
    return { ok: false, reason: `"${segments[0]}" is a GitHub section, not a repository owner.` };
  }

  return buildRef(segments[0], segments[1].replace(/\.git$/, ''));
}

function buildRef(owner: string, repo: string): ParseResult {
  if (!OWNER_PATTERN.test(owner)) return { ok: false, reason: `"${owner}" is not a valid GitHub owner.` };
  if (!REPO_PATTERN.test(repo)) return { ok: false, reason: `"${repo}" is not a valid repository name.` };
  return {
    ok: true,
    ref: {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
    },
  };
}
