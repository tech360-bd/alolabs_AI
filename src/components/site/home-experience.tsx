'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bot, Check, Code2, Command, Cpu,
  Database, Globe, Layers3, Lock, Menu, MessageSquare, Network, PhoneCall,
  Plug, Plus, ShieldCheck, Sparkles, ShoppingCart, Terminal, Workflow, X, Zap,
} from 'lucide-react'
import { Mark } from '@/components/brand/alo-logo'
import { COMPANY, BRAND } from '@/lib/brand/tokens'

const Hero3D = dynamic(() => import('./hero-3d'), {
  ssr: false,
  loading: () => <div className="hero3d hero3d-loading" aria-hidden="true" />,
})

const navigation = [
  { label: 'Services', href: '#services' },
  { label: 'API', href: '#api' },
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Work', href: '#selected-work' },
  { label: 'FAQ', href: '#faq' },
]

const examples = [
  'Analyze my sales leads',
  'Generate a marketing brief',
  'Search our knowledge base',
]

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="home-header">
      <div className="home-nav-wrap">
        <Link href="/" className="home-logo" aria-label="ALO Labs home">
          <Mark size={36} />
          <span>alo<span className="home-logo-light">labs</span><small>AGENTOS</small></span>
        </Link>
        <nav className="home-desktop-nav" aria-label="Main navigation">
          {navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="home-nav-actions">
          <Link href="/login" className="home-login">Log in</Link>
          <Link href="/site/contact" className="home-button home-button-orange home-button-small">
            Get started <ArrowUpRight size={15}/>
          </Link>
        </div>
        <button className="home-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22}/> : <Menu size={22}/>}
        </button>
      </div>
      {open && (
        <nav className="home-mobile-nav" aria-label="Mobile navigation">
          {navigation.map(item => <a onClick={() => setOpen(false)} key={item.href} href={item.href}>{item.label}</a>)}
          <Link href="/site/contact" onClick={() => setOpen(false)}>Get started <ArrowRight size={16}/></Link>
        </nav>
      )}
    </header>
  )
}

function Hero() {
  const [prompt, setPrompt] = useState('')
  return (
    <section className="home-hero">
      <div className="hero-orb hero-orb-one"/>
      <div className="hero-orb hero-orb-two"/>
      <div className="home-container hero-grid">
        <div className="hero-copy">
          <div className="home-eyebrow">
            <span className="eyebrow-star">✳</span> ALO LABS — PRIVATE AI AS A SERVICE
          </div>
          <h1>Your systems,<br/><span className="hero-accent">supercharged with AI.</span></h1>
          <p className="hero-description">
            Connect your website, CRM, or app to the ALO Labs API. Our private AI
            infrastructure delivers chat, knowledge search, content generation, voice,
            and predictive analytics — to any system you connect.
          </p>
          <form className="hero-prompt" action="/login" method="get">
            <label className="sr-only" htmlFor="home-prompt">Describe what you want to work on</label>
            <Sparkles size={19} className="hero-prompt-icon"/>
            <input id="home-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What would you like to build with AI?"/>
            <button type="submit" aria-label="Continue to AgentOS login"><ArrowRight size={19}/></button>
          </form>
          <p className="hero-prompt-note">One API key. Every AI service. Your data stays yours.</p>
          <div className="hero-examples">
            <span>TRY:</span>
            {examples.map(example => (
              <button type="button" key={example} onClick={() => setPrompt(example)}>
                {example} <ArrowUpRight size={12}/>
              </button>
            ))}
          </div>
          <div className="hero-trust">
            <span><ShieldCheck size={14}/> Tenant-isolated</span>
            <span><Lock size={14}/> SOC2-ready</span>
            <span><Zap size={14}/> Sub-200ms p50</span>
            <span><Globe size={14}/> api.alolabs.net</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-visual-label">
            <span className="visual-spark">✳</span> THE AGENTOS CONSTELLATION — LIVE <span>✦</span>
          </div>
          <Hero3D />
        </div>
      </div>
      <div className="home-container hero-bottom">
        <span><span className="hero-bottom-dot"/> POWERING CONNECTED AI EVERYWHERE</span>
        <a href="#services">Explore AI services <ArrowDown size={14}/></a>
      </div>
    </section>
  )
}

