// @vitest-environment node
/**
 * MySQL schema artifacts — static invariants.
 *
 * `scripts/generate-mysql-schema.ts` emits TWO artifacts from
 * `prisma/schema.prisma`:
 *  - schema.mysql.prisma       canonical: client source; TEXT fields keep
 *                              their `@default(...)` (the client applies it).
 *  - schema.mysql.push.prisma  DDL variant: `prisma db push` source; MySQL 8
 *                              refuses literal DEFAULTs on TEXT columns, so
 *                              they must be stripped here — and ONLY here.
 *
 * Regression: commit 43481a8 (2026-11-18) added a full-schema `db push` gate
 * to mysql.yml; the canonical schema's TEXT defaults made every run fail with
 * "BLOB, TEXT, GEOMETRY or JSON column can't have a default value" until the
 * DDL variant was introduced.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TEXT_LINE = /^\s+\w+\s+String\??[^@]*@db\.(LongText|MediumText|TinyText|Text)/;

function textDefaultLines(schemaPath: string): string[] {
  return readFileSync(schemaPath, 'utf8')
    .split('\n')
    .filter((line) => TEXT_LINE.test(line) && /@default\(/.test(line));
}

describe('MySQL schema artifacts', () => {
  it('canonical schema keeps TEXT defaults (client-side defaulting must not regress)', () => {
    expect(textDefaultLines('prisma/schema.mysql.prisma').length).toBeGreaterThan(50);
    // A known critical large-text field: its default AND LongText type survive.
    const content = readFileSync('prisma/schema.mysql.prisma', 'utf8');
    expect(content).toMatch(/deployLog\s+String @db\.LongText\s+@default\("\[\]"\)/);
  });

  it('DDL push variant strips every TEXT default (MySQL 8 legality)', () => {
    const offenders = textDefaultLines('prisma/schema.mysql.push.prisma');
    expect(offenders, `TEXT+DEFAULT lines must not survive in the push variant:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('push variant differs from canonical ONLY on TEXT-default lines', () => {
    const canonical = readFileSync('prisma/schema.mysql.prisma', 'utf8').split('\n');
    const push = readFileSync('prisma/schema.mysql.push.prisma', 'utf8').split('\n');
    expect(push.length).toBe(canonical.length);
    const diffIndices: number[] = [];
    canonical.forEach((line, i) => {
      if (line !== push[i]) diffIndices.push(i);
    });
    expect(diffIndices.length).toBeGreaterThan(0);
    for (const i of diffIndices) {
      expect(canonical[i], `line ${i + 1} must be a TEXT line in the canonical schema`).toMatch(TEXT_LINE);
      expect(canonical[i]).toMatch(/@default\(/);
      expect(push[i], `line ${i + 1}: only the @default may differ`).toBe(canonical[i].replace(/\s*@default\((?:"[^"]*"|'[^']*'|[^)\s]*)\)/, ''));
    }
  });
});
