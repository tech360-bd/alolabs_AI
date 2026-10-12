#!/usr/bin/env node
/**
 * sync-marketing-kit.mjs
 *
 * Imports the marketing skill library (coreyhaines31/marketingskills, MIT) into
 * AgentOS as product data, so the playbooks are browsable in-app and installable
 * into the Skills Registry rather than living as loose markdown.
 *
 * Outputs (all generated — do not hand-edit):
 *   src/lib/marketing-kit/data/catalog.json            metadata for every skill
 *   src/lib/marketing-kit/data/skills.generated.ts     SKILL.md bodies
 *   src/lib/marketing-kit/data/references.generated.ts reference bodies
 *
 * Usage:
 *   node scripts/sync-marketing-kit.mjs                      # clone from GitHub
 *   MARKETINGKIT_SRC=/path/to/checkout node scripts/...      # use a local checkout
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/coreyhaines31/marketingskills.git'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src/lib/marketing-kit/data')

/**
 * Category map — the library's own grouping from its README, applied explicitly
 * so a skill never lands in "Uncategorised".
 */
const CATEGORIES = {
  'SEO & Content': ['seo-audit', 'ai-seo', 'programmatic-seo', 'site-architecture', 'schema', 'aso', 'content-strategy', 'competitors', 'competitor-profiling'],
  'CRO': ['cro', 'signup', 'onboarding', 'popups', 'paywalls'],
  'Content & Copy': ['copywriting', 'copy-editing', 'emails', 'cold-email', 'social', 'video', 'image', 'sms', 'lead-magnets'],
  'Paid & Measurement': ['ads', 'ad-creative', 'ab-testing', 'analytics', 'attribution'],
  'Growth & Retention': ['referrals', 'free-tools', 'churn-prevention', 'community-marketing', 'influencer-marketing', 'directory-submissions', 'marketing-loops', 'events', 'public-relations', 'co-marketing'],
  'Sales & GTM': ['revops', 'sales-enablement', 'launch', 'prospecting', 'pricing', 'offers', 'marketing-plan'],
  'Strategy': ['marketing-ideas', 'marketing-psychology', 'customer-research', 'marketing-council', 'product-marketing'],
}

const CATEGORY_OF = Object.entries(CATEGORIES).reduce((acc, [cat, slugs]) => {
  for (const s of slugs) acc[s] = cat
  return acc
}, {})

function resolveSource() {
  const local = process.env.MARKETINGKIT_SRC
  if (local && existsSync(local)) {
    console.log(`→ using local checkout: ${local}`)
    return local
  }
  const tmp = mkdtempSync(join(tmpdir(), 'marketingskills-'))
  console.log(`→ cloning ${REPO}`)
  execFileSync('git', ['clone', '--depth', '1', '-q', REPO, tmp], { stdio: 'inherit' })
  return tmp
}

/** Split YAML frontmatter from the body. */
function parseSkill(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (value === '') continue
    meta[kv[1]] = value
  }
  // metadata: version: x.y.z
  const version = match[1].match(/^\s+version:\s*"?([\d.]+)"?/m)
  if (version) meta.version = version[1]
  return { meta, body: match[2].trim() }
}

function titleOf(body, fallback) {
  const h1 = body.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : fallback
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push({ path: p, size: st.size })
  }
  return out
}

function main() {
  const src = resolveSource()
  const skillsDir = join(src, 'skills')
  if (!existsSync(skillsDir)) throw new Error(`no skills/ directory in ${src}`)

  const dirs = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())
  const catalog = []
  const bodies = {}
  const references = {}
  const assetBodies = {}

  for (const slug of dirs.sort()) {
    const skillPath = join(skillsDir, slug, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const raw = readFileSync(skillPath, 'utf8')
    const { meta, body } = parseSkill(raw)
    const files = walk(join(skillsDir, slug)).map((f) => ({
      path: relative(join(skillsDir, slug), f.path),
      size: f.size,
    }))
    const refs = files.filter((f) => f.path.startsWith('references/'))
    const assets = files.filter((f) => f.path.startsWith('assets/'))
    const evals = files.find((f) => f.path.startsWith('evals/'))

    bodies[slug] = body
    // Text assets (e.g. HTML templates) are kept as content; binary assets stay metadata-only.
    for (const a of assets) {
      if (/\.(html|md|txt|json|csv|ya?ml|svg)$/i.test(a.path)) {
        assetBodies[`${slug}/${a.path}`] = readFileSync(join(skillsDir, slug, a.path), 'utf8')
      }
    }
    for (const ref of refs) {
      const content = readFileSync(join(skillsDir, slug, ref.path), 'utf8')
      const heading = content.match(/^#\s+(.+)$/m)?.[1] ?? ref.path.split('/').pop()
      references[`${slug}/${ref.path}`] = { heading, content }
    }

    catalog.push({
      slug,
      name: meta.name ?? slug,
      title: titleOf(body, slug),
      description: (meta.description ?? '').replace(/\s+/g, ' ').trim(),
      version: meta.version ?? '0.0.0',
      license: meta.license ?? 'MIT',
      category: CATEGORY_OF[slug] ?? 'Uncategorised',
      references: refs.map((r) => ({
        path: r.path,
        name: r.path.replace(/^references\//, '').replace(/\.md$/, ''),
        bytes: r.size,
        heading: references[`${slug}/${r.path}`]?.heading ?? '',
      })),
      assets: assets.map((a) => ({ path: a.path, bytes: a.size })),
      hasEvals: Boolean(evals),
      bytes: raw.length,
      bodyBytes: body.length,
    })
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const catalogPayload = {
    source: REPO,
    license: 'MIT',
    syncedAt: new Date().toISOString(),
    totalSkills: catalog.length,
    categories: Object.keys(CATEGORIES),
    skills: catalog,
  }
  writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(catalogPayload, null, 2) + '\n')

  writeFileSync(
    join(OUT_DIR, 'skills.generated.ts'),
    `// GENERATED by scripts/sync-marketing-kit.mjs — do not edit by hand.\n// Source: ${REPO} (MIT). ${catalog.length} playbooks.\n\nexport const SKILL_BODIES: Record<string, string> = ${JSON.stringify(bodies, null, 2)}\n`,
  )

  const refEntries = Object.entries(references).map(([key, v]) => [
    key,
    { heading: v.heading, content: v.content },
  ])
  writeFileSync(
    join(OUT_DIR, 'references.generated.ts'),
    `// GENERATED by scripts/sync-marketing-kit.mjs — do not edit by hand.\n// Source: ${REPO} (MIT). ${refEntries.length} reference documents.\n\nexport const REFERENCE_BODIES: Record<string, { heading: string; content: string }> = ${JSON.stringify(Object.fromEntries(refEntries), null, 2)}\n`,
  )

  writeFileSync(
    join(OUT_DIR, 'assets.generated.ts'),
    `// GENERATED by scripts/sync-marketing-kit.mjs — do not edit by hand.\n// Source: ${REPO} (MIT). ${Object.keys(assetBodies).length} text assets.\n\nexport const ASSET_BODIES: Record<string, string> = ${JSON.stringify(assetBodies, null, 2)}\n`,
  )

  const totals = catalog.reduce((a, s) => a + s.bodyBytes, 0)
  console.log(`✓ ${catalog.length} skills · ${Object.keys(references).length} references · ${(totals / 1024).toFixed(0)} KB of playbook text`)
  console.log(`  → ${relative(ROOT, OUT_DIR)}`)

  if (src.includes(tmpdir())) rmSync(src, { recursive: true, force: true })
}

main()
