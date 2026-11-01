'use client'

/**
 * /site/platform — the AgentOS product page: the system flow, the command
 * centre, the agent specification, the hybrid RAG engine, the approval gate
 * and the deployment surfaces. Every figure is a live component from the brand
 * system or the editorial diagram library, not a screenshot.
 */

import * as React from 'react'
import Link from 'next/link'
import { SystemFlow } from '@/components/brand/system-flow'
import { AgentSpecCard, SPEC_SAMPLE } from '@/components/brand/agent-spec-card'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { EXAMPLE_BY_SLUG } from '@/lib/diagram-design/examples'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY, SYSTEM_FLOW } from '@/lib/brand/tokens'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  Database,
  FileCheck2,
  Gauge,
  Layers,
  Lock,
  Radar,
  Workflow,
} from 'lucide-react'
import {
  CtaBand,
  CheckList,
  PageHero,
  Pill,
  Section,
  StatCard,
} from '@/components/site/chrome'

const MODULES = [
  {
    icon: Gauge,
    title: 'Command Center',
    body: 'One surface for the owner and the operators: natural-language commands in, routed work out, with live status on every agent and every run.',
    items: ['Owner command intake', 'Live agent status', 'Run history & replays'],
  },
  {
    icon: Workflow,
    title: 'Master & department routers',
    body: 'Every command is classified, scored and routed to the right department — then to the specific agent and workflow that owns the outcome.',
    items: ['Intent classification', 'Department routing', 'Load-aware agent selection'],
  },
  {
    icon: Bot,
    title: '1020 AI agents, 100+ departments',
    body: 'Agents are specified before they run: department, role, mission, work, inputs, outputs and the QA rules they are held to.',
    items: ['Spec-driven registry', 'Per-department staffing', 'Versioned behaviour'],
  },
  {
    icon: Database,
    title: 'Memory + hybrid RAG',
    body: 'Short-term, long-term and company memory feed a hybrid retrieval engine — classic vector search, graph retrieval and agentic retrieval in one path.',
    items: ['Classic · graph · agentic RAG', 'Company & department memory', 'Source-cited answers'],
  },
  {
    icon: FileCheck2,
    title: 'Approval engine',
    body: 'Nothing executes without passing the gate. Risk assessment, policy checks and a human approval step for anything that spends money, sends mail or touches production.',
    items: ['Risk scoring', 'Policy enforcement', 'Human-in-the-loop'],
  },
  {
    icon: BadgeCheck,
    title: 'Audit & compliance',
    body: 'Every hop is logged: who commanded, which agent acted, what it read, what it wrote and who approved it — exportable, tamper-evident, per tenant.',
    items: ['Complete run audit trail', 'Tenant isolation', 'Exportable evidence'],
  },
]

