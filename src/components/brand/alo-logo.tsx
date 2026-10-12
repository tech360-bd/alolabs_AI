'use client'

/**
 * AloLabsLogo — the official lockups.
 *
 * The mark is inline SVG (crisp at every size, print-safe, themeable) and the
 * wordmark is set as real text in Poppins/Inter so it always uses the licensed
 * brand faces and stays selectable and accessible. Variants match the guideline
 * sheet: horizontal, stacked, icon-only, wordmark-only.
 */

import * as React from 'react'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { cn } from '@/lib/utils'

export type LogoVariant = 'horizontal' | 'stacked' | 'mark' | 'wordmark' | 'badge'

export interface AloLabsLogoProps {
  variant?: LogoVariant
  /** Height of the mark in px; the wordmark scales from it. */
  size?: number
  /** `dark` is for placement on the dark paper ground. */
  theme?: 'light' | 'dark'
  /** Show “AI AGENT OPERATING SYSTEM” under the wordmark. */
  tagline?: boolean
  className?: string
  /** Alt text; pass "" when the logo sits next to a visible product name. */
  title?: string
}

export function AloLabsLogo({
  variant = 'horizontal',
  size = 40,
  theme = 'light',
  tagline = true,
  className,
  title = 'ALO Labs AgentOS',
}: AloLabsLogoProps) {
  const mark = <Mark size={size} />
  const words = <Words size={size} theme={theme} tagline={tagline} />

  if (variant === 'mark') return <span className={cn('inline-flex', className)} aria-label={title} role="img">{mark}</span>
  if (variant === 'wordmark') return <span className={cn('inline-flex', className)} aria-label={title} role="img">{words}</span>
  if (variant === 'badge') return <span className={cn('inline-flex', className)} aria-label={title} role="img"><Badge size={size * 3} /></span>

  return (
    <span
      className={cn('inline-flex items-center gap-3', variant === 'stacked' && 'flex-col gap-2', className)}
      role="img"
      aria-label={title}
    >
      {mark}
      {words}
    </span>
  )
}

/** The hexagon shell with the folded-ribbon A and the orange bar. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="aloLogoLegL" x1="0.1" y1="0.1" x2="0.6" y2="1">
          <stop offset="0" stopColor={BRAND.blueLight} />
          <stop offset="1" stopColor="#0047A1" />
        </linearGradient>
        <linearGradient id="aloLogoLegR" x1="0.9" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={BRAND.blue} />
          <stop offset="1" stopColor={BRAND.blueDeep} />
        </linearGradient>
        <linearGradient id="aloLogoFold" x1="0" y1="1" x2="1" y2="0.1">
          <stop offset="0" stopColor="#0053C8" />
          <stop offset="1" stopColor={BRAND.blueLight} />
        </linearGradient>
        <linearGradient id="aloLogoBar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND.orangeLight} />
          <stop offset="1" stopColor={BRAND.orange} />
        </linearGradient>
      </defs>
      <path
        d="M120 22 L210 73 L210 167 L120 218 L30 167 L30 73 Z"
        fill="none"
        stroke={BRAND.orange}
        strokeWidth={16}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M120 56 L70 184 L102 184 L132 88 Z" fill="url(#aloLogoLegL)" />
      <path d="M120 56 L170 184 L138 184 L108 88 Z" fill="url(#aloLogoLegR)" />
      <path d="M62 146 L152 118 L152 148 L94 174 Z" fill="url(#aloLogoFold)" />
      <path d="M62 146 L152 148 L94 174 Z" fill={BRAND.blueDeep} opacity={0.28} />
      <g transform="rotate(-9 128 168)">
        <rect x="102" y="155" width="52" height="26" rx="13" fill="url(#aloLogoBar)" />
      </g>
    </svg>
  )
}

function Words({
  size,
  theme,
  tagline,
}: {
  size: number
  theme: 'light' | 'dark'
  tagline: boolean
}) {
  const nameSize = Math.max(13, size * 0.5)
  const productSize = Math.max(16, size * 0.58)
  const tagSize = Math.max(8, size * 0.19)
  return (
    <span className="inline-flex flex-col leading-none" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
      <span style={{ fontSize: nameSize, fontWeight: 600, color: BRAND.orange, letterSpacing: '0.01em' }}>
        {COMPANY.legalName}
      </span>
      <span
        style={{
          fontSize: productSize,
          fontWeight: 700,
          color: theme === 'dark' ? BRAND.white : BRAND.blue,
          letterSpacing: '0.03em',
          marginTop: size * 0.06,
        }}
      >
        {COMPANY.product.toUpperCase()}
      </span>
      {tagline ? (
        <span
          style={{
            fontFamily: BRAND_FONTS.primary.stack,
            fontSize: tagSize,
            fontWeight: 500,
            letterSpacing: '0.16em',
            color: theme === 'dark' ? '#B9C3D6' : BRAND.gray,
            marginTop: size * 0.1,
          }}
        >
          {COMPANY.tagline.toUpperCase()}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Circular badge — the emblem from the brand sheet: circuit traces, the rim
 * swooshes, the mark, then the stacked wordmark over a hairline rule with the
 * orange dot. Used as a seal (documents, certificates, the site footer).
 */
