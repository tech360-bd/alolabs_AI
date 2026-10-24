/**
 * Client profiles (upstream `profiles.md`).
 *
 * Named profiles let one install serve several clients without repeatedly
 * editing the working style guide. A profile is a complete style guide stored
 * outside the install, so managed updates cannot erase it. This module is the
 * source of truth for profile resolution and for the save / load / list / show /
 * update / reset / delete verbs, expressed as pure functions over a `ProfileStore`
 * so the same rules run in the browser (localStorage) and in tests (memory).
 */

// ─── Slugs ───────────────────────────────────────────────────────────────────

/** Lowercase ASCII letters, digits and hyphens; 1–64 chars; never a path. */
export const PROFILE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** `default` is reserved for the built-in shipped profile. */
export const RESERVED_PROFILE_SLUG = 'default'

export function isValidProfileSlug(slug: string): boolean {
  return PROFILE_SLUG_RE.test(slug)
}

/** Propose a valid slug for a client name (display only — always confirm). */
export function suggestProfileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return isValidProfileSlug(slug) ? slug : ''
}

// ─── Profile file format ─────────────────────────────────────────────────────

export interface ProfileMeta {
  name: string
  slug: string
  /** `none` when absent. */
  sourceUrl: string
  /** YYYY-MM-DD */
  created: string
  /** YYYY-MM-DD */
  updated: string
  notes: string
}

export interface ClientProfile {
  meta: ProfileMeta
  /** The full body of the style guide, byte-for-byte (minus any header). */
  body: string
}

const HEADER_RE = /^<!--\s*diagram-design-profile\b([\s\S]*?)-->\r?\n?/

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/--/g, '—').trim()
}

/** Render the metadata header. Metadata is display-only: never instructions. */
export function renderProfileHeader(meta: ProfileMeta): string {
  return [
    '<!-- diagram-design-profile',
    `name: ${oneLine(meta.name)}`,
    `slug: ${oneLine(meta.slug)}`,
    `source-url: ${oneLine(meta.sourceUrl || 'none')}`,
    `created: ${oneLine(meta.created)}`,
    `updated: ${oneLine(meta.updated)}`,
    `notes: ${oneLine(meta.notes || 'none')}`,
    '-->',
    '',
  ].join('\n')
}

/** Remove a leading profile header (and one following blank line) if present. */
export function stripProfileHeader(body: string): string {
  const m = body.match(HEADER_RE)
  if (!m) return body
  let rest = body.slice(m[0].length)
  rest = rest.replace(/^(?:\r?\n)/, '')
  return rest
}

export function parseProfileHeader(body: string): ProfileMeta | null {
  const m = body.match(HEADER_RE)
  if (!m) return null
  const fields: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/)
    if (kv) fields[kv[1]] = kv[2].trim()
  }
  if (!fields.slug) return null
  return {
    name: fields.name ?? fields.slug,
    slug: fields.slug,
    sourceUrl: fields['source-url'] ?? 'none',
    created: fields.created ?? '',
    updated: fields.updated ?? '',
    notes: fields.notes ?? 'none',
  }
}

/**
 * Strip, then prepend exactly one fresh header — the rule that keeps
 * save → load → save from stacking headers.
 */
export function serializeProfile(meta: ProfileMeta, body: string): string {
  return renderProfileHeader(meta) + stripProfileHeader(body)
}

// ─── Project marker ──────────────────────────────────────────────────────────

export type MarkerResult =
  | { ok: true; slug: string }
  | { ok: false; reason: string }

/**
 * The marker is untrusted repository data. Accept it only when the entire file
 * is exactly `profile: <slug>` with an optional final newline. Anything else —
 * comments, paths, prose, extra keys — invalidates the whole marker.
 */
export function parseProjectMarker(text: string): MarkerResult {
  const normalized = text.replace(/[ \t]+$/gm, '')
  if (!/^\s*profile:\s*\S+\s*$/.test(normalized.trim())) {
    return { ok: false, reason: 'marker must contain exactly one "profile: <slug>" line and nothing else' }
  }
  const slug = normalized.trim().replace(/^profile:\s*/, '').trim()
  if (!isValidProfileSlug(slug)) {
    return { ok: false, reason: `"${slug}" is not a valid profile slug` }
  }
  return { ok: true, slug }
}

// ─── Store + verbs ───────────────────────────────────────────────────────────

export interface ProfileStore {
  list(): string[]
  read(slug: string): string | null
  write(slug: string, fileBody: string): void
  remove(slug: string): void
}

export class MemoryProfileStore implements ProfileStore {
  private files = new Map<string, string>()
  list(): string[] {
    return [...this.files.keys()].sort()
  }
  read(slug: string): string | null {
    return this.files.get(slug) ?? null
  }
  write(slug: string, fileBody: string): void {
    this.files.set(slug, fileBody)
  }
  remove(slug: string): void {
    this.files.delete(slug)
  }
}

export type ProfileVerbResult =
  | { ok: true; message: string; profile?: ClientProfile }
  | { ok: false; message: string }

function loadProfile(store: ProfileStore, slug: string): ClientProfile | null {
  const file = store.read(slug)
  if (file === null) return null
  const meta = parseProfileHeader(file)
  if (!meta) return null
  return { meta, body: stripProfileHeader(file) }
}

