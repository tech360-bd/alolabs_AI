'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useState } from 'react'
import { Box, X } from 'lucide-react'

const Network = dynamic(() => import('./hero-3d'), {
  ssr: false,
  loading: () => <div className="hero3d network-loading" role="status">Loading the network…</div>,
})

/** Keep the original interactive WebGL constellation available on demand.
 * No three.js download or GPU context just to see the homepage. */
export function NetworkViewer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="network-viewer">
      {open ? <Network /> : <Image src="/studio/network.webp" alt="Illustration of connected orbital paths around a blue core" fill unoptimized sizes="(max-width: 760px) 100vw, 46vw" />}
      <button type="button" className="network-switch" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <X size={15} /> : <Box size={16} />} {open ? 'Close network' : 'Explore the 3D network'}
      </button>
    </div>
  )
}
