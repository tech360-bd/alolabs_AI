'use client'

/**
 * AloNote — the editorial aside (italic serif, hairline rule).
 * Max two per figure: the callout register is for the one thing worth saying.
 */

import * as React from 'react'

export function AL0Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[#eb6c36]/40 pl-4">
      <p
        className="max-w-[80ch] text-[15px] italic leading-relaxed text-slate-600"
        style={{ fontFamily: 'var(--font-editorial, "Instrument Serif", Georgia, serif)' }}
      >
        {children}
      </p>
    </div>
  )
}

export default AL0Note
