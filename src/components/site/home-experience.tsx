import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, ArrowUpRight, Blocks, Braces, Check, ChevronDown, CircuitBoard,
  Fingerprint, FolderKanban, Layers3, LockKeyhole, Plus, Route, ShieldCheck,
} from 'lucide-react'
import { publicBrandStyle } from '@/lib/brand/public'
import { SiteHeader } from './site-header'
import { SiteFooter } from './chrome'
import { StudioFigure } from './studio-figure'
import { NetworkViewer } from './network-viewer'

const disciplines = [
  { title: 'AI & automation', area: 'Intelligence', image: 'logic-core', target: 'ai-automation', text: 'Turn repetitive tasks into reviewable workflows that give your team time back.' },
  { title: 'Software & platforms', area: 'Engineering', image: 'platform-stack', target: 'custom-software', text: 'Web platforms and purpose-built applications shaped around how your business runs.' },
  { title: 'Connected systems', area: 'Integration', image: 'system-bridge', target: 'workflow-integrations', text: 'Connect your tools, data, and teams without the manual hand-offs in between.' },
] as const

const solutionIndex = [
  ['AI & intelligent automation', 'ai-automation'], ['Custom software', 'custom-software'],
  ['Web platforms', 'web-platforms'], ['Mobile applications', 'mobile'], ['Business systems & CRM', 'business-systems'],
  ['Workflow integrations', 'workflow-integrations'], ['Client portals & SaaS', 'portals-saas'],
  ['Cloud infrastructure', 'cloud-infrastructure'], ['AI-assisted customer experience', 'ai-customer-experience'],
] as const

const stages = [
  { name: 'Discovery', detail: 'We sit down with the people who do the work. Together we map the problem, the existing systems, and what a useful first release would change.' },
  { name: 'Strategy & architecture', detail: 'You get a written scope: the system design, delivery milestones, trade-offs, and who is responsible for each decision.' },
  { name: 'Design & engineering', detail: 'We build in small increments. Your team tries the software, reviews real workflows, and helps shape the next iteration.' },
  { name: 'Launch & handover', detail: 'We verify the release, document how to operate it, and hand it over with a clear deployment and recovery plan.' },
  { name: 'Continuous improvement', detail: 'After launch we agree on maintenance, support, and the next improvements based on how the system is actually used.' },
] as const

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="lab-eyebrow"><i aria-hidden="true" />{children}</p>
}

function Hero() {
  return (
    <section className="lab-hero" aria-labelledby="home-title">
      <div className="studio-shell lab-hero-grid">
        <div className="lab-intro">
          <p className="lab-badge"><i aria-hidden="true" /> AI &amp; SOFTWARE STUDIO</p>
          <h1 id="home-title">Building intelligent <span>digital experiences<i>.</i></span></h1>
          <p className="lab-lead">We design custom software, AI workflows, and digital platforms around the way your business works.</p>
          <div className="lab-actions">
            <Link href="/site/contact" className="lab-button lab-primary">Start a project <ArrowUpRight size={17} /></Link>
            <Link href="/site/solutions" className="lab-button lab-secondary">Explore our solutions <ArrowRight size={16} /></Link>
          </div>
          <div className="lab-principles">
            <span><Fingerprint />Human-led engineering</span><i aria-hidden="true" /><span><ShieldCheck />Secure by design</span>
          </div>
        </div>
        <StudioFigure />
      </div>
    </section>
  )
}

function StudioIndex() {
  const figures = [
    { icon: Layers3, value: '06', label: 'Service lines', href: '/site/services' },
    { icon: Blocks, value: String(solutionIndex.length).padStart(2, '0'), label: 'Solution areas', href: '/site/solutions' },
    { icon: Route, value: String(stages.length).padStart(2, '0'), label: 'Delivery stages', href: '#process' },
    { icon: LockKeyhole, value: '01', label: 'Client portal', href: '/portal' },
  ]
  return (
    <nav className="lab-index" aria-label="Studio at a glance">
      <div className="studio-shell lab-figures">
        {figures.map(({ icon: Icon, ...f }) => <Link href={f.href} key={f.label} className="lab-metric"><span className="lab-metric-icon"><Icon size={23} strokeWidth={1.55} /></span><span><strong>{f.value}</strong><small>{f.label}</small></span></Link>)}
      </div>
    </nav>
  )
}

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

/** Technology reference paired with the interactive engineering exhibit. */
function Technology() {
  return (
    <details className="lab-solutions lab-technology">
      <summary><span><Layers3 size={17} /> Technology &amp; delivery</span><ChevronDown size={15} /></summary>
      <ul aria-label="Engineering stack">{stack.map(({ name, note }) => (
        <li key={name}><strong>{name}</strong><small>{note}</small></li>
      ))}</ul>
      <ul aria-label="Delivery principles">{deliveryPrinciples.map(line => <li key={line}>{line}</li>)}</ul>
    </details>
  )
}

