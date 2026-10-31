#!/usr/bin/env node
/** Dependency-free verification for the generated instruction-only skill pack. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/agent-skills');
const catalog = JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8'));
const generatedCatalog = readFileSync(join(OUT, 'catalog.generated.ts'), 'utf8');
const problems = [];
if (!generatedCatalog.endsWith(`${JSON.stringify(catalog)};\n`)) problems.push('catalog.generated.ts does not match catalog.json');
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

if (catalog.mode !== 'instruction-only') problems.push('catalog mode is not instruction-only');
if (catalog.totalSkills !== catalog.skills.length) problems.push('totalSkills mismatch');
if (catalog.advisorySkills !== catalog.skills.filter((s) => s.status === 'advisory').length) problems.push('advisory count mismatch');
if (catalog.quarantinedSkills !== catalog.skills.filter((s) => s.status === 'quarantined').length) problems.push('quarantined count mismatch');
const slugs = new Set();
for (const skill of catalog.skills) {
  if (slugs.has(skill.slug)) problems.push(`duplicate slug ${skill.slug}`);
  slugs.add(skill.slug);
  if (skill.grantsTools !== false) problems.push(`${skill.slug} grants tools`);
  if (skill.scriptsImported !== false || skill.referencesImported !== false) problems.push(`${skill.slug} imports scripts/references`);
  if (!/^[a-f0-9]{40}$/.test(skill.source.commit)) problems.push(`${skill.slug} missing pinned commit`);
  if (!skill.source.url.includes(skill.source.commit)) problems.push(`${skill.slug} source URL not pinned`);
  if (!existsSync(join(OUT, 'licenses', `${skill.source.id}-LICENSE.txt`))) problems.push(`${skill.slug} missing license file`);
}

const bodiesBySource = new Map();
for (const source of catalog.sources) {
  const file = join(OUT, 'content', `${source.id}.generated.ts`);
  if (!existsSync(file)) { problems.push(`missing content module ${source.id}`); continue; }
  const mod = await import(file);
  bodiesBySource.set(source.id, mod.SKILL_BODIES);
  const expected = catalog.skills.filter((s) => s.source.id === source.id);
  if (Object.keys(mod.SKILL_BODIES).length !== expected.length) problems.push(`${source.id} body count mismatch`);
}
for (const skill of catalog.skills) {
  const body = bodiesBySource.get(skill.source.id)?.[skill.slug];
  if (typeof body !== 'string') { problems.push(`${skill.slug} missing body`); continue; }
  if (sha256(body) !== skill.bodySha256) problems.push(`${skill.slug} body hash mismatch`);
  if (Buffer.byteLength(body, 'utf8') !== skill.bodyBytes) problems.push(`${skill.slug} body byte count mismatch`);
}

const mod = await import(join(OUT, 'index.ts'));
const stats = mod.agentSkillStats();
if (stats.total !== catalog.totalSkills) problems.push('runtime stats mismatch');
const quarantined = catalog.skills.find((s) => s.status === 'quarantined');
if (quarantined) {
  const selection = mod.selectAgentSkills('test', { explicitSlugs: [quarantined.slug], limit: 5 });
  if (selection.selected.some((s) => s.slug === quarantined.slug)) problems.push('quarantined skill was selected');
  if (!selection.rejected.some((r) => r.slug === quarantined.slug)) problems.push('quarantined skill was not rejected');
}
const built = await mod.buildAgentSkillPrompt('Review TypeScript code for security bugs', { limit: 2 });
if (!built.prompt.includes('TASK SKILL GUIDANCE')) problems.push('skill prompt missing governance header');
if (built.prompt.length > 14_500) problems.push('skill prompt exceeded budget');
if (built.skillsUsed.length === 0) problems.push('expected at least one advisory skill for code review task');

const result = {
  status: problems.length === 0 ? 'PASS' : 'FAIL',
  totalSkills: catalog.totalSkills,
  advisorySkills: catalog.advisorySkills,
  quarantinedSkills: catalog.quarantinedSkills,
  sources: catalog.sources.length,
  checkedAt: new Date().toISOString(),
  problems,
};
console.log(JSON.stringify(result, null, 2));
if (problems.length > 0) process.exit(1);
