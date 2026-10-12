/**
 * AgentSpecCard — the specification card from the “Master 1020 Agent
 * Specification List” sheet.
 *
 * Layout: orange id bar, blue name bar, then one labelled row per field with the
 * label in a tinted chip and the value on an outlined paper row. Drop-in for the
 * agent list, the spec documents and the printable specification.
 */

import * as React from 'react'
import { BRAND } from '@/lib/brand/tokens'
import { cn } from '@/lib/utils'

export interface AgentSpec {
  /** Printed id, e.g. AGENT-0801. */
  id: string
  name: string
  department: string
  role: string
  mission: string
  work: string
  input: string
  output: string
}

/** Label tones follow the sheet: department and work in blue, the rest orange. */
const FIELD_TONES: Record<string, 'orange' | 'blue'> = {
  Department: 'blue',
  Role: 'orange',
  Mission: 'orange',
  Work: 'blue',
  Input: 'blue',
  Output: 'orange',
}

export function AgentSpecCard({ spec, className }: { spec: AgentSpec; className?: string }) {
  const fields: { label: string; value: string }[] = [
    { label: 'Department', value: spec.department },
    { label: 'Role', value: spec.role },
    { label: 'Mission', value: spec.mission },
    { label: 'Work', value: spec.work },
    { label: 'Input', value: spec.input },
    { label: 'Output', value: spec.output },
  ]

  return (
    <article
      className={cn('overflow-hidden rounded-lg border bg-white', className)}
      style={{ borderColor: BRAND.grayLine }}
      aria-label={`${spec.id} ${spec.name}`}
    >
      <header className="px-3 py-2" style={{ background: BRAND.orange }}>
        <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white">{spec.id}</h3>
      </header>
      <div className="px-3 py-2" style={{ background: BRAND.blue }}>
        <p className="text-[13px] font-semibold leading-snug text-white">{spec.name}</p>
      </div>
      <div className="space-y-1.5 bg-[#F8FAFC] p-3">
        {fields.map((field) => (
          <FieldRow key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </article>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const tone = FIELD_TONES[label] ?? 'blue'
  const color = tone === 'orange' ? BRAND.orange : BRAND.blue
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-px w-[86px] shrink-0 rounded-[3px] px-1.5 py-1 text-center font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-white"
        style={{ background: color }}
      >
        {label}
      </span>
      <span
        className="min-h-[24px] flex-1 rounded-[4px] border bg-white px-2 py-1 text-[10px] leading-snug"
        style={{ borderColor: BRAND.grayLine, color: BRAND.ink }}
      >
        {value}
      </span>
    </div>
  )
}

/** The four cards printed on page 1 of the specification list. */
export const SPEC_SAMPLE: AgentSpec[] = [
  {
    id: 'AGENT-0801',
    name: 'Master Command Router Agent',
    department: 'Command Center',
    role: 'Task Router AI',
    mission: 'Route every command to the correct department without a human in the loop.',
    work: 'Detect intent → choose department → assign agent → log the decision',
    input: 'Owner command',
    output: 'Assigned agent + search report',
  },
  {
    id: 'AGENT-0802',
    name: 'Workflow Matching Agent',
    department: 'Command Center',
    role: 'Workflow Selector',
    mission: 'Select the best workflow and the agents that can run it.',
    work: 'Analyse command → match workflow → plan execution',
    input: 'Owner command',
    output: 'Workflow execution map',
  },
  {
    id: 'AGENT-0803',
    name: 'Risk Assessment Agent',
    department: 'Governance',
    role: 'Safety Responder',
    mission: 'Check every task for security and compliance risk before it runs.',
    work: 'Scan for risk → identify threats → evaluate impact',
    input: 'Task details',
    output: 'Risk level report',
  },
  {
    id: 'AGENT-0804',
    name: 'Memory Search Agent',
    department: 'Knowledge Base',
    role: 'Memory Retrieval AI',
    mission: 'Search the memory system and return the best information for the task.',
    work: 'Query database → vector search → retrieve the best answer',
    input: 'User query',
    output: 'Relevant knowledge',
  },
]
