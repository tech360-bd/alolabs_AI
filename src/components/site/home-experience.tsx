'use client'

/**
 * The public homepage — https://alolabs.net
 *
 * ALO Labs is presented as a global AI & software technology company: what we
 * build, which business problems we solve, how we deliver, and how to start a
 * project. Every claim on this page is traceable to a real capability or a
 * documented fact — no invented metrics, logos, testimonials or case results.
 *
 * The authenticated application lives at `/dashboard` and is not reachable
 * without a session; the client portal lives at `/portal`.
 */

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import {
  ArrowRight, ArrowUpRight, Bot, Building2, Check, Cloud, Code2, Database,
  Globe, Layers3, Lock, Menu, MessageSquare, Network, PhoneCall,
  Rocket, Search, ShieldCheck, Smartphone, Sparkles, Users, Workflow, X, Zap,
} from 'lucide-react'
import { Mark } from '@/components/brand/alo-logo'
import { COMPANY } from '@/lib/brand/tokens'

const Hero3D = dynamic(() => import('./hero-3d'), {
  ssr: false,
  loading: () => <div className="hero3d hero3d-loading" aria-hidden="true" />,
})

const navigation = [
  { label: 'Solutions', href: '#solutions' },
  { label: 'Services', href: '/site/services' },
  { label: 'How we work', href: '/site/how-we-work' },
  { label: 'About', href: '/site/about' },
  { label: 'Contact', href: '/site/contact' },
]

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="home-header">
      <div className="home-nav-wrap">
        <Link href="/" className="home-logo" aria-label="ALO Labs home">
          <Mark size={36} />
          <span>alo<span className="home-logo-light">labs</span><small>AI &amp; SOFTWARE</small></span>
        </Link>
        <nav className="home-desktop-nav" aria-label="Main navigation">
          {navigation.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <div className="home-nav-actions">
          <Link href="/login" className="home-login">Client Login</Link>
          <Link href="/site/contact" className="home-button home-button-orange home-button-small">
            Start a Project <ArrowUpRight size={15} />
          </Link>
        </div>
        <button className="home-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="home-mobile-nav" aria-label="Mobile navigation">
          {navigation.map(item => <Link onClick={() => setOpen(false)} key={item.href} href={item.href}>{item.label}</Link>)}
          <Link href="/login" onClick={() => setOpen(false)}>Client Login</Link>
          <Link href="/site/contact" onClick={() => setOpen(false)}>Start a Project <ArrowRight size={16} /></Link>
        </nav>
      )}
    </header>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="home-hero">
      <div className="hero-orb hero-orb-one" />
      <div className="hero-orb hero-orb-two" />
      <div className="home-container hero-grid">
        <div className="hero-copy">
          <div className="home-eyebrow">
            <span className="eyebrow-star">✳</span> A GLOBAL AI &amp; SOFTWARE TECHNOLOGY COMPANY
          </div>
          <h1>Building Intelligent<br /><span className="hero-accent">Digital Experiences.</span></h1>
          <p className="hero-description">
            ALO Labs designs and builds software, AI-powered solutions and connected
            digital platforms that help businesses work smarter, scale confidently
            and create better experiences.
          </p>
          <div className="hero-actions">
            <Link href="/site/contact" className="home-button home-button-orange">
              Start a Project <ArrowRight size={17} />
            </Link>
            <Link href="/site/solutions" className="home-button home-button-ghost">
              Explore Our Solutions <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-trust">
            <span><ShieldCheck size={14} /> Secure by design</span>
            <span><Lock size={14} /> Tenant-isolated delivery</span>
            <span><Users size={14} /> Accountable teams</span>
            <span><Globe size={14} /> {COMPANY.website}</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-visual-label">
            <span className="visual-spark">✳</span> THE INTELLIGENT NETWORK — CONNECTED SYSTEMS <span>✦</span>
          </div>
          <Hero3D />
        </div>
      </div>
      <div className="home-container hero-bottom">
        <span><span className="hero-bottom-dot" /> SOFTWARE · AI · PLATFORMS · AUTOMATION</span>
        <a href="#introduction">Who we are <ArrowRight size={14} /></a>
      </div>
    </section>
  )
}

// ─── Company introduction ────────────────────────────────────────────────────