// ─── AI Services section — what ALO Labs provides via API ────────────────────
const services = [
  { icon: MessageSquare, name: 'AI Chat', scope: 'ai:chat', desc: 'Conversational AI for your website or app. Multi-turn, context-aware, human-handoff ready.', color: 'blue' },
  { icon: Network, name: 'Knowledge Search', scope: 'ai:knowledge:search', desc: 'Hybrid RAG over your documents. Vector + keyword retrieval with citations.', color: 'orange' },
  { icon: Bot, name: 'AI Tasks', scope: 'ai:tasks', desc: 'Async task execution — analyze leads, score opportunities, automate workflows.', color: 'blue' },
  { icon: Code2, name: 'Content Generation', scope: 'ai:content', desc: 'Generate marketing copy, reports, summaries, structured documents.', color: 'orange' },
  { icon: PhoneCall, name: 'AI Voice', scope: 'ai:voice', desc: 'Voice sessions, call intelligence, telephony integration via the same API.', color: 'blue' },
  { icon: Cpu, name: 'Predictive Analytics', scope: 'ai:analysis', desc: 'Forecast demand, detect anomalies, classify and score with evidence.', color: 'orange' },
]

function Services() {
  return (
    <section id="services" className="home-section home-services">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> AI SERVICES</span>
          <span className="section-index">01 / WHAT WE PROVIDE</span>
        </div>
        <div className="section-heading-row">
          <h2>One API.<br/><em className="heading-accent-orange">Every AI capability.</em></h2>
          <p>Your website, CRM, ERP, eCommerce, or SaaS app connects to ALO Labs once. Every AI service below becomes available — no per-vendor integration, no model management, no infrastructure to run.</p>
        </div>
        <div className="services-grid">
          {services.map(({ icon: Icon, ...s }) => (
            <article className={`service-card service-${s.color}`} key={s.name}>
              <div className="service-card-top">
                <span className={`service-icon service-icon-${s.color}`}><Icon size={22}/></span>
                <code className="service-scope">{s.scope}</code>
              </div>
              <h3>{s.name}</h3>
              <p>{s.desc}</p>
              <div className="service-card-footer">
                <span className="service-endpoint">POST /v1/ai/{s.name.toLowerCase().replace(/\s/g, '-')}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── API / Connect-Anywhere section — the core message ──────────────────────
function ApiSection() {
  return (
    <section id="api" className="home-section home-api section-dark">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> UNIVERSAL API</span>
          <span className="section-index">02 / CONNECT ANYWHERE</span>
        </div>
        <div className="section-heading-row">
          <h2>Connect once.<br/><em className="heading-accent-blue">AI everywhere.</em></h2>
          <p>When you connect the ALO Labs API to any of your systems, AI services flow automatically to every connected project — no matter where it lives. One integration, universal AI coverage.</p>
        </div>
        <div className="api-visual">
          <div className="api-center">
            <div className="api-core">
              <Mark size={56} />
              <strong>ALO Labs API</strong>
              <code>api.alolabs.net/v1/</code>
            </div>
            <div className="api-pulse"/>
          </div>
          <div className="api-connections">
            {[
              { icon: Globe, label: 'Websites', detail: 'Chat, search, content' },
              { icon: Database, label: 'CRM Systems', detail: 'Lead scoring, enrichment' },
              { icon: Layers3, label: 'ERP / SaaS', detail: 'Automation, analytics' },
              { icon: ShoppingCart, label: 'eCommerce', detail: 'Recommendations, support' },
              { icon: PhoneCall, label: 'Voice / Telephony', detail: 'AI call center, IVR' },
              { icon: Terminal, label: 'Mobile Apps', detail: 'On-device AI via API' },
            ].map(({ icon: Icon, label, detail }) => (
              <div className="api-connection" key={label}>
                <span className="api-connection-icon"><Icon size={18}/></span>
                <div>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="api-code-block">
          <div className="api-code-header">
            <span><Terminal size={13}/> Quick start — 3 lines</span>
            <span className="api-code-lang">JavaScript</span>
          </div>
          <pre><code>{`import { ALOLabs } from '@alolabs/sdk';

const alo = new ALOLabs({ apiKey: process.env.ALO_API_KEY });

// Any AI service, one call:
const result = await alo.ai.chat({
  service: 'ai-chat',
  input: { message: 'Analyze these leads and prioritize them' },
});`}</code></pre>
        </div>
      </div>
    </section>
  )
}

// ─── Platform section ────────────────────────────────────────────────────────
const features = [
  { icon: MessageSquare, color: 'blue', name: 'Command Center', label: 'START HERE', description: 'A single prompt box that routes to the right AI service — chat, search, tasks, voice.' },
  { icon: Bot, color: 'orange', name: '2,000 AI Agents', label: 'YOUR AI TEAM', description: 'A workforce of specialized agents across 100 departments — research, analysis, writing, engineering.' },
  { icon: Layers3, color: 'blue', name: 'Knowledge & Memory', label: 'YOUR CONTEXT', description: 'Hybrid RAG over your documents. Vector + keyword search with citations and access control.' },
  { icon: Workflow, color: 'orange', name: 'Workflows & Runs', label: 'AUTOMATION', description: 'Chain AI tasks into workflows. Durable, resumable, with human approval gates.' },
]

function Platform() {
  return (
    <section id="platform" className="home-section home-platform">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> THE PLATFORM</span>
          <span className="section-index">03 / AGENTOS</span>
        </div>
        <div className="section-heading-row">
          <h2>Behind the API,<br/><em className="heading-accent-orange">a real AI platform.</em></h2>
          <p>AgentOS is the private control plane that powers every API call. 12 model providers, 2,000 agent profiles, a real orchestrator, and a RAG engine — not a wrapper around someone else's API.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, ...feature }, index) => (
            <article className="feature-card" key={feature.name}>
              <div className="feature-card-top">
                <span className={`feature-icon feature-icon-${feature.color}`}><Icon size={21}/></span>
                <span className="feature-number">0{index + 1}</span>
              </div>
              <div className="feature-content">
                <span className="feature-label">{feature.label}</span>
                <h3>{feature.name}</h3>
                <p>{feature.description}</p>
              </div>
              <span className="feature-arrow"><ArrowUpRight size={16}/></span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="home-section home-how">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> HOW IT WORKS</span>
          <span className="section-index">04 / THREE STEPS</span>
        </div>
        <div className="how-grid">
          <div className="how-copy">
            <h2>From API key<br/>to <em className="heading-accent-blue">AI in production.</em></h2>
            <p>No model training, no infrastructure, no per-vendor integration. Connect once, choose your services, and AI flows to every connected system.</p>
            <Link href="/site/contact" className="home-button home-button-orange">Talk to us <ArrowRight size={17}/></Link>
          </div>
          <div className="steps-card">
            <div className="steps-header">
              <span>THE FLOW</span>
              <span>SIMPLE <Sparkles size={13}/></span>
            </div>
            {[
              { n: '01', title: 'Get your API key', text: 'Create an account, generate a scoped API key, choose your services.', icon: Plug },
              { n: '02', title: 'Connect your system', text: 'Add the ALO Labs SDK or call the REST API from any app, website, or CRM.', icon: Code2 },
              { n: '03', title: 'AI flows everywhere', text: 'Every connected system gets chat, search, tasks, voice, and analytics — automatically.', icon: Zap },
            ].map(({ n, title, text, icon: Icon }) => (
              <div className="step-row" key={n}>
                <span className="step-number">{n}</span>
                <span className="step-icon"><Icon size={18}/></span>
                <div><h3>{title}</h3><p>{text}</p></div>
                <Check size={16} className="step-check"/>
              </div>
            ))}
            <div className="steps-footer">
              <span><ShieldCheck size={15}/> Tenant-isolated, audited, revocable</span>
              <ArrowUpRight size={15}/>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Selected work ───────────────────────────────────────────────────────────
const selectedWork = [
  { icon: Bot, name: 'AgentOS', status: 'Live', tone: 'live', description: 'The AI agent operating system — 2,000 agents, 12 model providers, orchestrator, RAG engine, voice runtime. Behind authenticated sign-in at agents.alolabs.net.' },
  { icon: PhoneCall, name: 'Voice Contact Center', status: 'In development', tone: 'dev', description: 'AI voice calling + telephony runtime — conversation brain, campaign dialer, recording pipeline, human handoff. Present in the codebase, nearing availability.' },
  { icon: Cpu, name: 'Engineering Intelligence', status: 'Internal', tone: 'internal', description: 'ALO Labs internal tooling for studying and improving how AgentOS itself is engineered. Not a public product.' },
]

function SelectedWork() {
  return (
    <section id="selected-work" className="home-section home-work">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> SELECTED WORK</span>
          <span className="section-index">05 / WHAT WE BUILD</span>
        </div>
        <div className="section-heading-row">
          <h2>What we're building,<br/><em className="heading-accent-orange">honestly labeled.</em></h2>
          <p>What's live, what's in development, and what stays internal — stated exactly as it is. No vanity logos, no invented case studies.</p>
        </div>
        <div className="work-grid">
          {selectedWork.map(({ icon: Icon, ...work }) => (
            <article className="work-card" key={work.name}>
              <div className="work-card-head">
                <span className="work-icon"><Icon size={20}/></span>
                <span className={`work-status work-status-${work.tone}`}>{work.status}</span>
              </div>
              <h3>{work.name}</h3>
              <p>{work.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Technology ──────────────────────────────────────────────────────────────
const stack = [
  { name: 'Next.js 16', note: 'App Router framework' },
  { name: 'React 19', note: 'UI runtime' },
  { name: 'TypeScript', note: 'Type-safe codebase' },
  { name: 'Prisma', note: 'Data layer & migrations' },
  { name: 'Tailwind CSS', note: 'Styling system' },
  { name: 'three.js / R3F', note: 'WebGL 3D scenes' },
  { name: '12 AI Providers', note: 'Ollama, OpenAI, Groq, Z.AI...' },
  { name: 'Qdrant', note: 'Vector search engine' },
  { name: 'MySQL / MariaDB', note: 'Production database' },
  { name: 'Vitest', note: '450+ tests' },
]

function Technology() {
  return (
    <section id="technology" className="home-section home-tech section-dark">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> TECHNOLOGY</span>
          <span className="section-index">06 / UNDER THE HOOD</span>
        </div>
        <div className="section-heading-row">
          <h2>Built on proven<br/><em className="heading-accent-blue">foundations.</em></h2>
          <p>The actual stack this site and product run on — verified against our package.json. Not aspirational, not a roadmap.</p>
        </div>
        <ul className="tech-grid">
          {stack.map(item => (
            <li className="tech-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const faqs = [
  { q: 'How does the API work?', a: 'You get an API key, choose which AI services you need (chat, search, tasks, voice, analytics), and call our REST endpoints. Every request is authenticated, tenant-scoped, rate-limited, and audited.' },
  { q: 'What can I connect?', a: 'Any system that can make HTTP calls — websites, CRMs, ERPs, eCommerce platforms, SaaS apps, mobile apps. Connect once and every AI service becomes available to all your connected projects.' },
  { q: 'Is my data isolated?', a: 'Yes. Every request is tenant-scoped via companyId resolved server-side from your API key. Cross-tenant access returns 404. We never expose your data to other customers, and the internal AI workforce is hidden from API consumers.' },
  { q: 'What does it cost?', a: 'Pricing is per-service with transparent usage units. You see exactly how many requests you have made and how many remain. No hidden model costs — we absorb the infrastructure. Contact us for a quote.' },
  { q: 'Can I see my usage?', a: 'Yes — the customer portal at /portal shows your API keys, usage per service, task history, webhook deliveries, and service catalog in real time.' },
  { q: 'What about security?', a: 'API keys are SHA-256 hashed at rest. Sessions use opaque tokens with idle timeout + TTL. Rate limiting is per-key. Webhooks are HMAC-signed. SSRF prevention blocks internal targets. Every privileged change is audited.' },
]

function FAQ() {
  return (
    <section id="faq" className="home-section home-faq">
      <div className="home-container faq-grid">
        <div>
          <span className="section-kicker"><span>✳</span> FAQ</span>
          <h2>Questions<br/><em className="heading-accent-orange">you might ask.</em></h2>
          <p>Everything you need to know about connecting to ALO Labs and using our AI services.</p>
          <a href={COMPANY.emailHref} className="faq-contact">Still have a question? <ArrowUpRight size={15}/></a>
        </div>
        <div className="faq-list">
          {faqs.map(item => (
            <details key={item.q}>
              <summary>{item.q}<span><Plus size={17}/></span></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Trust / Policies strip ──────────────────────────────────────────────────
function TrustStrip() {
  return (
    <section className="home-trust">
      <div className="home-container">
        <div className="trust-grid">
          <div className="trust-item">
            <ShieldCheck size={24}/>
            <strong>Tenant Isolation</strong>
            <p>Every query is scoped by companyId. Cross-tenant access is blocked and logged.</p>
          </div>
          <div className="trust-item">
            <Lock size={24}/>
            <strong>API Keys Hashed</strong>
            <p>SHA-256 at rest. Plaintext shown once. Rotation, revocation, expiration enforced.</p>
          </div>
          <div className="trust-item">
            <Database size={24}/>
            <strong>Your Data Stays Yours</strong>
            <p>We never train on your data. Knowledge is tenant-scoped. Delete anytime.</p>
          </div>
          <div className="trust-item">
            <Zap size={24}/>
            <strong>Production SLA</strong>
            <p>Sub-200ms p50 latency. Durable queue. 99.9% uptime target.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <>
      <section className="home-cta">
        <div className="home-container">
          <div className="cta-inner">
            <div className="cta-spark cta-spark-one">✳</div>
            <div className="cta-spark cta-spark-two">✦</div>
            <div className="cta-content">
              <span className="cta-eyebrow">START BUILDING WITH AI</span>
              <h2>Connect your system.<br/><em>Get AI everywhere.</em></h2>
              <p>One API key. Every AI service. Production-ready in minutes.</p>
              <Link className="home-button home-button-light" href="/site/contact">Get your API key <ArrowRight size={17}/></Link>
            </div>
          </div>
        </div>
      </section>
      <footer className="home-footer">
        <div className="home-container">
          <div className="footer-main">
            <div>
              <Link href="/" className="home-logo" aria-label="ALO Labs home">
                <Mark size={34}/>
                <span>alo<span className="home-logo-light">labs</span><small>AGENTOS</small></span>
              </Link>
              <p>Private AI as a Service.<br/>One API, every AI capability.</p>
              <div className="footer-contact">
                <a href={COMPANY.emailHref}>{COMPANY.email}</a>
                <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
              </div>
            </div>
            <div className="footer-links">
              <div>
                <strong>SERVICES</strong>
                <a href="#services">AI Chat</a>
                <a href="#services">Knowledge Search</a>
                <a href="#services">AI Tasks</a>
                <a href="#services">Voice AI</a>
                <a href="#services">Analytics</a>
              </div>
              <div>
                <strong>PLATFORM</strong>
                <a href="#platform">AgentOS</a>
                <a href="#how-it-works">How it works</a>
                <a href="#selected-work">Selected work</a>
                <a href="#technology">Technology</a>
              </div>
              <div>
                <strong>COMPANY</strong>
                <a href="/site/about">About</a>
                <a href="/site/contact">Contact</a>
                <a href="/site/pricing">Pricing</a>
                <a href="#faq">FAQ</a>
                <Link href="/login">Log in</Link>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved. {COMPANY.addressOneLine}.</span>
            <span>Made for what's next <span className="footer-star">✳</span></span>
          </div>
        </div>
      </footer>
    </>
  )
}

export function HomeExperience() {
  return (
    <div className="home-experience">
      <Header/>
      <main>
        <Hero/>
        <Services/>
        <ApiSection/>
        <Platform/>
        <HowItWorks/>
        <SelectedWork/>
        <Technology/>
        <TrustStrip/>
        <FAQ/>
      </main>
      <Footer/>
    </div>
  )
}
