import type { Metadata } from 'next'
import Link from 'next/link'
import { Mark } from '@/components/brand/alo-logo'

export const metadata: Metadata = {
  title: 'Page not found — ALO Labs',
  description: 'The page you were looking for does not exist.',
  robots: { index: false },
}

/**
 * Custom 404 — brand-consistent, useful and quiet. Public surface only: it
 * links back to the pages a lost visitor is most likely to need.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#0A1B3D] px-6 py-20 text-white">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto mb-8 grid size-[88px] place-items-center rounded-[24px] border border-white/15 bg-white/5">
          <Mark size={54} />
        </div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
          Error 404
        </p>
        <h1 className="mt-4 text-[38px] font-bold leading-tight tracking-tight sm:text-[46px]">
          This page does not exist<span className="text-[#FFB347]">.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[440px] text-[14px] leading-relaxed text-white/70">
          The link may be out of date, or the page may have moved. Here are the
          places most visitors are looking for.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-lg bg-[#E8501A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#FF8A2B]"
          >
            Back to homepage
          </Link>
          <Link
            href="/site/solutions"
            className="inline-flex h-11 items-center rounded-lg border border-white/25 px-5 text-[13px] font-semibold text-white transition hover:bg-white/10"
          >
            Explore solutions
          </Link>
          <Link
            href="/site/contact"
            className="inline-flex h-11 items-center rounded-lg border border-white/25 px-5 text-[13px] font-semibold text-white transition hover:bg-white/10"
          >
            Contact us
          </Link>
        </div>
      </div>
    </main>
  )
}
