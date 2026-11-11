'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Bot, Check, Code2, Command, Cpu, Layers3, Menu, MessageSquare, Network, PhoneCall, Plus, ShieldCheck, Sparkles, WandSparkles, Workflow, X } from 'lucide-react'
import { Mark } from '@/components/brand/alo-logo'
import { COMPANY } from '@/lib/brand/tokens'

// The 3D 'AgentOS constellation' hero. Client-only (WebGL), lazy-loaded so it
// never blocks first paint; the component itself gates on IntersectionObserver,
// reduced-motion and WebGL support and falls back to the static alo-mark.
const Hero3D = dynamic(() => import('./hero-3d'), {
  ssr: false,
  loading: () => <div className="hero3d hero3d-loading" aria-hidden="true" />,
})

const navigation = [
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Selected work', href: '#selected-work' },
  { label: 'Technology', href: '#technology' },
  { label: 'For teams', href: '#use-cases' },
  { label: 'FAQ', href: '#faq' },
]

const examples = [
  'Help me plan a new project',
  'Turn my ideas into a brief',
  'Research a business question',
]

const features = [
  { icon: MessageSquare, color: 'violet', name: 'Command Center', label: 'START HERE', description: 'Start with a question or a goal. Give your ideas room to become a clear next step.' },
  { icon: Bot, color: 'orange', name: 'Specialist agents', label: 'YOUR AI TEAM', description: 'Bring different roles and perspectives together around the work that matters.' },
  { icon: Layers3, color: 'blue', name: 'Knowledge & memory', label: 'YOUR CONTEXT', description: 'Keep useful information close to the conversation, so work has a place to grow.' },
  { icon: Workflow, color: 'green', name: 'Workflows & runs', label: 'THE BIG PICTURE', description: 'Organize tasks into steps and follow recorded activity as your work moves forward.' },
]

