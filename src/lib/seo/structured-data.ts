/**
 * Structured data for the public site.
 *
 * There was no JSON-LD anywhere in the repository before this file, so search
 * engines and AI crawlers had no machine-readable statement of who ALO Labs is,
 * what it sells or how the pages relate. Each builder here is pure data so it
 * can be unit-tested without rendering a page.
 *
 * Only public facts go in: no internal routes, no tenant data, no counts we
 * cannot stand behind. `areaServed` and the service list come from the same
 * SERVICE_LINES source the pages render, so schema and copy cannot diverge.
 */

import { PUBLIC_COMPANY, PUBLIC_ORIGIN } from '@/lib/brand/agentos-3d'
import { SERVICE_LINES } from '@/lib/brand/service-lines'

export interface Crumb {
  href: string
  label: string
}

/** Absolute URL for a site path, so canonicals and JSON-LD agree. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${PUBLIC_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${PUBLIC_ORIGIN}/#organization`,
    name: PUBLIC_COMPANY.name,
    legalName: PUBLIC_COMPANY.legalName,
    url: PUBLIC_ORIGIN,
    logo: absoluteUrl('/brand/alo-agentos-badge.webp'),
    image: absoluteUrl('/brand/alo-agentos-badge.webp'),
    description: PUBLIC_COMPANY.description,
    email: PUBLIC_COMPANY.email,
    foundingLocation: { '@type': 'Place', addressCountry: PUBLIC_COMPANY.addressCountry },
    areaServed: PUBLIC_COMPANY.areaServed,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: PUBLIC_COMPANY.email,
        url: absoluteUrl('/site/contact'),
        availableLanguage: ['en', 'bn'],
      },
    ],
    knowsAbout: SERVICE_LINES.map((s) => s.name),
    sameAs: [],
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${PUBLIC_ORIGIN}/#website`,
    url: PUBLIC_ORIGIN,
    name: PUBLIC_COMPANY.name,
    description: PUBLIC_COMPANY.description,
    publisher: { '@id': `${PUBLIC_ORIGIN}/#organization` },
    inLanguage: 'en',
  }
}

/**
 * A service as schema.org understands it.
 *
 * `urlPath` exists because the same builder serves two different page families:
 * service lines live at `/site/services/<slug>` and business solutions at
 * `/site/solutions/<slug>`. Emitting the services URL for a solution would
 * point structured data at the wrong page — the one failure mode a canonical
 * URL must not have — so the path is a parameter, defaulting to the service
 * route for every caller that predates it.
 */
export function serviceSchema(service: { name: string; tagline: string; slug: string; urlPath?: string }) {
  const path = service.urlPath ?? `/site/services/${service.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.tagline,
    url: absoluteUrl(path),
    provider: { '@id': `${PUBLIC_ORIGIN}/#organization` },
    areaServed: PUBLIC_COMPANY.areaServed,
    serviceType: service.name,
    mainEntityOfPage: absoluteUrl(path),
  }
}

/** All twelve lines as an ItemList, for the services index. */
export function serviceCatalogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'ALO Labs services',
    numberOfItems: SERVICE_LINES.length,
    itemListElement: SERVICE_LINES.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      url: absoluteUrl(`/site/services/${s.slug}`),
    })),
  }
}

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: absoluteUrl(c.href),
    })),
  }
}

/**
 * Render a schema object as a Next.js `<script>` payload.
 *
 * `JSON.stringify` output is escaped for `<` so a string containing `</script>`
 * cannot terminate the block early and inject markup. This matters because the
 * payload includes copy that is editable, and an unescaped injection here would
 * be a stored XSS vector on a public page.
 */
export function jsonLd(graph: object | object[]): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c')
}