function Introduction() {
  return (
    <section id="introduction" className="home-section home-intro">
      <div className="home-container intro-grid">
        <div className="intro-copy">
          <div className="section-topline">
            <span className="section-kicker"><span>✳</span> WHO WE ARE</span>
            <span className="section-index">01 / INTRODUCTION</span>
          </div>
          <h2>Technology partners for<br /><em className="heading-accent-orange">important systems.</em></h2>
          <p>
            ALO Labs is an AI and software technology company. We design, build and
            evolve the digital systems businesses depend on — from AI-powered
            automation and custom software to web platforms, mobile applications
            and the integrations that connect them.
          </p>
          <p>
            We work with founders, growing companies and established organisations
            that need technology delivered properly: clear scope, sound architecture,
            careful engineering and a team that stays accountable after launch.
          </p>
          <Link href="/site/about" className="text-link">More about ALO Labs <ArrowRight size={15} /></Link>
        </div>
        <div className="intro-points">
          {[
            { icon: Search, title: 'Understand first', body: 'We start with your business, your users and your constraints — not with a technology shopping list.' },
            { icon: Code2, title: 'Engineer properly', body: 'Maintainable architecture, tested code and design systems that hold up as the product grows.' },
            { icon: Rocket, title: 'Deliver accountable', body: 'Scoped work, reviewed deliverables and clear communication from first conversation to handover.' },
          ].map(({ icon: Icon, ...p }) => (
            <article className="intro-point" key={p.title}>
              <span className="intro-point-icon"><Icon size={19} /></span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Core capabilities ───────────────────────────────────────────────────────

const capabilities = [
  { icon: Bot, name: 'AI Solutions & Automation', desc: 'Intelligent automation, AI-assisted workflows and decision support designed around real business processes.' },
  { icon: Code2, name: 'Custom Software Development', desc: 'Purpose-built applications engineered for your operations — not squeezed into an off-the-shelf tool.' },
  { icon: Globe, name: 'Web Applications & Platforms', desc: 'Fast, accessible web products and digital platforms built on modern, proven foundations.' },
  { icon: Smartphone, name: 'Mobile Application Development', desc: 'Mobile experiences that extend your products and services to where your customers are.' },
  { icon: Database, name: 'Business Systems & CRM', desc: 'CRM, portals and operational systems that keep teams, data and customers in one place.' },
  { icon: Network, name: 'Integrations & Cloud', desc: 'Connected systems, automated hand-offs and cloud infrastructure engineered to stay reliable.' },
]

function Capabilities() {
  return (
    <section id="capabilities" className="home-section home-capabilities">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> CORE CAPABILITIES</span>
          <span className="section-index">02 / WHAT WE DO</span>
        </div>
        <div className="section-heading-row">
          <h2>Software, AI and platforms —<br /><em className="heading-accent-blue">built as one discipline.</em></h2>
          <p>Six capability areas, one engineering standard. Projects often combine several — the architecture keeps them working as a whole.</p>
        </div>
        <div className="services-grid">
          {capabilities.map(({ icon: Icon, ...c }) => (
            <article className="service-card" key={c.name}>
              <div className="service-card-top">
                <span className="service-icon"><Icon size={22} /></span>
              </div>
              <h3>{c.name}</h3>
              <p>{c.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Business solutions ──────────────────────────────────────────────────────

const solutions = [
  { icon: Zap, name: 'AI Solutions & Intelligent Automation', line: 'Automate repetitive work and support better decisions with AI designed for your processes.' },
  { icon: Code2, name: 'Custom Software Development', line: 'Software shaped around your business — specified with you, engineered and maintained by us.' },
  { icon: Globe, name: 'Web Applications & Digital Platforms', line: 'Customer-facing platforms and internal web applications that scale with demand.' },
  { icon: Smartphone, name: 'Mobile Application Development', line: 'iOS and Android experiences connected to the same systems your teams already use.' },
  { icon: Building2, name: 'Business Systems & CRM', line: 'CRM implementation, pipeline tooling and operational dashboards built around your data.' },
  { icon: Workflow, name: 'Workflow Automation & Integrations', line: 'Connect the tools you already run and remove the manual steps between them.' },
  { icon: Layers3, name: 'Client Portals & SaaS Platforms', line: 'Secure multi-user products — onboarding, dashboards, billing flows and role-based access.' },
  { icon: Cloud, name: 'Cloud & Infrastructure Engineering', line: 'Deployment, observability and infrastructure designed for reliability and recovery.' },
  { icon: MessageSquare, name: 'AI-assisted Customer Experience', line: 'Support, voice and messaging experiences where AI assists your team — with humans in control.' },
]

function Solutions() {
  return (
    <section id="solutions" className="home-section home-solutions section-dark">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> BUSINESS SOLUTIONS</span>
          <span className="section-index">03 / WHAT WE SOLVE</span>
        </div>
        <div className="section-heading-row">
          <h2>Nine ways we help<br /><em className="heading-accent-orange">businesses move forward.</em></h2>
          <p>Each solution area starts from a business problem, not a technology trend. Explore the full breakdown — problem, approach, capabilities and value — on the solutions page.</p>
        </div>
        <div className="solutions-grid">
          {solutions.map(({ icon: Icon, ...s }, i) => (
            <article className="solution-card" key={s.name}>
              <div className="solution-card-head">
                <span className="solution-icon"><Icon size={18} /></span>
                <span className="solution-number">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{s.name}</h3>
              <p>{s.line}</p>
            </article>
          ))}
        </div>
        <div className="section-foot">
          <Link href="/site/solutions" className="home-button home-button-ghost">Explore Our Solutions <ArrowRight size={16} /></Link>
        </div>
      </div>
    </section>
  )
}

// ─── How we work ─────────────────────────────────────────────────────────────

const process = [
  { n: '01', title: 'Discovery', body: 'Understand the business, requirements, stakeholders and existing systems.' },
  { n: '02', title: 'Strategy & Architecture', body: 'Define the solution, architecture, scope, priorities and delivery plan.' },
  { n: '03', title: 'Design & Engineering', body: 'Build, review, test and refine the solution.' },
  { n: '04', title: 'Launch & Delivery', body: 'Prepare deployment, verification, documentation and handover.' },
  { n: '05', title: 'Continuous Improvement', body: 'Provide agreed maintenance, enhancements and support.' },
]

function HowWeWork() {
  return (
    <section id="process" className="home-section home-process">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> HOW WE WORK</span>
          <span className="section-index">04 / OUR PROCESS</span>
        </div>
        <div className="section-heading-row">
          <h2>A delivery process built on<br /><em className="heading-accent-blue">clarity and accountability.</em></h2>
          <p>Five stages, repeated with discipline on every engagement — from first discovery workshop to continuous improvement after launch.</p>
        </div>
        <ol className="process-grid">
          {process.map(step => (
            <li className="process-step" key={step.n}>
              <span className="process-number">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="section-foot">
          <Link href="/site/how-we-work" className="text-link">See the full delivery process <ArrowRight size={15} /></Link>
        </div>
      </div>
    </section>
  )
}

// ─── Selected work (honest status labels only) ───────────────────────────────

const selectedWork = [
  {
    icon: Layers3, name: 'ALO Labs Client Portal', status: 'Live', tone: 'live',
    description: 'Our own client service platform: request services, follow project progress, review deliverables, manage invoices and reach support — one secure place for everything clients do with ALO Labs.',
  },
  {
    icon: PhoneCall, name: 'Voice Contact Center', status: 'In development', tone: 'dev',
    description: 'AI-assisted voice and messaging for customer contact — campaigns, call handling and clean hand-off to human teams. Currently in development.',
  },
  {
    icon: Code2, name: 'Custom Client Systems', status: 'Project engagement', tone: 'project',
    description: 'Bespoke software, portals, automations and integrations delivered as scoped projects. Availability is confirmed per engagement — talk to us about your requirements.',
  },
]

function SelectedWork() {
  return (
    <section id="work" className="home-section home-work">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> SELECTED WORK</span>
          <span className="section-index">05 / WHAT WE'RE BUILDING</span>
        </div>
        <div className="section-heading-row">
          <h2>Honest labels,<br /><em className="heading-accent-orange">no invented stories.</em></h2>
          <p>What is live, what is in development and what is delivered through project engagement — stated exactly as it is. Client work is shared only with permission.</p>
        </div>
        <div className="work-grid">
          {selectedWork.map(({ icon: Icon, ...work }) => (
            <article className="work-card" key={work.name}>
              <div className="work-card-head">
                <span className="work-icon"><Icon size={20} /></span>
                <span className={`work-status work-status-${work.tone}`}>{work.status}</span>
              </div>
              <h3>{work.name}</h3>
              <p>{work.description}</p>
            </article>
          ))}
        </div>
        <div className="section-foot">
          <Link href="/site/projects" className="text-link">Explore our projects <ArrowRight size={15} /></Link>
        </div>
      </div>
    </section>
  )
}

// ─── Technology & delivery ───────────────────────────────────────────────────

const stack = [
  { name: 'Next.js & React', note: 'Modern web foundations' },
  { name: 'TypeScript', note: 'Type-safe engineering' },
  { name: 'Node.js', note: 'Service & API runtime' },
  { name: 'Prisma & SQL', note: 'Reliable data layers' },
  { name: 'Tailwind CSS', note: 'Consistent design systems' },
  { name: 'Three.js / WebGL', note: 'Immersive 3D experiences' },
  { name: 'Docker & Linux', note: 'Repeatable deployments' },
  { name: 'Automated Testing', note: 'Verified before delivery' },
]

const deliveryPrinciples = [
  'Architecture decisions documented and reviewed',
  'Automated tests and verification before handover',
  'Security and tenant isolation designed in from day one',
  'Performance and accessibility treated as release criteria',
]

function Technology() {
  return (
    <section id="technology" className="home-section home-tech section-dark">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> TECHNOLOGY &amp; DELIVERY</span>
          <span className="section-index">06 / HOW WE BUILD</span>
        </div>
        <div className="section-heading-row">
          <h2>Proven foundations,<br /><em className="heading-accent-blue">modern engineering.</em></h2>
          <p>We choose technology for longevity and fit — not novelty. The stack below is the same one this platform is built on.</p>
        </div>
        <div className="tech-layout">
          <ul className="tech-grid">
            {stack.map(item => (
              <li className="tech-card" key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.note}</span>
              </li>
            ))}
          </ul>
          <ul className="delivery-list">
            {deliveryPrinciples.map(line => (
              <li key={line}><Check size={16} /> {line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

// ─── Why ALO Labs ────────────────────────────────────────────────────────────

const reasons = [
  { icon: ShieldCheck, title: 'Engineering quality first', body: 'Clean architecture, tested code and design systems built to last — quality is a delivery requirement, not a slogan.' },
  { icon: Lock, title: 'Security & isolation by design', body: 'Access control, tenant isolation and auditability are designed in from the start of every system we build.' },
  { icon: Users, title: 'Accountable delivery', body: 'Named people, clear scopes and reviewed deliverables. You always know who is doing the work and where it stands.' },
  { icon: Sparkles, title: 'AI where it creates value', body: 'We apply AI where it measurably helps — and build plain, reliable software where that is the better answer.' },
  { icon: Building2, title: 'Long-term partnership', body: 'We plan for the years after launch: documentation, maintenance, enhancements and support that scale with you.' },
  { icon: Globe, title: 'Global standards, personal service', body: 'International engineering practice with direct, responsive communication — wherever your business operates.' },
]

function WhyAlo() {
  return (
    <section id="why" className="home-section home-why">
      <div className="home-container">
        <div className="section-topline">
          <span className="section-kicker"><span>✳</span> WHY ALO LABS</span>
          <span className="section-index">07 / OUR PROMISE</span>
        </div>
        <div className="section-heading-row">
          <h2>Built to earn<br /><em className="heading-accent-orange">long-term trust.</em></h2>
          <p>The qualities international businesses look for in a technology partner — practiced on every engagement.</p>
        </div>
        <div className="why-grid">
          {reasons.map(({ icon: Icon, ...r }) => (
            <article className="why-card" key={r.title}>
              <span className="why-icon"><Icon size={20} /></span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Contact CTA + Footer ────────────────────────────────────────────────────

function CtaBand() {
  return (
    <section className="home-cta">
      <div className="home-container">
        <div className="cta-inner">
          <div className="cta-spark cta-spark-one">✳</div>
          <div className="cta-spark cta-spark-two">✦</div>
          <div className="cta-content">
            <span className="cta-eyebrow">START A PROJECT</span>
            <h2>Let's build something<br /><em>intelligent together.</em></h2>
            <p>Tell us about your business and what you want to achieve. We will reply within one business day with a real conversation — not a sales script.</p>
            <Link className="home-button home-button-light" href="/site/contact">Start a Project <ArrowRight size={17} /></Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-container">
        <div className="footer-main">
          <div>
            <Link href="/" className="home-logo" aria-label="ALO Labs home">
              <Mark size={34} />
              <span>alo<span className="home-logo-light">labs</span><small>AI &amp; SOFTWARE</small></span>
            </Link>
            <p>A global AI &amp; software technology company.<br />{COMPANY.promise}</p>
            <div className="footer-contact">
              <a href={COMPANY.emailHref}>{COMPANY.email}</a>
              <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
              <span>{COMPANY.addressOneLine}</span>
            </div>
          </div>
          <div className="footer-links">
            <div>
              <strong>SOLUTIONS</strong>
              <Link href="/site/solutions">All solutions</Link>
              <Link href="/site/services">Services</Link>
              <Link href="/site/how-we-work">How we work</Link>
              <Link href="/site/projects">Projects</Link>
            </div>
            <div>
              <strong>COMPANY</strong>
              <Link href="/site/about">About</Link>
              <Link href="/site/careers">Careers</Link>
              <Link href="/site/contact">Contact</Link>
              <Link href="/site/privacy">Privacy Policy</Link>
              <Link href="/site/terms">Terms of Service</Link>
            </div>
            <div>
              <strong>CLIENTS</strong>
              <Link href="/login">Client Login</Link>
              <Link href="/portal">Client Portal</Link>
              <Link href="/site/contact">Start a Project</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved. {COMPANY.addressOneLine}.</span>
          <span>Building Intelligent Digital Experiences <span className="footer-star">✳</span></span>
        </div>
      </div>
    </footer>
  )
}

export function HomeExperience() {
  return (
    <div className="home-experience">
      <Header />
      <main>
        <Hero />
        <Introduction />
        <Capabilities />
        <Solutions />
        <HowWeWork />
        <SelectedWork />
        <Technology />
        <WhyAlo />
        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}