export function Badge({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="aloBadgeLegL" x1="0.1" y1="0.1" x2="0.6" y2="1">
          <stop offset="0" stopColor={BRAND.blueLight} /><stop offset="1" stopColor="#0047A1" />
        </linearGradient>
        <linearGradient id="aloBadgeLegR" x1="0.9" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={BRAND.blue} /><stop offset="1" stopColor={BRAND.blueDeep} />
        </linearGradient>
        <linearGradient id="aloBadgeFold" x1="0" y1="1" x2="1" y2="0.1">
          <stop offset="0" stopColor="#0053C8" /><stop offset="1" stopColor={BRAND.blueLight} />
        </linearGradient>
        <linearGradient id="aloBadgeWord" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor={BRAND.blue} /><stop offset="1" stopColor={BRAND.blueLight} />
        </linearGradient>
        <clipPath id="aloBadgeClip"><circle cx="256" cy="256" r="252" /></clipPath>
      </defs>

      <circle cx="256" cy="256" r="252" fill="#FFFFFF" />
      <g clipPath="url(#aloBadgeClip)" stroke={BRAND.tintLine} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M-10 150 H70 l26 26 H150" />
        <path d="M-10 210 H44 l30 30 H118" />
        <path d="M-10 268 H60 l24-24 H132" />
        <path d="M-10 330 H74 l28 28 H146" />
        <path d="M522 140 H452 l-26 26 H372" />
        <path d="M522 200 H470 l-30 30 H398" />
        <path d="M522 262 H462 l-24-24 H392" />
        <path d="M522 326 H446 l-28 28 H368" />
      </g>
      <g clipPath="url(#aloBadgeClip)" fill={BRAND.tintLine}>
        <circle cx="152" cy="176" r="6" /><circle cx="120" cy="240" r="6" /><circle cx="134" cy="244" r="6" />
        <circle cx="148" cy="358" r="6" /><circle cx="370" cy="166" r="6" /><circle cx="396" cy="230" r="6" />
        <circle cx="390" cy="238" r="6" /><circle cx="366" cy="354" r="6" />
      </g>
      <g clipPath="url(#aloBadgeClip)" fill="none" strokeLinecap="round">
        <path d="M64 120 A252 252 0 0 1 196 32" stroke={BRAND.orange} strokeWidth="7" />
        <path d="M470 84 A252 252 0 0 1 502 210" stroke={BRAND.blueLight} strokeWidth="6" />
      </g>
      <g clipPath="url(#aloBadgeClip)">
        <path d="M120 470 A252 252 0 0 0 392 470 A300 300 0 0 1 120 470 Z" fill={BRAND.orange} />
        <path d="M96 452 A252 252 0 0 0 416 452 A330 330 0 0 1 96 452 Z" fill={BRAND.blue} opacity={0.92} />
      </g>
      <circle cx="256" cy="256" r="252" fill="none" stroke={BRAND.tintLine} strokeWidth="2" />

      <g transform="translate(0 -14)">
        <path d="M256 62 L334 106 L334 188 L256 232 L178 188 L178 106 Z"
              fill="none" stroke={BRAND.orange} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" />
        <path d="M256 90 L214 200 L240 200 L266 118 Z" fill="url(#aloBadgeLegL)" />
        <path d="M256 90 L298 200 L272 200 L246 118 Z" fill="url(#aloBadgeLegR)" />
        <path d="M206 166 L284 142 L284 168 L234 190 Z" fill="url(#aloBadgeFold)" />
        <path d="M206 166 L284 168 L234 190 Z" fill={BRAND.blueDeep} opacity={0.26} />
        <g transform="rotate(-9 262 186)">
          <rect x="240" y="174" width="44" height="22" rx="11" fill={BRAND.orange} />
        </g>
      </g>

      <text x="256" y="322" textAnchor="middle" fontFamily={BRAND_FONTS.secondary.stack} fontSize="46" fontWeight="600" fill={BRAND.orange}>
        ALO Labs
      </text>
      <text x="256" y="378" textAnchor="middle" fontFamily={BRAND_FONTS.secondary.stack} fontSize="52" fontWeight="700" letterSpacing="1.2" fill="url(#aloBadgeWord)">
        AGENTOS
      </text>
      <path d="M136 400 H246" stroke={BRAND.blue} strokeWidth="2" />
      <path d="M266 400 H376" stroke={BRAND.blue} strokeWidth="2" />
      <circle cx="256" cy="400" r="6" fill={BRAND.orange} />
      <text x="256" y="432" textAnchor="middle" fontFamily={BRAND_FONTS.primary.stack} fontSize="20" fontWeight="600" letterSpacing="5.4" fill={BRAND.gray}>
        AI AGENT OPERATING SYSTEM
      </text>
    </svg>
  )
}

/** Hairline rule with the orange dot — the divider used under the stacked wordmark. */
export function BrandRule({ width = 160, className }: { width?: number; className?: string }) {
  return (
    <svg width={width} height="12" viewBox="0 0 160 12" fill="none" className={className} aria-hidden="true">
      <path d={`M0 6 H${width / 2 - 10}`} stroke={BRAND.blue} strokeWidth="2" />
      <path d={`M${width / 2 + 10} 6 H${width}`} stroke={BRAND.blue} strokeWidth="2" />
      <circle cx={width / 2} cy="6" r="5" fill={BRAND.orange} />
    </svg>
  )
}

/** Decorative ribbon used on section headers and the invoice. */
export function BrandRibbon({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-1 w-16 rounded-full', className)}
      style={{ background: `linear-gradient(90deg, ${BRAND.orange} 0%, ${BRAND.blue} 100%)` }}
      aria-hidden="true"
    />
  )
}
