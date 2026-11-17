/**
 * Dashboard localisation — English (default) + Bangla (bn-BD).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The master prompt requires "English default UI + Bangla localization". The
 * repository had no translation layer at all, so this module adds the smallest
 * honest one: a keyed dictionary with an explicit `en` fallback.
 *
 * SCOPE, STATED PLAINLY
 * ---------------------
 * Only strings that have actually been translated are listed here. Anything
 * missing falls back to the English source string — the UI never shows a raw
 * key or an empty label. Coverage today is the navigation chrome (group names
 * and the Voice & Contact Center views) plus the shared dashboard controls.
 * Panel bodies remain English; translating them is tracked work, not a claim
 * we make now.
 *
 * The Bangla entries are written for a Bangladeshi business audience and use
 * the standard technical loanwords where a forced translation would be less
 * clear to an operator (e.g. "CRM", "IVR", "ওয়েবহুক").
 */

export type Locale = 'en' | 'bn-BD'

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  // The native name is shown in the switcher regardless of the active locale.
  'bn-BD': 'বাংলা',
}

/** Every user-visible string the shell itself renders. */
const SHELL_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    'shell.search': 'Search views…',
    'shell.search.aria': 'Search dashboard views',
    'shell.search.empty': 'No views match “{query}”.',
    'shell.toggleSidebar': 'Toggle sidebar',
    'shell.theme': 'Toggle theme',
    'shell.logout': 'Sign out',
    'shell.language': 'Language',
    'shell.menu': 'Menu',
  },
  'bn-BD': {
    'shell.search': 'ভিউ খুঁজুন…',
    'shell.search.aria': 'ড্যাশবোর্ড ভিউ অনুসন্ধান করুন',
    'shell.search.empty': '“{query}” এর সাথে কোনো ভিউ মেলেনি।',
    'shell.toggleSidebar': 'সাইডবার দেখান/লুকান',
    'shell.theme': 'থিম পরিবর্তন',
    'shell.logout': 'সাইন আউট',
    'shell.language': 'ভাষা',
    'shell.menu': 'মেনু',
  },
}

/** Navigation group labels. Keys are the English labels in navigation.ts. */
const GROUP_LABELS: Record<string, string> = {
  'ALO Labs': 'ALO ল্যাবস',
  'Command Center': 'কমান্ড সেন্টার',
  Foundation: 'ফাউন্ডেশন',
  Governance: 'গভর্ন্যান্স',
  Intelligence: 'ইন্টেলিজেন্স',
  Workforce: 'ওয়ার্কফোর্স',
  Cognitive: 'কগনিটিভ',
  Collaboration: 'কোলাবোরেশন',
  Infrastructure: 'ইনফ্রাস্ট্রাকচার',
  'Marketing & Design': 'মার্কেটিং ও ডিজাইন',
  Identity: 'আইডেন্টিটি',
  Command: 'কমান্ড',
  Overview: 'ওভারভিউ',
  Operations: 'অপারেশনস',
  Management: 'ম্যানেজমেন্ট',
  'AI Hub': 'এআই হাব',
  Education: 'শিক্ষা',
  Build: 'বিল্ড',
  Finance: 'ফিন্যান্স',
  Security: 'সিকিউরিটি',
  Admin: 'অ্যাডমিন',
  Learning: 'লার্নিং',
  System: 'সিস্টেম',
  Marketing: 'মার্কেটিং',
  Automation: 'অটোমেশন',
  Data: 'ডেটা',
  Factory: 'ফ্যাক্টরি',
  Builders: 'বিল্ডারস',
  Studios: 'স্টুডিওস',
  'Voice & Contact Center': 'ভয়েস ও কন্টাক্ট সেন্টার',
}

/** View labels, keyed by nav item id so an English relabel can't break them. */
const VIEW_LABELS: Record<string, string> = {
  'voice-overview': 'কন্টাক্ট সেন্টার ড্যাশবোর্ড',
  'voice-numbers': 'ফোন নম্বর ম্যানেজার',
  'voice-calls': 'কল হিস্ট্রি ও কন্ট্রোল',
  'voice-agents': 'এআই ভয়েস এজেন্ট বিল্ডার',
  'voice-studio': 'ভয়েস স্টুডিও (TTS / ASR)',
  'voice-library': 'ভয়েস লাইব্রেরি ও ক্লোনিং',
  'voice-workspace': 'এজেন্ট ও সুপারভাইজার ওয়ার্কস্পেস',
  'voice-campaigns': 'ক্যাম্পেইন ও DNC',
  'voice-omni': 'শেয়ার্ড ইনবক্স',
  'voice-inbox': 'অমনিচ্যানেল ইনবক্স',
  'voice-routing': 'IVR, কিউ ও কর্মঘণ্টা',
  'voice-crm': 'CRM ও কাস্টমার ৩৬০',
  'voice-intelligence': 'কল ইন্টেলিজেন্স',
  'voice-supervisor': 'সুপারভাইজার ড্যাশবোর্ড',
  'voice-billing-api': 'ব্যবহার, বিলিং ও API',
}

/**
 * Translate a key. Unknown keys fall back to `fallback`, which callers pass as
 * the English source string, so the UI degrades to English rather than to a
 * key name. `{name}` placeholders are substituted from `vars`.
 */
export function t(
  locale: Locale,
  key: string,
  fallback?: string,
  vars?: Record<string, string | number>,
): string {
  const table = SHELL_STRINGS[locale] ?? SHELL_STRINGS.en
  let value = table[key] ?? SHELL_STRINGS.en[key] ?? fallback ?? key
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.split(`{${name}}`).join(String(replacement))
    }
  }
  return value
}

/** Localised navigation group label (falls back to English). */
export function navGroupLabel(locale: Locale, englishLabel: string): string {
  if (locale === 'en') return englishLabel
  return GROUP_LABELS[englishLabel] ?? englishLabel
}

/** Localised nav item label, preferring the stable view id. */
export function navItemLabel(locale: Locale, id: string, englishLabel: string): string {
  if (locale === 'en') return englishLabel
  return VIEW_LABELS[id] ?? englishLabel
}

/**
 * Coverage report for the settings/health surface. States the real number of
 * translated strings instead of implying the whole product is localised.
 */
export function localeCoverage() {
  return {
    locales: Object.keys(SHELL_STRINGS) as Locale[],
    defaultLocale: DEFAULT_LOCALE,
    translatedViewLabels: Object.keys(VIEW_LABELS).length,
    translatedGroupLabels: Object.keys(GROUP_LABELS).length,
    translatedShellStrings: Object.keys(SHELL_STRINGS['bn-BD']).length,
    note: 'Panel body copy is still English. Only navigation chrome and the Voice & Contact Center views are translated.',
  }
}