function Header() {
  const [open, setOpen] = useState(false)
  return <header className="home-header">
    <div className="home-nav-wrap">
      <Link href="/" className="home-logo" aria-label="ALO Labs home"><Mark size={34} /><span>alo<span className="home-logo-light">labs</span><small>AGENTOS</small></span></Link>
      <nav className="home-desktop-nav" aria-label="Main navigation">{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
      <div className="home-nav-actions"><Link href="/login" className="home-login">Log in</Link><Link href="/login" className="home-button home-button-dark home-button-small">Open AgentOS <ArrowUpRight size={15}/></Link></div>
      <button className="home-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22}/> : <Menu size={22}/>}</button>
    </div>
    {open && <nav className="home-mobile-nav" aria-label="Mobile navigation">{navigation.map(item => <a onClick={() => setOpen(false)} key={item.href} href={item.href}>{item.label}</a>)}<Link href="/login">Open AgentOS <ArrowRight size={16}/></Link></nav>}
  </header>
}

function WorkspaceIllustration() {
  return <div className="workspace-outer" aria-label="Illustration of the AgentOS workspace">
    <div className="workspace-top"><div className="workspace-dots"><i/><i/><i/></div><span>WORKSPACE CONCEPT</span><span className="workspace-demo-label">Preview only · Sign in to access</span></div>
    <div className="workspace-body">
      <aside className="workspace-sidebar"><div className="workspace-brand"><span><Command size={15}/></span> AgentOS</div><div className="workspace-side-label">WORKSPACE</div><div className="workspace-side-item active"><Command size={14}/> Overview</div><div className="workspace-side-item"><Bot size={14}/> Agents</div><div className="workspace-side-item"><Layers3 size={14}/> Knowledge</div><div className="workspace-side-item"><Workflow size={14}/> Workflows</div><div className="workspace-side-bottom"><span className="workspace-avatar">A</span><span>ALO workspace<small>Made for your team</small></span></div></aside>
      <div className="workspace-main"><div className="workspace-heading"><div><span className="workspace-overline">YOUR COMMAND CENTER</span><h3>Good work starts here <span>✳</span></h3><p>One place for your ideas, context, and team.</p></div><div className="workspace-profile">A</div></div>
        <div className="workspace-prompt"><div className="workspace-prompt-top"><span><Sparkles size={15}/></span><strong>What would you like to work on?</strong></div><p>Describe your goal and bring your ideas to life...</p><div className="workspace-prompt-bottom"><span><Plus size={13}/> Add context</span><span className="workspace-send"><ArrowRight size={15}/></span></div></div>
        <div className="workspace-cards"><div className="workspace-mini-card"><span className="mini-icon purple"><Bot size={16}/></span><strong>Meet your agents</strong><small>Find the right perspective</small></div><div className="workspace-mini-card"><span className="mini-icon peach"><Layers3 size={16}/></span><strong>Bring your context</strong><small>Keep knowledge close</small></div></div>
      </div>
    </div>
    <div className="floating-note"><span><Sparkles size={15}/></span><div><strong>Made for good ideas</strong><small>And the people behind them.</small></div></div>
  </div>
}

function Hero() {
  const [prompt, setPrompt] = useState('')
  return <section className="home-hero"><div className="hero-orb hero-orb-one"/><div className="hero-orb hero-orb-two"/><div className="home-container hero-grid">
    <div className="hero-copy"><div className="home-eyebrow"><span className="eyebrow-star">✳</span> INTRODUCING ALO LABS AGENTOS</div><h1>Big ideas, meet <span>your AI team<span className="hero-period">.</span></span></h1><p className="hero-description">A little more help. A lot more possibility. Bring your agents, knowledge, and workflows together in one thoughtful workspace.</p>
      <form className="hero-prompt" action="/login" method="get"><label className="sr-only" htmlFor="home-prompt">Describe what you want to work on</label><Sparkles size={19} className="hero-prompt-icon"/><input id="home-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="What would you like to work on?"/><button type="submit" aria-label="Continue to AgentOS login"><ArrowRight size={19}/></button></form>
      <p className="hero-prompt-note">Try an idea here, then sign in to start a new conversation.</p>
      <div className="hero-examples"><span>TRY AN IDEA</span>{examples.map(example => <button type="button" key={example} onClick={() => setPrompt(example)}>{example} <ArrowUpRight size={12}/></button>)}</div>
    </div>
    <div className="hero-visual"><div className="hero-visual-label"><span className="visual-spark">✳</span> THE AGENTOS CONSTELLATION — HOVER A NODE, CLICK TO EXPLORE <span>✦</span></div><Hero3D /><div className="hero-visual-label hero-visual-label-preview"><span className="visual-spark">✳</span> A PREVIEW — NOT YOUR DASHBOARD <span>✦</span></div><WorkspaceIllustration /></div>
  </div><div className="home-container hero-bottom"><span><span className="hero-bottom-dot"/> BUILT FOR THOUGHTFUL WORK</span><a href="#platform">Discover what’s possible <ArrowDown size={14}/></a></div></section>
}

function Platform() {
  return <section id="platform" className="home-section home-platform"><div className="home-container"><div className="section-topline"><span className="section-kicker"><span>✳</span> GET TO KNOW AGENTOS</span><span className="section-index">01 / THE PLATFORM</span></div><div className="section-heading-row"><h2>All the pieces.<br/><em>One better place.</em></h2><p>Good work doesn’t happen in a vacuum. Bring your ideas, people, and AI together in a workspace designed to help you move forward.</p></div><div className="feature-grid">{features.map(({ icon: Icon, ...feature }, index) => <article className="feature-card" key={feature.name}><div className="feature-card-top"><span className={`feature-icon ${feature.color}`}><Icon size={21}/></span><span className="feature-number">0{index + 1}</span></div><div className="feature-content"><span className="feature-label">{feature.label}</span><h3>{feature.name}</h3><p>{feature.description}</p></div><span className="feature-arrow"><ArrowUpRight size={16}/></span></article>)}</div></div></section>
}

function HowItWorks() {
  return <section id="how-it-works" className="home-section home-how section-dark"><div className="home-container"><div className="section-topline"><span className="section-kicker"><span>✳</span> A SIMPLER WAY TO WORK</span><span className="section-index">02 / HOW IT WORKS</span></div><div className="how-grid"><div className="how-copy"><h2>From “what if”<br/>to <em>what’s next.</em></h2><p>Every great project begins somewhere. Start with a goal, add the right context, and keep people in the loop along the way.</p><Link href="/login" className="home-button home-button-dark">Explore your workspace <ArrowRight size={17}/></Link></div><div className="steps-card"><div className="steps-header"><span>THE WORKFLOW</span><span>AN EXAMPLE <Sparkles size={13}/></span></div>{[{ n:'01', title:'Start with your idea', text:'Tell AgentOS what you want to explore or accomplish.', icon: MessageSquare },{ n:'02', title:'Bring in the right context', text:'Connect your work with available knowledge and skills.', icon: Layers3 },{ n:'03', title:'Review and move forward', text:'Follow the work and make the decisions that matter.', icon: ShieldCheck }].map(({n,title,text,icon:Icon}) => <div className="step-row" key={n}><span className="step-number">{n}</span><span className="step-icon"><Icon size={18}/></span><div><h3>{title}</h3><p>{text}</p></div><Check size={16} className="step-check"/></div>)}<div className="steps-footer"><span><ShieldCheck size={15}/> People stay part of the process</span><ArrowUpRight size={15}/></div></div></div></div></section>
}

function UseCases() {
  return <section id="use-cases" className="home-section home-cases"><div className="home-container"><div className="section-topline"><span className="section-kicker"><span>✳</span> MAKE IT YOURS</span><span className="section-index">03 / FOR YOUR TEAM</span></div><div className="section-heading-row"><h2>Made for the way<br/><em>you work.</em></h2><p>Whether you’re building something new or bringing a team together, there’s a place to begin.</p></div><div className="case-grid"><article className="case-card case-lilac"><div className="case-card-head"><span><Code2 size={20}/></span><ArrowUpRight size={17}/></div><div><span className="case-label">FOR BUILDERS</span><h3>Make ideas clearer.</h3><p>Explore technical questions and turn your next project into a plan.</p></div></article><article className="case-card case-peach"><div className="case-card-head"><span><WandSparkles size={20}/></span><ArrowUpRight size={17}/></div><div><span className="case-label">FOR CREATIVE TEAMS</span><h3>Go from blank to brief.</h3><p>Develop ideas, draft content, and find a little creative momentum.</p></div></article><article className="case-card case-mint"><div className="case-card-head"><span><Network size={20}/></span><ArrowUpRight size={17}/></div><div><span className="case-label">FOR OPERATIONS</span><h3>Bring work together.</h3><p>Organize context, workflows, and the people behind the work.</p></div></article></div></div></section>
}

/**
 * Selected work — exactly the three efforts that exist in this repository,
 * each with its honest status. The one-line descriptions only state what the
 * codebase actually contains: AgentOS is the product behind authenticated
 * access; the voice calling-center runtime is present in the repo but not a
 * public offering; Engineering Intelligence is internal tooling.
 */
const selectedWork = [
  {
    icon: Bot,
    name: 'AgentOS',
    status: 'Live',
    tone: 'live',
    description: 'The AI agent operating system behind authenticated sign-in — command center, specialist agents, knowledge, and workflows, served from agents.alolabs.net.',
  },
  {
    icon: PhoneCall,
    name: 'Voice Contact Center',
    status: 'In development',
    tone: 'dev',
    description: 'A voice channel for AgentOS. The calling-center runtime in this codebase — conversation brain, campaign dialer, recording pipeline, and human handoff — is being built toward availability.',
  },
  {
    icon: Cpu,
    name: 'Engineering Intelligence',
    status: 'Internal',
    tone: 'internal',
    description: 'ALO Labs tooling used inside the company to study and improve how AgentOS itself is engineered. It is not part of the public product.',
  },
]

function SelectedWork() {
  return <section id="selected-work" className="home-section home-work section-dark"><div className="home-container"><div className="section-topline"><span className="section-kicker"><span>✳</span> WHAT WE'RE BUILDING</span><span className="section-index">04 / SELECTED WORK</span></div><div className="section-heading-row"><h2>Selected work,<br/><em>plainly labeled.</em></h2><p>What's live, what's still in development, and what stays internal — stated exactly as it is.</p></div><div className="work-grid">{selectedWork.map(({ icon: Icon, ...work }) => <article className="work-card" key={work.name}><div className="work-card-head"><span className="work-icon"><Icon size={20}/></span><span className={`work-status work-status-${work.tone}`}>{work.status}</span></div><h3>{work.name}</h3><p>{work.description}</p></article>)}</div></div></section>
}

/**
 * Technology — the actual stack this repository runs on, verified against
 * package.json. Nothing listed here is aspirational.
 */
const stack = [
  { name: 'Next.js 16', note: 'App Router framework' },
  { name: 'React 19', note: 'UI runtime' },
  { name: 'TypeScript', note: 'Type-safe codebase' },
  { name: 'Prisma', note: 'Data layer & migrations' },
  { name: 'Tailwind CSS', note: 'Styling system' },
  { name: 'Radix UI', note: 'Accessible UI primitives' },
  { name: 'Node & Bun', note: 'Runtime & toolchain' },
  { name: 'three.js · React Three Fiber', note: 'WebGL scenes' },
  { name: 'Vitest', note: 'Test runner' },
]

function Technology() {
  return <section id="technology" className="home-section home-tech"><div className="home-container"><div className="section-topline"><span className="section-kicker"><span>✳</span> UNDER THE HOOD</span><span className="section-index">05 / TECHNOLOGY</span></div><div className="section-heading-row"><h2>Built on proven<br/><em>foundations.</em></h2><p>The stack this site and product actually run on — the same tools in our package.json today.</p></div><ul className="tech-grid">{stack.map(item => <li className="tech-card" key={item.name}><strong>{item.name}</strong><span>{item.note}</span></li>)}</ul></div></section>
}

const faqs = [
  { q: 'What is ALO Labs AgentOS?', a: 'AgentOS is a workspace designed to bring AI agents, knowledge, workflows, and human oversight together.' },
  { q: 'What can I use it for?', a: 'You can explore ideas, organize knowledge, and work with available agents and tools. Capabilities depend on your deployment and configuration.' },
  { q: 'Do I need to set up an AI provider?', a: 'Yes. AI-powered responses require a configured and available model provider. Features and costs depend on the model and deployment you choose.' },
  { q: 'Are people still in control?', a: 'Human oversight matters. Permissions, available tools, and approval workflows depend on your deployment; sensitive actions should be reviewed.' },
]
function FAQ() {
  return <section id="faq" className="home-section home-faq"><div className="home-container faq-grid"><div><span className="section-kicker"><span>✳</span> GOOD TO KNOW</span><h2>A few things<br/><em>you might ask.</em></h2><p>Curious about AgentOS? Here’s a little more about the workspace we’re building.</p><a href={COMPANY.emailHref} className="faq-contact">Still have a question? <ArrowUpRight size={15}/></a></div><div className="faq-list">{faqs.map(item => <details key={item.q}><summary>{item.q}<span><Plus size={17}/></span></summary><p>{item.a}</p></details>)}</div></div></section>
}

function Footer() {
  // Footer anchor list mirrors the main navigation, including the new sections.
  return <><section className="home-cta"><div className="home-container"><div className="cta-inner"><div className="cta-spark cta-spark-one">✳</div><div className="cta-spark cta-spark-two">✦</div><div className="cta-content"><span className="cta-eyebrow">A LITTLE HELP FOR WHAT’S NEXT</span><h2>Let’s make good<br/><em>work happen.</em></h2><p>Your next idea has a place to begin.</p><Link className="home-button home-button-light" href="/login">Open AgentOS <ArrowRight size={17}/></Link></div></div></div></section><footer className="home-footer"><div className="home-container"><div className="footer-main"><div><Link href="/" className="home-logo" aria-label="ALO Labs home"><Mark size={34}/><span>alo<span className="home-logo-light">labs</span><small>AGENTOS</small></span></Link><p>A thoughtful workspace for<br/>people and their ideas.</p></div><div className="footer-links"><div><strong>EXPLORE</strong><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#selected-work">Selected work</a><a href="#technology">Technology</a><a href="#use-cases">For teams</a></div><div><strong>ALO LABS</strong><a href="#faq">FAQ</a><a href={COMPANY.emailHref}>Contact</a><Link href="/login">Log in</Link></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} ALO Labs. All rights reserved.</span><span>Made for what’s next <span className="footer-star">✳</span></span></div></div></footer></>
}

export function HomeExperience() {
  return <div className="home-experience"><Header/><main><Hero/><Platform/><HowItWorks/><UseCases/><SelectedWork/><Technology/><FAQ/></main><Footer/></div>
}
