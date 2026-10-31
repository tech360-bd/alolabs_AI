import { describe, expect, it } from 'vitest';
import {
  agentSkillStats,
  buildAgentSkillPrompt,
  canonicalSkillSlug,
  getAgentSkill,
  getAgentSkillCatalog,
  loadAgentSkillBodies,
  selectAgentSkills,
} from '@/lib/agent-skills';

describe('instruction-only agent skill pack', () => {
  it('catalogs pinned upstream skills without granting tools', () => {
    const catalog = getAgentSkillCatalog();
    const stats = agentSkillStats();
    expect(catalog.mode).toBe('instruction-only');
    expect(stats.total).toBe(catalog.skills.length);
    expect(stats.advisory).toBeGreaterThan(200);
    expect(stats.quarantined).toBeGreaterThan(100);
    for (const skill of catalog.skills) {
      expect(skill.grantsTools).toBe(false);
      expect(skill.scriptsImported).toBe(false);
      expect(skill.referencesImported).toBe(false);
      expect(skill.source.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(skill.source.url).toContain(skill.source.commit);
    }
  });

  it('normalizes legacy underscore skill slugs', () => {
    expect(canonicalSkillSlug('mattpocock_code-review')).toBe('mattpocock-code-review');
    expect(getAgentSkill('mattpocock_code-review')?.slug).toBe('mattpocock-code-review');
  });

  it('selects relevant advisory skills and rejects quarantined explicit requests', () => {
    const selection = selectAgentSkills('Review my TypeScript code for security bugs', { limit: 3 });
    expect(selection.selected.length).toBeGreaterThan(0);
    expect(selection.selected.every((skill) => skill.status === 'advisory')).toBe(true);

    const quarantined = getAgentSkillCatalog().skills.find((skill) => skill.status === 'quarantined');
    expect(quarantined).toBeDefined();
    const rejected = selectAgentSkills('run desktop automation', { explicitSlugs: [quarantined!.slug], limit: 5 });
    expect(rejected.selected.some((skill) => skill.slug === quarantined!.slug)).toBe(false);
    expect(rejected.rejected.some((item) => item.slug === quarantined!.slug)).toBe(true);
  });

  it('renders bounded guidance that cannot override tool policy', async () => {
    const built = await buildAgentSkillPrompt('Review my TypeScript code for security bugs', { limit: 2, maxChars: 8_000 });
    expect(built.skillsUsed.length).toBeGreaterThan(0);
    expect(built.prompt).toContain('TASK SKILL GUIDANCE');
    expect(built.prompt).toContain('tools granted: none');
    expect(built.prompt).toContain('Do not run shell commands');
    expect(built.prompt.length).toBeLessThanOrEqual(8_500);
  });

  it('does not load quarantined bodies unless explicitly requested for catalog installation', async () => {
    const quarantined = getAgentSkillCatalog().skills.find((skill) => skill.status === 'quarantined')!;
    const advisory = getAgentSkillCatalog().skills.find((skill) => skill.status === 'advisory')!;
    const safe = await loadAgentSkillBodies([quarantined, advisory]);
    expect(safe.some((skill) => skill.entry.slug === quarantined.slug)).toBe(false);
    const all = await loadAgentSkillBodies([quarantined], 1_000, true);
    expect(all.some((skill) => skill.entry.slug === quarantined.slug)).toBe(true);
  });
});