function Capabilities() {
  return (
    <section className="lab-section lab-capabilities" id="capabilities" aria-labelledby="cap-title">
      <div className="studio-shell">
        <Eyebrow>01 / CORE CAPABILITIES</Eyebrow>
        <div className="lab-heading-row"><h2 id="cap-title">Inside the lab<span>.</span></h2><Link className="lab-inline" href="/site/solutions">All solutions <ArrowUpRight size={16} /></Link></div>
        <div className="lab-card-grid">
          {disciplines.map((item, i) => (
            <Link key={item.target} href={`/site/solutions#${item.target}`} className="lab-card">
              <div className="lab-card-art">
                <Image unoptimized src={`/studio/${item.image}.webp`} fill sizes="(max-width: 700px) 100vw, 33vw" alt="" />
                <span className="lab-card-id">0{i + 1} <i>/</i> {item.area}</span><span className="lab-card-arrow"><ArrowUpRight size={15} /></span>
              </div>
              <div className="lab-card-copy"><h3>{item.title}</h3><p>{item.text}</p></div>
            </Link>
          ))}
        </div>
        <details className="lab-solutions" id="solutions">
          <summary><span><Braces size={17} /> Explore the full solution index</span><span className="lab-index-count">09 AREAS <ChevronDown size={15} /></span></summary>
          <ul>{solutionIndex.map(([name, id]) => <li key={id}><Link href={`/site/solutions#${id}`}>{name}<ArrowUpRight size={14} /></Link></li>)}</ul>
        </details>
      </div>
    </section>
  )
}

function Studio() {
  return (
    <section className="lab-section lab-story" id="introduction" aria-labelledby="studio-title">
      <div className="studio-shell lab-pair">
        <div>
          <Eyebrow>02 / THE STUDIO</Eyebrow>
          <h2 id="studio-title">Systems, not silos<span>.</span></h2>
          <p className="lab-paragraph">A workflow rarely stops at one tool. We design the software, the AI, and the connections between them as one system — from the first conversation to the handover.</p>
          <p className="lab-paragraph">Explore our interactive network: each node leads to a different part of the studio.</p>
          <Link className="lab-inline" href="/site/about">About ALO Labs <ArrowRight size={16} /></Link>
        </div>
        <div id="technology"><NetworkViewer /><Technology /></div>
      </div>
    </section>
  )
}

function Process() {
  return (
    <section id="process" className="lab-section lab-process" aria-labelledby="process-title">
      <div className="studio-shell lab-pair">
        <div>
          <Eyebrow>03 / DELIVERY PROCESS</Eyebrow><h2 id="process-title">From first brief<br />to handover<span>.</span></h2>
          <p className="lab-paragraph">Five stages, with a clear decision at each one. Here’s what working together looks like.</p>
          <Link className="lab-inline" href="/site/how-we-work">How we work <ArrowRight size={16} /></Link>
        </div>
        <div className="lab-steps">{stages.map((s, i) => <details name="delivery-stage" key={s.name} open={i === 0}>
          <summary><small>0{i + 1}</small>{s.name}<Plus size={18} /></summary><p>{s.detail}</p>
        </details>)}</div>
      </div>
    </section>
  )
}

function Work() {
  const projects = [
    { icon: FolderKanban, title: 'Client portal', status: 'Live', description: 'One place to request work, review deliverables, and manage invoices.' },
    { icon: CircuitBoard, title: 'Voice contact center', status: 'In development', description: 'AI-assisted customer conversations with hand-off to a human team.' },
    { icon: Braces, title: 'Custom client systems', status: 'Project engagement', description: 'Bespoke software, integrations, and automation for individual clients.' },
  ]
  return (
    <section className="lab-section lab-work" id="work" aria-labelledby="work-title"><div className="studio-shell">
      <Eyebrow>04 / SELECTED WORK</Eyebrow>
      <div className="lab-heading-row"><h2 id="work-title">On the workbench<span>.</span></h2><Link className="lab-inline" href="/site/projects">All projects <ArrowUpRight size={16} /></Link></div>
      <div className="lab-projects">{projects.map(({ icon: Icon, ...p }) => <article key={p.title}>
        <Icon size={24} strokeWidth={1.5} /><h3>{p.title}</h3><p>{p.description}</p><small>{p.status}</small>
      </article>)}</div>
    </div></section>
  )
}

function ContactBand() {
  return (
    <section className="lab-contact" id="why"><div className="studio-shell lab-contact-row"><div>
      <Eyebrow>START A CONVERSATION</Eyebrow><h2>What are you building<span>?</span></h2>
      <p><Check size={15} /> Clear scope <Check size={15} /> Reviewed delivery <Check size={15} /> Accountable people</p>
    </div><Link href="/site/contact" className="lab-button lab-primary">Start a project <ArrowUpRight size={17} /></Link></div></section>
  )
}

/** Public studio only. Login, portal and internal application boundaries are unchanged. */
export function HomeExperience() {
  return (
    <div className="public-site" style={publicBrandStyle}>
      <SiteHeader />
      <main id="site-main" className="lab-home"><Hero /><StudioIndex /><Capabilities /><Studio /><Process /><Work /><ContactBand /></main>
      <SiteFooter />
    </div>
  )
}
