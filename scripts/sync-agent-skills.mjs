#!/usr/bin/env node
/**
 * Sync instruction-only agent skills from pinned upstream repositories.
 *
 * This intentionally does NOT clone repositories, install dependencies, import
 * scripts/binaries, or grant tool permissions. It fetches SKILL.md documents and
 * license texts through the GitHub API, records provenance, and classifies each
 * skill as advisory (usable as prompt guidance) or quarantined (cataloged but
 * never injected into the Command Agent).
 *
 * Usage:
 *   node scripts/sync-agent-skills.mjs
 *
 * Authentication: uses `gh api` when available, otherwise GITHUB_TOKEN or the
 * public GitHub API. Generated files are committed so runtime does not need network access.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src/lib/agent-skills');
const CONTENT = join(OUT, 'content');
const LICENSES = join(OUT, 'licenses');

const SOURCES = [
  {
    id: 'mattpocock', repo: 'mattpocock/skills', commit: 'a496f5513d4a4cf889bc48e189e579f4b0bdf6aa',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^skills\/[^/]+\/[^/]+\/SKILL\.md$/,
    categoryOf: (p) => p.split('/')[1] ?? 'engineering',
  },
  {
    id: 'diagram-design', repo: 'cathrynlavery/diagram-design', commit: '0cf73c3fcc56667ad91a9a04c439ac6ccfabc9d1',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^skills\/diagram-design\/SKILL\.md$/, categoryOf: () => 'design',
  },
  {
    id: 'swiftui', repo: 'twostraws/SwiftUI-Agent-Skill', commit: 'f2920b63995263f57b3e198674e89a602efba6d2',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^swiftui-pro\/SKILL\.md$/, categoryOf: () => 'mobile',
  },
  {
    id: 'ai-design', repo: 'elayadesign/ai-design-skills', commit: '4fdcdd52f15eda09da1257c303c860c13e0c879f',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^skills\/[^/]+\/SKILL\.md$/, categoryOf: () => 'design',
  },
  {
    id: 'android', repo: 'android/skills', commit: '6daa53ef27fa2aa87827d183a85c06cedceca833',
    license: 'Apache-2.0', licensePath: 'LICENSE.txt', defaultStatus: 'advisory',
    include: /(^|\/)SKILL\.md$/, categoryOf: (p) => p.split('/')[0] ?? 'android',
  },
  {
    id: 'scientific', repo: 'K-Dense-AI/scientific-agent-skills', commit: '5f2bc0341354fd5590aef76a533ada1e1e5b4e62',
    license: 'MIT', licensePath: 'LICENSE.md', defaultStatus: 'advisory',
    include: /^skills\/[^/]+\/SKILL\.md$/, categoryOf: () => 'science',
  },
  {
    id: 'karpathy', repo: 'anshuxinha/karpathy-skills-extended', commit: '8fe0d8dfbcafebcfd29ea1b94cd120964883843d',
    license: 'MIT', licensePath: 'LICENSE', noticePath: 'NOTICE', defaultStatus: 'advisory',
    include: /^skills\/karpathy-skills-extended\/SKILL\.md$/, categoryOf: () => 'engineering',
  },
  {
    id: 'delegate-router', repo: 'pvjbuilds/delegate-router', commit: '1f3b24eb5125f9c8f0449df104d380978d86935b',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'quarantined',
    include: /^skills\/delegate\/SKILL\.md$/, categoryOf: () => 'routing',
    quarantineReason: 'Routes work to external model CLIs and could bypass the AgentOS gateway/budget policy.',
  },
  {
    id: 'presenter', repo: 'bisque-cloud/presenter', commit: 'd0532a98630afe204147e8b92236f65bb98b9e9b',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^skills\/(present|video|watch)\/SKILL\.md$/, categoryOf: () => 'media',
  },
  {
    id: 'hyperframes', repo: 'heygen-com/hyperframes', commit: 'a04b45a6db0d1f724be9cf1985c3b13657195f0d',
    license: 'Apache-2.0', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^(skills|registry\/blocks)\/[^/]+\/SKILL\.md$/, categoryOf: (p) => p.startsWith('registry/') ? 'media-blocks' : 'media',
  },
  {
    id: 'claude-official', repo: 'anthropics/claude-plugins-official', commit: 'a7ba5b93db0c7c8d17f3f1d25853adca79598a1a',
    license: 'Apache-2.0', licensePath: 'LICENSE', defaultStatus: 'advisory',
    include: /^(plugins|external_plugins)\/[^/]+\/skills\/[^/]+\/SKILL\.md$/,
    categoryOf: (p) => p.split('/')[1] ?? 'plugin',
    statusOf: (p) => (p.startsWith('external_plugins/') || p.includes('/example-plugin/') ? 'quarantined' : 'advisory'),
    quarantineReason: 'External messaging plugin or example content; requires separate account/license/security review.',
  },
  {
    id: 'cli-anything', repo: 'HKUDS/CLI-Anything', commit: '34f519533bc175d2fe287ab8316b0dd99bb9cc43',
    license: 'Apache-2.0', licensePath: 'LICENSE', defaultStatus: 'quarantined',
    include: /(^|\/)SKILL\.md$/, categoryOf: (p) => p.split('/')[0] ?? 'desktop',
    quarantineReason: 'Desktop/CLI control harnesses require executable tools and explicit authorization; not granted to the Command Agent.',
  },
  {
    id: 'rea', repo: 'morluto/rea', commit: '23de10bb2849cdce8ddbe70504aa7cc57de75a98',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'quarantined',
    include: /(^|\/)SKILL\.md$/, categoryOf: () => 'security-research',
    quarantineReason: 'Reverse-engineering workflows are dual-use and require written authorization and an isolated lab.',
  },
  {
    id: 'ai-memory', repo: 'akitaonrails/ai-memory', commit: 'ac699b5696ccb37eaa901893fd16bb2b8ba59d90',
    license: 'MIT', licensePath: 'LICENSE', defaultStatus: 'quarantined',
    include: /^plugins\/claude-code\/skills\/[^/]+\/SKILL\.md$/, categoryOf: () => 'memory',
    quarantineReason: 'External persistent-memory CLI could leak customer data or bypass AgentOS tenant memory controls.',
  },
];

function ghAvailable() {
  try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const USE_GH = ghAvailable();

async function api(path) {
  if (USE_GH) {
    const out = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    return JSON.parse(out);
  }
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'alolabs-agent-skill-sync' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fileText(repo, commit, path) {
  const data = await api(`repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${commit}`);
  if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error(`Unexpected content encoding for ${repo}/${path}`);
  return Buffer.from(data.content, 'base64').toString('utf8');
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const [, yaml, body] = match;
  const meta = {};
  let current = null;
  for (const line of yaml.split(/\r?\n/)) {
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      current = top[1];
      const value = top[2].trim();
      meta[current] = value === '' ? [] : value;
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (Array.isArray(meta[current])) {
      meta[current].push(trimmed.replace(/^-\s*/, ''));
    } else if (typeof meta[current] === 'string') {
      meta[current] = `${meta[current]} ${trimmed}`.trim();
    }
  }
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string') {
      meta[key] = value.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    } else if (Array.isArray(value)) {
      meta[key] = value.map((v) => v.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    }
  }
  return { meta, body: body.trim() };
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'skill';
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function keywordsOf(meta, name, category, sourceId) {
  const words = new Set([sourceId, category, ...slugify(name).split('-')]);
  const description = typeof meta.description === 'string' ? meta.description : '';
  for (const word of description.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []) {
    if (words.size >= 40) break;
    words.add(word);
  }
  const explicit = meta.keywords ?? meta.metadata?.keywords;
  if (Array.isArray(explicit)) for (const keyword of explicit) words.add(slugify(keyword));
  return [...words].filter((w) => w.length > 2).slice(0, 40);
}