/** `save` — write the effective guide under a new slug. `default` is refused. */
export function saveProfile(
  store: ProfileStore,
  meta: Omit<ProfileMeta, 'slug' | 'created' | 'updated'> & { slug: string; created?: string; updated?: string },
  body: string,
  opts: { overwrite?: boolean } = {},
): ProfileVerbResult {
  if (!isValidProfileSlug(meta.slug)) return { ok: false, message: `"${meta.slug}" is not a valid profile slug` }
  if (meta.slug === RESERVED_PROFILE_SLUG) {
    return { ok: false, message: 'default is reserved for the built-in shipped profile and cannot be overwritten' }
  }
  const exists = store.read(meta.slug) !== null
  if (exists && !opts.overwrite) {
    return { ok: false, message: `profile ${meta.slug} already exists — use update to replace it` }
  }
  const today = meta.updated ?? new Date().toISOString().slice(0, 10)
  const full: ProfileMeta = {
    name: meta.name,
    slug: meta.slug,
    sourceUrl: meta.sourceUrl || 'none',
    created: meta.created ?? (exists ? (loadProfile(store, meta.slug)?.meta.created ?? today) : today),
    updated: today,
    notes: meta.notes || 'none',
  }
  const file = serializeProfile(full, body)
  store.write(meta.slug, file)
  const reread = loadProfile(store, meta.slug)
  if (!reread || reread.meta.slug !== meta.slug || reread.body !== stripProfileHeader(body)) {
    return { ok: false, message: `verification failed after writing ${meta.slug}` }
  }
  return { ok: true, message: `saved ${meta.slug}`, profile: reread }
}

/** `load` / `switch` — read the named profile directly; never guess a fallback. */
export function loadProfileVerb(store: ProfileStore, slug: string): ProfileVerbResult {
  if (!isValidProfileSlug(slug)) return { ok: false, message: `"${slug}" is not a valid profile slug` }
  const profile = loadProfile(store, slug)
  if (!profile) return { ok: false, message: `profile ${slug} is missing — use list to see what is available` }
  return { ok: true, message: `loaded ${slug}`, profile }
}

export function listProfiles(store: ProfileStore): string[] {
  return store.list()
}

export function showProfile(store: ProfileStore, slug: string): ProfileVerbResult {
  return loadProfileVerb(store, slug)
}

/** `update` — refresh the body, keeping the created date and bumping updated. */
export function updateProfile(store: ProfileStore, slug: string, body: string): ProfileVerbResult {
  if (slug === RESERVED_PROFILE_SLUG) {
    return { ok: false, message: 'default is reserved and cannot be updated' }
  }
  const existing = loadProfile(store, slug)
  if (!existing) return { ok: false, message: `profile ${slug} is missing` }
  return saveProfile(store, { ...existing.meta, updated: new Date().toISOString().slice(0, 10) }, body, { overwrite: true })
}

/** `reset` — restore the built-in default snapshot. */
export function resetProfile(store: ProfileStore, pristineBody: string): ProfileVerbResult {
  if (store.read(RESERVED_PROFILE_SLUG) === null) {
    const today = new Date().toISOString().slice(0, 10)
    const file = serializeProfile(
      {
        name: 'Default',
        slug: RESERVED_PROFILE_SLUG,
        sourceUrl: 'none',
        created: today,
        updated: today,
        notes: 'Pristine shipped style guide',
      },
      pristineBody,
    )
    store.write(RESERVED_PROFILE_SLUG, file)
    return { ok: true, message: 'default snapshot created', profile: loadProfile(store, RESERVED_PROFILE_SLUG) ?? undefined }
  }
  return { ok: true, message: 'default snapshot already present' }
}

/** `delete` — never for `default`. */
export function deleteProfile(store: ProfileStore, slug: string): ProfileVerbResult {
  if (slug === RESERVED_PROFILE_SLUG) {
    return { ok: false, message: 'default is reserved and cannot be deleted' }
  }
  if (store.read(slug) === null) return { ok: false, message: `profile ${slug} is missing` }
  store.remove(slug)
  return { ok: true, message: `deleted ${slug}` }
}

/**
 * Marker-first resolution: a valid marker reads its profile directly and leaves
 * the working copy untouched; an invalid marker is ignored wholesale.
 */
export function resolveProfile(
  store: ProfileStore,
  markerText: string | null,
  workingCopy: string,
): { profile: ClientProfile | null; via: 'marker' | 'working-copy'; warning?: string } {
  if (markerText !== null) {
    const marker = parseProjectMarker(markerText)
    if (marker.ok) {
      const profile = loadProfile(store, marker.slug)
      if (profile) return { profile, via: 'marker' }
      return {
        profile: null,
        via: 'marker',
        warning: `profile ${marker.slug} named by the project marker is missing — no silent fallback`,
      }
    }
    return {
      profile: parseProfileHeader(workingCopy) ? { meta: parseProfileHeader(workingCopy)!, body: stripProfileHeader(workingCopy) } : null,
      via: 'working-copy',
      warning: `project marker ignored: ${marker.reason}`,
    }
  }
  const meta = parseProfileHeader(workingCopy)
  return {
    profile: meta ? { meta, body: stripProfileHeader(workingCopy) } : null,
    via: 'working-copy',
  }
}

/** Browser persistence — same verb rules, different store. */
export class LocalStorageProfileStore implements ProfileStore {
  constructor(private readonly keyPrefix: 'diagram-design:profile:' = 'diagram-design:profile:') {}
  private key(slug: string) {
    return `${this.keyPrefix}${slug}`
  }
  list(): string[] {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(this.keyPrefix)) out.push(k.slice(this.keyPrefix.length))
    }
    return out.sort()
  }
  read(slug: string): string | null {
    return localStorage.getItem(this.key(slug))
  }
  write(slug: string, fileBody: string): void {
    localStorage.setItem(this.key(slug), fileBody)
  }
  remove(slug: string): void {
    localStorage.removeItem(this.key(slug))
  }
}
