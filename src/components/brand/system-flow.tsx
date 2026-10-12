/**
 * SystemFlow — “2. SYSTEM FLOW (ORANGE & BLUE)” from the brand sheet.
 *
 * Orange marks the action path (the super admin, the agent pool, the RAG engine,
 * execution), blue marks the system path (routers, memory, approval), and the
 * outline chips are the RAG branches. The dashed feedback rail down the left and
 * the return rail on the right are drawn as overlays so the column stays simple.
 *
 * Rendered from SYSTEM_FLOW tokens, so editing the flow is a tokens change.
 */

import * as React from 'react'
import { BRAND, SYSTEM_FLOW, type FlowNode } from '@/lib/brand/tokens'
import { cn } from '@/lib/utils'

const TONE_STYLE: Record<FlowNode['tone'], React.CSSProperties> = {
  orange: { background: BRAND.orange, color: '#FFFFFF', borderColor: BRAND.orange },
  blue: { background: BRAND.blue, color: '#FFFFFF', borderColor: BRAND.blue },
  outline: { background: '#FFFFFF', color: BRAND.blue, borderColor: '#B9C7E4' },
}

export function SystemFlow({ className }: { className?: string }) {
  const main = SYSTEM_FLOW.filter((n) => !n.branch)
  const departments = SYSTEM_FLOW.filter((n) => n.branch && n.tone === 'blue')
  const ragBranches = SYSTEM_FLOW.filter((n) => n.tone === 'outline')

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {main.map((node, i) => {
        const isAgents = node.id === 'agents'
        const next = main[i + 1]
        return (
          <React.Fragment key={node.id}>
            <FlowBox node={node} emphasis={isAgents} />
            <Arrow down />
            {node.id === 'department' ? (
              <>
                <BranchRow nodes={departments} />
                <Arrow down fromBranch />
              </>
            ) : null}
            {node.id === 'rag' ? (
              <>
                <BranchRow nodes={ragBranches} outline />
                <Arrow down fromBranch />
              </>
            ) : null}
            {next ? null : null}
          </React.Fragment>
        )
      })}
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: BRAND.graySoft }}>
        Dashed rails: approval return and continuous learning
      </p>
    </div>
  )
}

function FlowBox({ node, emphasis }: { node: FlowNode; emphasis?: boolean }) {
  return (
    <div
      className="flex w-full max-w-[300px] items-center justify-center gap-2 rounded-[6px] border px-4 py-2.5 text-center"
      style={{
        ...TONE_STYLE[node.tone],
        minHeight: emphasis ? 46 : 38,
        boxShadow: emphasis ? '0 10px 25px -18px rgba(255,106,0,0.9)' : undefined,
      }}
    >
      {node.id === 'admin' ? <AdminGlyph /> : node.id === 'agents' ? <AgentGlyph /> : null}
      <span className={cn('font-semibold', emphasis ? 'text-[13px]' : 'text-[11.5px]')}>{node.label}</span>
    </div>
  )
}

function BranchRow({ nodes, outline }: { nodes: FlowNode[]; outline?: boolean }) {
  return (
    <div className="flex w-full max-w-[560px] flex-wrap items-stretch justify-center gap-1.5">
      {nodes.map((n) => (
        <span
          key={n.id}
          className="flex flex-1 items-center justify-center rounded-[4px] border px-2 py-2 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.02em]"
          style={{ ...TONE_STYLE[n.tone], minWidth: outline ? 96 : 88, borderStyle: outline ? 'solid' : 'solid' }}
        >
          {n.label}
        </span>
      ))}
    </div>
  )
}

function Arrow({ down, fromBranch }: { down?: boolean; fromBranch?: boolean }) {
  return (
    <span
      className="flex items-center justify-center"
      style={{ height: fromBranch ? 22 : 18 }}
      aria-hidden="true"
    >
      <svg width="14" height={fromBranch ? 22 : 18} viewBox={`0 0 14 ${fromBranch ? 22 : 18}`} fill="none">
        <path
          d={fromBranch ? 'M1 0 V10 H13 V10 M7 10 V18' : 'M7 0 V12'}
          stroke={BRAND.graySoft}
          strokeWidth="1"
        />
        <path d={`M7 17 L4 12 H10 Z`} fill={BRAND.graySoft} transform={fromBranch ? 'translate(0,0)' : 'translate(0,0)'} />
      </svg>
    </span>
  )
}

function AdminGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function AgentGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v4M9 13h.01M15 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
