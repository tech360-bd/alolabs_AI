import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  localeCoverage,
  navGroupLabel,
  navItemLabel,
  t,
} from '@/lib/dashboard/i18n';
import { DASHBOARD_NAV } from '@/lib/dashboard/navigation';

describe('dashboard localisation (en default, bn-BD)', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(Object.keys(LOCALE_LABELS).sort()).toEqual(['bn-BD', 'en']);
  });

  it('returns the English source string unchanged in the default locale', () => {
    expect(t('en', 'shell.search', 'Search views…')).toBe('Search views…');
    expect(navGroupLabel('en', 'Voice & Contact Center')).toBe('Voice & Contact Center');
    expect(navItemLabel('en', 'voice-crm', 'CRM & Customer 360')).toBe('CRM & Customer 360');
  });

  it('translates shell strings and interpolates placeholders', () => {
    const bn = t('bn-BD', 'shell.search', 'Search views…');
    expect(bn).not.toBe('Search views…');
    expect(bn).toMatch(/[\u0980-\u09FF]/);
    const empty = t('bn-BD', 'shell.search.empty', 'No views match "{query}".', { query: 'কিউ' });
    expect(empty).toContain('কিউ');
    expect(empty).not.toContain('{query}');
  });

  it('falls back to the English source for unknown keys instead of leaking a key name', () => {
    expect(t('bn-BD', 'nope.not.a.key', 'Fallback text')).toBe('Fallback text');
    expect(navItemLabel('bn-BD', 'not-a-view', 'Untranslated View')).toBe('Untranslated View');
    expect(navGroupLabel('bn-BD', 'Not A Group')).toBe('Not A Group');
  });

  it('translates the whole Voice & Contact Center group without gaps', () => {
    const voice = DASHBOARD_NAV.find((g) => g.label === 'Voice & Contact Center');
    expect(voice).toBeDefined();
    expect(voice!.items.length).toBeGreaterThanOrEqual(15);
    for (const item of voice!.items) {
      const bn = navItemLabel('bn-BD', item.id, item.label);
      expect(bn, `${item.id} must have a Bangla label`).not.toBe(item.label);
      expect(bn).toMatch(/[\u0980-\u09FF]/);
    }
    expect(navGroupLabel('bn-BD', 'Voice & Contact Center')).toBe('ভয়েস ও কন্টাক্ট সেন্টার');
  });

  it('translates every navigation group and never returns an empty label', () => {
    for (const group of DASHBOARD_NAV) {
      const bn = navGroupLabel('bn-BD', group.label);
      expect(bn.trim().length).toBeGreaterThan(0);
      expect(bn).not.toBe(group.label);
    }
  });

  it('reports honest coverage numbers rather than claiming full localisation', () => {
    const coverage = localeCoverage();
    expect(coverage.defaultLocale).toBe('en');
    expect(coverage.locales).toContain('bn-BD');
    expect(coverage.translatedViewLabels).toBeGreaterThanOrEqual(15);
    expect(coverage.note).toMatch(/English/i);
  });
});