function requestedToolsOf(meta) {
  const value = meta['allowed-tools'] ?? meta.allowedTools;
  if (Array.isArray(value)) return value.map(String).slice(0, 50);
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean).slice(0, 50);
  return [];
}

function riskOf(status, body, requestedTools) {
  if (status === 'quarantined') return 'high';
  if (requestedTools.some((tool) => /bash|shell|write|edit|execute/i.test(tool))) return 'medium';
  if (/rm\s+-rf|curl[^\n]*\|\s*(ba)?sh|credential|password|exploit|reverse[- ]engineer/i.test(body)) return 'medium';
  return 'low';
}

async function main() {
  mkdirSync(CONTENT, { recursive: true });
  mkdirSync(LICENSES, { recursive: true });
  const entries = [];
  const bodiesBySource = new Map();
  const sourceSummaries = [];

  for (const source of SOURCES) {
    process.stdout.write(`\n→ ${source.repo} @ ${source.commit.slice(0, 8)}\n`);
    const tree = await api(`repos/${source.repo}/git/trees/${source.commit}?recursive=1`);
    if (tree.truncated) throw new Error(`Tree truncated for ${source.repo}; refusing partial import`);
    const paths = tree.tree
      .filter((item) => item.type === 'blob' && source.include.test(item.path))
      .map((item) => item.path)
      .sort();
    if (paths.length === 0) throw new Error(`No SKILL.md matched for ${source.repo}`);

    const licenseText = await fileText(source.repo, source.commit, source.licensePath);
    writeFileSync(join(LICENSES, `${source.id}-LICENSE.txt`), licenseText.endsWith('\n') ? licenseText : `${licenseText}\n`);
    if (source.noticePath) {
      try {
        const notice = await fileText(source.repo, source.commit, source.noticePath);
        writeFileSync(join(LICENSES, `${source.id}-NOTICE.txt`), notice.endsWith('\n') ? notice : `${notice}\n`);
      } catch { /* optional */ }
    }

    const bodies = {};
    let count = 0;
    for (const path of paths) {
      const raw = await fileText(source.repo, source.commit, path);
      const { meta, body } = parseFrontmatter(raw);
      const baseName = typeof meta.name === 'string' && meta.name ? meta.name : path.split('/').slice(-2, -1)[0];
      const category = source.categoryOf(path);
      let slug = `${source.id}-${slugify(baseName)}`;
      if (entries.some((entry) => entry.slug === slug) || bodies[slug]) slug = `${slug}-${sha256(path).slice(0, 8)}`;
      const status = source.statusOf ? source.statusOf(path) : source.defaultStatus;
      const description = typeof meta.description === 'string' && meta.description
        ? meta.description
        : body.split(/\n\s*\n/)[0]?.replace(/^#+\s*/gm, '').slice(0, 500) ?? '';
      const requestedTools = requestedToolsOf(meta);
      const entry = {
        slug,
        name: baseName,
        title: typeof meta.name === 'string' && meta.name ? meta.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : baseName,
        description: description.slice(0, 1200),
        category,
        status,
        riskLevel: riskOf(status, body, requestedTools),
        source: {
          id: source.id,
          repo: source.repo,
          commit: source.commit,
          path,
          url: `https://github.com/${source.repo}/blob/${source.commit}/${path}`,
          license: source.license,
        },
        keywords: keywordsOf(meta, baseName, category, source.id),
        requestedTools,
        grantsTools: false,
        referencesImported: false,
        scriptsImported: false,
        bodyBytes: Buffer.byteLength(body, 'utf8'),
        rawSha256: sha256(raw),
        bodySha256: sha256(body),
        ...(status === 'quarantined' ? { quarantineReason: source.quarantineReason ?? 'Requires separate security/license review.' } : {}),
      };
      entries.push(entry);
      bodies[slug] = body;
      count += 1;
    }
    bodiesBySource.set(source.id, bodies);
    sourceSummaries.push({
      id: source.id, repo: source.repo, commit: source.commit, license: source.license,
      defaultStatus: source.defaultStatus, skillCount: count,
      advisoryCount: entries.filter((e) => e.source.id === source.id && e.status === 'advisory').length,
      quarantinedCount: entries.filter((e) => e.source.id === source.id && e.status === 'quarantined').length,
    });
    process.stdout.write(`  imported ${count} instruction documents (${source.license})\n`);
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  const catalog = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/sync-agent-skills.mjs',
    mode: 'instruction-only',
    totalSkills: entries.length,
    advisorySkills: entries.filter((entry) => entry.status === 'advisory').length,
    quarantinedSkills: entries.filter((entry) => entry.status === 'quarantined').length,
    sources: sourceSummaries,
    skills: entries,
  };
  writeFileSync(join(OUT, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(join(OUT, 'catalog.generated.ts'), `// GENERATED by scripts/sync-agent-skills.mjs — do not edit by hand.\nexport const AGENT_SKILL_CATALOG: unknown = ${JSON.stringify(catalog)};\n`);

  for (const [sourceId, bodies] of bodiesBySource) {
    const file = join(CONTENT, `${sourceId}.generated.ts`);
    const header = `// GENERATED by scripts/sync-agent-skills.mjs — do not edit by hand.\n// Instruction-only SKILL.md bodies. No scripts, binaries, references, or tool grants are imported.\n\n`;
    writeFileSync(file, `${header}export const SKILL_BODIES: Record<string, string> = ${JSON.stringify(bodies, null, 2)};\n`);
  }

  const notice = [
    '# Third-Party Agent Skill Notices',
    '',
    'Generated by `scripts/sync-agent-skills.mjs`. Only SKILL.md instruction text and license/notice files are imported.',
    'Scripts, binaries, companion references, plugins, MCP servers, and tool permissions are NOT imported or granted.',
    'Quarantined skills are cataloged for review but are never injected into the Command Agent.',
    '',
    ...sourceSummaries.map((source) => `- **${source.repo}** @ \`${source.commit}\` — ${source.license}; ${source.skillCount} skills (${source.advisoryCount} advisory, ${source.quarantinedCount} quarantined). License: \`src/lib/agent-skills/licenses/${source.id}-LICENSE.txt\`.`),
    '',
    'Upstream license texts are preserved in `src/lib/agent-skills/licenses/`. Model weights, voice rights, SaaS terms, and executable plugin terms are separate and are not cleared by this import.',
  ].join('\n');
  writeFileSync(join(OUT, 'THIRD_PARTY_NOTICES.md'), `${notice}\n`);

  console.log(`\n✓ ${catalog.totalSkills} skills cataloged: ${catalog.advisorySkills} advisory, ${catalog.quarantinedSkills} quarantined.`);
  console.log(`  → ${OUT}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
