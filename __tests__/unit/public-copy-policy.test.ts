/**
 * What the public site may and may not say.
 *
 * These are not style checks. They encode two commercial decisions the business
 * made explicitly, and they exist because both were being violated:
 *
 *  1. **No internal scale figures.** How many AI agents we operate — or plan to
 *     operate — is internal. It was published on the homepage, the platform
 *     page, pricing, press, insights, work, the diagram gallery and the invoice
 *     line items. A prospect should judge what they receive, not a number that
 *     invites comparison with a competitor's number.
 *
 *  2. **No supply-chain provenance.** Where our delivery capability comes from,
 *     and how it is assembled, is confidential. The press page was printing an
 *     upstream repository URL and its licence next to our own product claims.
 *
 * A test is the right place for this because the rules are easy to forget when
 * someone adds a section six months from now, and the leak is silent.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())

/** Files whose rendered output a member of the public can reach. */
function publicFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      publicFiles(full, acc)
    } else if (/\.(tsx?|mdx?)$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const PUBLIC_COPY_FILES = [
  ...publicFiles(path.join(ROOT, 'src/components/site')),
  ...publicFiles(path.join(ROOT, 'src/components/agentos')),
]

/** Strip comments so a comment explaining the policy is not itself flagged. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('public copy does not disclose internal agent scale', () => {
  const offenders: string[] = []

  for (const file of PUBLIC_COPY_FILES) {
    const body = stripComments(readFileSync(file, 'utf8'))
    // A concrete count of agents, in any of the shapes it appeared in.
    const patterns = [
      /\b\d{2,}\s*(?:specified\s+)?AI\s+agents\b/i,
      /\b\d{2,}\s*(?:specified\s+)?agents\b/i,
      /\b\d{2,}\s*agents\s+(?:under|across)\b/i,
      /\bagents\s+across\s+\d+/i,
      /\bup to\s+\d+\s+(?:specified\s+)?agents\b/i,
    ]
    for (const re of patterns) {
      const hit = body.match(re)
      if (hit) offenders.push(`${path.relative(ROOT, file)}: "${hit[0]}"`)
    }
  }

  it('says nothing about how many agents exist or are planned', () => {
    expect(offenders, `Internal agent scale leaked into public copy:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('public copy does not disclose supply-chain provenance', () => {
  it('does not name an upstream repository or how capability is sourced', () => {
    const offenders: string[] = []
    for (const file of PUBLIC_COPY_FILES) {
      const body = stripComments(readFileSync(file, 'utf8'))
      const patterns = [
        /github\.com\/[a-z0-9-]+\/[a-z0-9-]+/i,
        /\bimported under its open licen[cs]e\b/i,
        /\bsourced from\b/i,
        /\bsupplied by\b/i,
        /\bresold\b/i,
        /\bwhite-?label(?:l?ed)?\s+by\b/i,
      ]
      for (const re of patterns) {
        const hit = body.match(re)
        if (hit) offenders.push(`${path.relative(ROOT, file)}: "${hit[0]}"`)
      }
    }
    expect(offenders, `Supply-chain provenance leaked into public copy:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('service pages carry the depth a buyer needs', () => {
  it('every service line has artwork, an audience, a process and a FAQ', async () => {
    const { SERVICE_LINES } = await import('@/lib/brand/service-lines')
    const { SERVICE_DEPTH } = await import('@/lib/brand/service-depth')

    const missing: string[] = []
    for (const line of SERVICE_LINES) {
      const depth = SERVICE_DEPTH[line.slug]
      if (!depth) { missing.push(`${line.slug}: no depth entry`); continue }
      if (!depth.visual?.motif) missing.push(`${line.slug}: no motif`)
      if (!depth.visual?.gradient?.length) missing.push(`${line.slug}: no gradient`)
      if (!depth.audience?.fit?.length) missing.push(`${line.slug}: no audience.fit`)
      if (!depth.audience?.notFit?.length) missing.push(`${line.slug}: no audience.notFit`)
      if (!depth.process?.length) missing.push(`${line.slug}: no process`)
      if (!depth.faq?.length) missing.push(`${line.slug}: no faq`)
      if (!depth.engagement?.startingPoint) missing.push(`${line.slug}: no engagement`)
    }
    expect(missing).toEqual([])
  })

  it('ships the artwork file each service page references', async () => {
    const { SERVICE_LINES } = await import('@/lib/brand/service-lines')
    const missing = SERVICE_LINES.filter((line) => {
      try {
        statSync(path.join(ROOT, 'public/services', `${line.slug}.webp`))
        return false
      } catch {
        return true
      }
    }).map((line) => line.slug)

    // A missing file is worse than no image: Next renders a broken <img> and
    // the page looks unfinished to exactly the reader we are trying to impress.
    expect(missing, `Run: node scripts/generate-service-art.mjs`).toEqual([])
  })

  it('never states a fixed price, only a range or a starting point', async () => {
    const { SERVICE_DEPTH } = await import('@/lib/brand/service-depth')
    for (const [slug, depth] of Object.entries(SERVICE_DEPTH)) {
      // A bare "$N" in the commercial copy would read as a quote. Ranges and
      // "from $N" are honest; a flat number is a promise we have not costed.
      expect(depth.engagement.typicalRange, `${slug} states a bare price`).not.toMatch(/^\s*\$\d/)
    }
  })
})
