'use client'

/**
 * /site/platform/voice-contact-center — the ALO Labs AI Voice & Contact
 * Center product page. Public marketing page; follows the site brand system.
 * Every capability described here maps to an implemented module or is marked
 * as "rolling out" — nothing is advertised as working that is not built.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, COMPANY } from '@/lib/brand/tokens'
import {
  ArrowRight,
  AudioLines,
  Bot,
  BrainCircuit,
  Building2,
  Globe2,
  Headphones,
  Languages,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
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
    icon: PhoneCall,
    title: 'Cloud business phone system',
    body: 'Virtual business numbers, inbound and outbound calling, IVR menus, ring groups, queues, business hours, forwarding, transfer, hold, voicemail and full call history — provider-agnostic by design.',
    items: ['Sandbox adapter ships today', 'Asterisk / FreeSWITCH adapters', 'Real PSTN via authorized SIP trunk'],
  },
  {
    icon: Bot,
    title: 'AI voice agents',
    body: 'Build receptionists and outbound agents with greeting, personality, knowledge and escalation rules. Structural human-handoff: if a caller asks for a person, disputes a payment or raises a legal issue, transfer is mandatory.',
    items: ['Bangla-first conversations', 'Intent detection & structured outcomes', 'Human handoff that cannot be overridden'],
  },
  {
    icon: AudioLines,
    title: 'Bangla voice generation studio',
    body: 'bn-BD text-to-speech with voice controls, pronunciation care and a voice library. Authorized voice cloning only — verified, revocable owner consent enforced in code.',
    items: ['TTS / ASR job pipeline & metering', 'Voice library with consent gate', 'Streaming-ready adapter architecture'],
  },
  {
    icon: Headphones,
    title: 'Human contact center',
    body: 'Agent workspaces with presence, queue routing and supervisor views. Calls flow to AI first or humans first — you choose per number, per department, per hour.',
    items: ['Presence & availability', 'Queue strategies & priorities', 'After-call work & notes'],
  },
  {
    icon: Workflow,
    title: 'Outbound campaigns with compliance',
    body: 'Campaign calling with structural safeguards: do-not-call suppression (customer opt-outs are irremovable through the API), calling-hour windows in Asia/Dhaka, attempt caps and frequency limits.',
    items: ['DNC registry', 'Calling-hour enforcement', 'Every skip is recorded with a reason'],
  },
  {
    icon: BrainCircuit,
    title: 'Call intelligence & CRM',
    body: 'Transcripts, summaries, dispositions and usage metering feed the built-in CRM — customer 360 with call-to-contact association, shared inbox across channels and follow-up tasks.',
    items: ['Transcripts & summaries', 'CRM 360 + shared inbox', 'Accurate usage metering'],
  },
]

export function VoiceContactCenterPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/platform', label: 'Platform' }]}
        eyebrow="ALO Labs AI Voice & Contact Center"
        title={<>A cloud phone system, AI receptionist and Bangla voice studio — in one platform.</>}
        lead={`${COMPANY.product} now speaks. CallHippo-style cloud telephony combined with AI voice agents, Bangla-first speech generation, a human contact center and omnichannel messaging — on top of the same secure, multi-tenant AgentOS you already run.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/">
              Open the dashboard <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <Link href="/site/contact">Talk to us about a number</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Pill tone="orange">Bangla first (bn-BD)</Pill>
            <Pill tone="blue">Multi-tenant SaaS</Pill>
            <Pill tone="plain">Open, self-hosted telephony</Pill>
          </div>
        </div>
      </PageHero>

      <Section
        id="pipeline"
        eyebrow="Real-time voice pipeline"
        title="From the caller's first word to a structured outcome."
        lead="Streaming first: the caller's speech is recognized as it arrives, the conversation orchestrator decides — answer, act, or hand off — and the reply is spoken back without dead air. Every step is metered and audited."
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <ol className="space-y-4 text-sm">
              {[
                ['Caller', 'Phone or browser (WebRTC) reaches your business number.'],
                ['Telephony gateway', 'Asterisk / FreeSWITCH / SIP trunk adapter receives the call.'],
                ['Voice activity detection', 'Silence and echo handled before recognition.'],
                ['Speech-to-text', 'Bangla-capable ASR, streaming, with confidence scoring.'],
                ['Conversation orchestrator', 'LLM + business tools; mandatory human-handoff rules applied before anything else.'],
                ['Text-to-speech', 'bn-BD voice from the library, streamed back to the caller.'],
                ['Outcome', 'Transcript, summary, disposition, CRM update and follow-up task.'],
              ].map(([step, body], i) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: BRAND.orange }}>{i + 1}</span>
                  <span><strong className="font-semibold">{step}.</strong> {body}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <StatCard icon={Languages} value="bn-BD" label="Primary language" note="English, Hindi, Arabic extensible" />
            <StatCard icon={ShieldCheck} value="100%" label="Consent-gated" note="Recording, cloning, campaigns" />
            <StatCard icon={Building2} value="Multi-tenant" label="Isolation enforced" note="Per-tenant numbers, data, credentials" />
            <StatCard icon={Globe2} value="Asia/Dhaka" label="Calling-hours default" note="Timezone-aware campaigns" />
          </div>
        </div>
      </Section>

      <Section
        id="modules"
        eyebrow="Product modules"
        title="Twelve capabilities, one communications platform."
        lead="Cloud telephony, AI agents, Bangla voice, human agents, CRM, campaigns, omnichannel inbox, call intelligence, knowledge base, admin, billing and a developer API — built as one product, not disconnected tools."
      >
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <m.icon className="size-6" style={{ color: BRAND.orange }} />
              <h3 className="mt-3 font-semibold">{m.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{m.body}</p>
              <div className="mt-3"><CheckList items={m.items} /></div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="honest"
        eyebrow="Straight talk"
        title="What works today, and what needs a carrier."
        lead="We will not pretend a web app can make real telephone calls without telephony infrastructure. Here is the honest state of the platform."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold">Running today</h3>
            <div className="mt-3"><CheckList tone="orange" items={[
              'Full call lifecycle, IVR logic, queues and business hours (sandbox-tested)',
              'AI voice agent builder with mandatory human-handoff rules',
              'TTS/ASR job pipeline, metering, voice library and consent-gated cloning',
              'Campaigns with DNC suppression and calling-hour enforcement',
              'CRM, shared inbox, usage metering and the developer API',
              'Everything the dashboard shows is real data — demo records are labeled "Simulated"',
            ]} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold">Requires external infrastructure</h3>
            <div className="mt-3"><CheckList tone="blue" items={[
              'Real PSTN calling — needs an authorized SIP trunk / carrier and Bangladesh telecom compliance sign-off',
              'Production Bangla TTS/ASR quality — needs a deployed speech engine passing native-speaker evaluation',
              'Number provisioning in your country — subject to local regulations and provider availability',
              'Recording at scale — subject to consent requirements and retention policy',
            ]} /></div>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Ready to give your business a voice?"
        lead="Spin up the dashboard, provision a sandbox number and see the full contact center flow — then talk to the team about connecting a real number in Bangladesh."
      />
    </>
  )
}