export function PlatformPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/platform', label: 'Platform' }]}
        eyebrow="The AgentOS platform"
        title={<>One command centre for 1020 AI agents across 100+ departments.</>}
        lead={`ALO Labs ${COMPANY.product} is an enterprise AI operating system: a single command centre on top of a routing layer, a specified agent workforce, a hybrid RAG engine and an approval gate — secure, auditable and built to scale.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/">
              Open the Command Center <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <Link href="/site/contact">Request a walkthrough</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Pill tone="orange">Approval gate on every run</Pill>
            <Pill tone="blue">Multi-tenant by design</Pill>
            <Pill tone="plain">Self-host or managed</Pill>
          </div>
        </div>
      </PageHero>

      {/* The system flow */}
      <Section
        id="flow"
        eyebrow="System flow"
        title="Every command takes the same eight-hop path — auditable at every hop."
        lead="Orange is the action path, blue is the system path. The owner's command travels from the Command Center through the routers, the agent pool, memory and the hybrid RAG engine, and stops at the approval gate before execution."
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <SystemFlow />
          </div>
          <div className="space-y-4">
            <StatCard icon={Gauge} value={String(SYSTEM_FLOW.filter((n) => !n.branch).length)} label="Routed hops" note="Command Center → result" />
            <StatCard icon={Layers} value={String(SYSTEM_FLOW.filter((n) => n.branch && n.tone === 'blue').length)} label="Department branches" note="Website, CRM, Marketing, Student Ops, Finance" />
            <StatCard icon={Radar} value="3" label="RAG families" note="Classic, graph and agentic retrieval" />
            <StatCard icon={Lock} value="1" label="Approval gate" note="Nothing executes without it" />
          </div>
        </div>
      </Section>

      {/* Modules */}
      <Section
        id="command"
        eyebrow="Platform modules"
        title="Six modules, one operating system."
        lead="The same stack powers the website, the CRM, marketing, student operations and finance departments — and any department you add after them."
        ground="canvas"
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m, i) => (
            <div key={m.title} className="rounded-2xl border border-slate-200 bg-white p-7">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: BRAND.tint }}>
                  <m.icon className="size-5" style={{ color: BRAND.blue }} />
                </span>
                <span className="font-mono text-[11px] font-bold tracking-[0.18em]" style={{ color: BRAND.orange }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {m.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {m.body}
              </p>
              <ul className="mt-4 space-y-1.5">
                {m.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px]" style={{ color: BRAND.ink }}>
                    <BadgeCheck className="mt-0.5 size-3.5 shrink-0" style={{ color: BRAND.orange }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Agents */}
      <Section
        id="agents"
        eyebrow="The agent workforce"
        title="Every agent is specified before it runs."
        lead="The specification list is the source of truth for the registry — 1020 agents across 100+ departments, each with a named role, a mission, an execution path, and QA and approval rules attached. Cards are generated from data; the same component renders all 1020."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SPEC_SAMPLE.map((spec) => (
            <AgentSpecCard key={spec.id} spec={spec} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-1.5" asChild>
            <Link href="/site/diagrams">
              See the org-chart of the AI team <ArrowRight className="size-3.5" />
            </Link>
          </Button>
          <span className="text-[11px]" style={{ color: BRAND.gray }}>
            Departments own their agents, workflows and approval rules — and re-staff without redeployment.
          </span>
        </div>
      </Section>

      {/* RAG + approvals, with the editorial architecture figure */}
      <Section
        id="rag"
        eyebrow="Retrieval & control"
        title="Hybrid RAG on the way in. An approval gate on the way out."
        lead="Answers are grounded in your own corpus: classic vector retrieval for precision, graph retrieval for relationships, agentic retrieval for multi-hop questions. Execution is a different story — it stops at the gate until policy and, where configured, a human say yes."
        ground="navy"
      >
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <EditorialDiagram spec={EXAMPLE_BY_SLUG['architecture-agentos']} framed />
          </div>
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2">
                <Database className="size-4" style={{ color: BRAND.orange }} />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Hybrid RAG engine</p>
              </div>
              <div className="mt-4">
                <CheckList
                  tone="white"
                  items={[
                    'Classic RAG — vector search with reranking for precise recall.',
                    'Graph RAG — entity relationships resolved across the corpus.',
                    'Agentic RAG — multi-hop retrieval planned and executed by an agent.',
                    'Company, department and agent memory layers on top.',
                  ]}
                />
              </div>
            </div>
            <div id="approvals" className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-4" style={{ color: BRAND.orange }} />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Approval & audit</p>
              </div>
              <div className="mt-4">
                <CheckList
                  tone="white"
                  items={[
                    'Risk assessment and policy checks before any side effect.',
                    'Human approval for spend, outbound communication and production changes.',
                    'Tamper-evident audit log of every hop, exportable per tenant.',
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Deployment */}
      <Section
        id="deployment"
        eyebrow="Deployment & security"
        title="Your cloud, our cloud, or your own rack."
        lead="AgentOS is a Next.js + Prisma platform with a MySQL production store, Redis-backed queues and object storage for artifacts. It runs as a managed service or self-hosted, and reaches every surface on a branded domain."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              {COMPANY.domains.map((d) => (
                <div key={d.value} className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.graySoft }}>
                    {d.label}
                  </p>
                  <p className="mt-1.5 font-mono text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                    {d.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Role-based access', 'API keys & SSO', 'Rate limiting', 'Encrypted secrets', 'Backup & restore', 'Health checks'].map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <div className="flex items-center gap-2">
              <Boxes className="size-4" style={{ color: BRAND.orange }} />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.gray }}>
                What ships with the platform
              </p>
            </div>
            <div className="mt-4">
              <CheckList
                items={[
                  'The full agent registry, workflow library and approval engine.',
                  'CRM, marketing, email, SMS and VoIP integration surfaces.',
                  'Media generation, document storage and the artifact pipeline.',
                  'Monitoring, alerting, backups and disaster-recovery tooling.',
                  'The marketing kit and 50 marketing playbooks, installable as agents.',
                  'The editorial diagram system for every report and presentation.',
                ]}
              />
            </div>
            <Button className="mt-6 gap-2" style={{ background: BRAND.orange }} asChild>
              <Link href="/site/pricing">
                See pricing & deployment <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  )
}
