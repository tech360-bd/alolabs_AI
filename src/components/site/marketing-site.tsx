'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowDown, ArrowRight, ArrowUpRight, Bot, Braces, Check, ChevronRight, CircleDot, Command, Database, FileText, GitBranch, Layers3, LockKeyhole, Menu, MessageSquareText, Network, ShieldCheck, Sparkles, Workflow, X } from 'lucide-react'
import { useState } from 'react'
import { Mark } from '@/components/brand/alo-logo'
import { COMPANY } from '@/lib/brand/tokens'

const navigation = [
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Use cases', href: '#use-cases' },
  { label: 'FAQ', href: '#faq' },
]
export const HOME_SECTIONS = navigation

const capabilities = [
  { icon: MessageSquareText, number: '01', title: 'Command Center', description: 'Give your AI agent a task in natural language and follow the conversation in one place.', tag: 'THE STARTING POINT' },
  { icon: Bot, number: '02', title: 'AI workforce', description: 'Organize specialist agents around roles, departments, and the work your team needs to do.', tag: 'THE TEAM' },
  { icon: Database, number: '03', title: 'Knowledge & memory', description: 'Bring context into the conversation with a knowledge base and company-scoped memory.', tag: 'THE CONTEXT' },
  { icon: Workflow, number: '04', title: 'Workflows & runs', description: 'Structure work into steps and review recorded run activity as tasks move forward.', tag: 'THE WORK' },
  { icon: ShieldCheck, number: '05', title: 'Governance', description: 'Define rules, permissions, and approval boundaries for work that needs oversight.', tag: 'THE GUARDRAILS' },
  { icon: Layers3, number: '06', title: 'Skills & tools', description: 'Give agents task-specific guidance while keeping tool access subject to existing policies.', tag: 'THE CAPABILITIES' },
]

const steps = [
  { number: '01', title: 'Start with a goal', body: 'Tell the Command Center what you need, from a research question to a business task.' },
  { number: '02', title: 'Bring in context', body: 'Agents can use available knowledge, skills and authorized tools to help shape a response.' },
  { number: '03', title: 'Review the work', body: 'Follow the output and recorded activity. Keep people involved where decisions need approval.' },
]

const cases = [
  { icon: Braces, label: 'FOR BUILDERS', title: 'Make ideas clearer.', body: 'Explore technical questions, organize requirements, and use AI assistance to think through the next step.', className: 'bg-[#f3f1ff]', symbol: '01 / BUILD' },
  { icon: Sparkles, label: 'FOR CREATIVE TEAMS', title: 'Move from blank to brief.', body: 'Develop ideas, draft content, and bring brand context into your creative process.', className: 'bg-[#fff2e9]', symbol: '02 / CREATE' },
  { icon: Network, label: 'FOR OPERATIONS', title: 'Bring work together.', body: 'Organize departments, shared knowledge, and workflows in a single operating environment.', className: 'bg-[#edf5ff]', symbol: '03 / OPERATE' },
]

const faqs = [
  { q: 'What is an AI agent?', a: 'An AI agent is software that uses an AI model, instructions, and available tools to help with a task. What it can actually do depends on its permissions, configuration, and the tools it has been given.' },
  { q: 'What is ALO Labs AgentOS?', a: 'AgentOS is our AI agent operating system: a workspace for bringing agents, knowledge, workflows, and governance together. It is designed to help teams organize and oversee AI-assisted work.' },
  { q: 'Can agents take action on their own?', a: 'Capabilities vary by agent and deployment. The Command Agent uses a bounded set of tools; sensitive actions and broader automation require the appropriate configuration, permissions, and review.' },
  { q: 'Do I need to configure an AI provider?', a: 'Yes. AI-powered responses depend on a configured and available model provider. Availability, features, and cost depend on your deployment and provider settings.' },
]

function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="relative z-30 border-b border-slate-200/80 bg-white">
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label="ALO Labs AgentOS home" className="flex shrink-0 items-center gap-2.5"><Mark size={35} /><span className="text-[19px] font-bold tracking-[-0.05em] text-[#101a33]">ALO Labs<span className="ml-1.5 text-[11px] font-semibold tracking-normal text-slate-400">AgentOS</span></span></Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-9 lg:flex">{navigation.map((item) => <a key={item.href} href={item.href} className="text-[13px] font-semibold text-slate-600 transition hover:text-blue-700">{item.label}</a>)}</nav>
        <div className="hidden items-center gap-6 sm:flex"><Link href="/login" className="text-[13px] font-semibold text-slate-700 hover:text-blue-700">Log in</Link><Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#112048] px-4 text-[13px] font-semibold text-white transition hover:bg-blue-800">Open AgentOS <ArrowUpRight size={15} /></Link></div>
        <button className="rounded-lg p-2 text-slate-800 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={23} /> : <Menu size={23} />}</button>
      </div>
      {open && <nav aria-label="Mobile navigation" className="absolute left-0 right-0 border-b border-slate-200 bg-white px-5 pb-5 shadow-lg lg:hidden">{navigation.map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block border-t border-slate-100 py-3 text-sm font-semibold text-slate-700">{item.label}</a>)}<Link href="/login" className="mt-2 flex justify-center rounded-lg bg-[#112048] px-4 py-3 text-sm font-semibold text-white">Open AgentOS</Link></nav>}
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#08132b] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(113,145,206,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(113,145,206,.16) 1px, transparent 1px)', backgroundSize: '60px 60px', maskImage: 'linear-gradient(to right, transparent 15%, black)' }} />
      <div className="relative mx-auto grid min-h-[650px] max-w-[1320px] items-center gap-5 px-5 pb-12 pt-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-12 lg:pb-20 lg:pt-20">
        <div className="relative z-10 max-w-[620px]">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.17em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-[#ff914d]" /> Meet your AI operating system</div>
          <h1 className="text-[48px] font-semibold leading-[1.04] tracking-[-.055em] sm:text-[64px] xl:text-[76px]">Good ideas deserve <span className="text-[#92b9ff]">a great team.</span></h1>
          <p className="mt-6 max-w-[490px] text-[16px] leading-[1.8] text-[#b4c0d6] sm:text-[17px]">Meet ALO Labs AgentOS: a place to bring AI agents, your knowledge, and your workflows together. Give your ideas the context to become meaningful work.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/login" className="inline-flex h-12 items-center gap-3 rounded-lg bg-[#ff7435] px-5 text-sm font-bold text-white transition hover:bg-[#ff8b57]">Open AgentOS <ArrowRight size={17} /></Link><a href="#how-it-works" className="inline-flex h-12 items-center gap-3 rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/10">See how it works <ArrowDown size={16} /></a></div>
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-medium text-[#9aaac4]"><span className="flex items-center gap-2"><Check size={14} className="text-[#81aaff]" /> Your goals, in focus</span><span className="flex items-center gap-2"><Check size={14} className="text-[#81aaff]" /> People in control</span><span className="flex items-center gap-2"><Check size={14} className="text-[#81aaff]" /> One connected workspace</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[590px] lg:ml-auto">
          <div className="relative aspect-[1.17] overflow-hidden rounded-2xl"><Image src="/agentos-orbit.png" alt="" fill priority sizes="(max-width: 1024px) 90vw, 590px" className="object-cover mix-blend-screen" /></div>
          <div className="absolute bottom-[5%] left-[2%] w-[78%] max-w-[330px] rounded-xl border border-white/15 bg-[#101d39]/90 p-4 shadow-2xl backdrop-blur-xl sm:left-[3%] sm:p-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#94a7c7]"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/20 text-blue-300"><Command size={13} /></span> AgentOS workspace <span className="ml-auto text-[9px] text-[#8191ad]">Illustration</span></div>
            <p className="mt-4 text-sm font-medium leading-relaxed text-white">“Help me plan our next project.”</p>
            <div className="mt-4 h-px bg-white/10" />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[#acbad0]"><CircleDot size={13} className="text-[#ff9a68]" /> Context, tools &amp; people working together</div>
          </div>
          <div className="absolute right-[2%] top-[16%] hidden rounded-xl border border-white/15 bg-[#101d39]/90 px-4 py-3 shadow-xl backdrop-blur sm:block"><div className="flex items-center gap-2 text-[11px] text-blue-100"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff7435]/20 text-[#ff9a68]"><Bot size={16} /></span><span><b className="block text-white">Specialist agents</b><span className="text-[#96a7c1]">Built around your work</span></span></div></div>
        </div>
      </div>
      <div className="relative border-t border-white/10"><div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#8293b1] sm:px-8 lg:px-12"><span className="text-[#b3c1d7]">One workspace for</span><span>AI agents</span><span className="text-[#ff8750]">✳</span><span>Knowledge</span><span className="text-[#ff8750]">✳</span><span>Workflows</span><span className="text-[#ff8750]">✳</span><span>Human oversight</span></div></div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#f16c2d]"><span className="h-1.5 w-1.5 rounded-full bg-[#f16c2d]" /> {eyebrow}</p><h2 className="mt-4 max-w-[690px] text-[35px] font-semibold leading-[1.12] tracking-[-.045em] text-[#101a33] sm:text-[47px]">{title}</h2><p className="mt-4 max-w-[570px] text-[15px] leading-7 text-slate-500">{description}</p></div>
}

export function MarketingSite() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#101a33]">
      <SiteHeader />
      <main>
        <Hero />
        <section id="platform" className="scroll-mt-8 bg-[#fafbfe] px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="mx-auto max-w-[1224px]">
          <div className="flex flex-wrap items-end justify-between gap-6"><SectionHeading eyebrow="Meet the platform" title="A little more clarity. A lot more possibility." description="AI is more useful when it understands the work around it. AgentOS brings the pieces together so your team can move with purpose." /><a href="#how-it-works" className="group inline-flex items-center gap-2 pb-1 text-sm font-semibold text-[#173d91]">Explore how it works <ArrowRight size={16} className="transition group-hover:translate-x-1" /></a></div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map(({ icon: Icon, ...card }) => <article key={card.title} className="group min-h-[235px] rounded-xl border border-[#e6eaf2] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50"><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf3ff] text-[#2855ad]"><Icon size={20} strokeWidth={1.7} /></div><span className="font-mono text-[11px] text-slate-300">{card.number}</span></div><h3 className="mt-6 text-[18px] font-semibold tracking-tight">{card.title}</h3><p className="mt-2 max-w-[300px] text-[13px] leading-6 text-slate-500">{card.description}</p><p className="mt-5 text-[9px] font-bold tracking-[.14em] text-[#9aabc4]">{card.tag}</p></article>)}</div>
        </div></section>
        <section id="how-it-works" className="scroll-mt-8 px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="mx-auto grid max-w-[1224px] gap-14 lg:grid-cols-[.9fr_1.1fr] lg:gap-24">
          <div><SectionHeading eyebrow="How it works" title="From a question to a way forward." description="Think of AgentOS as a home for your AI-assisted work—not just another chat window." /><Link href="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#173d91]">Go to the Command Center <ArrowRight size={16} /></Link></div>
          <div className="border-t border-slate-200">{steps.map((step) => <div key={step.number} className="grid grid-cols-[45px_1fr] gap-4 border-b border-slate-200 py-6 sm:grid-cols-[65px_1fr]"><span className="pt-1 font-mono text-xs text-[#ef7b48]">{step.number} /</span><div><h3 className="text-lg font-semibold tracking-tight">{step.title}</h3><p className="mt-2 max-w-[440px] text-sm leading-6 text-slate-500">{step.body}</p></div></div>)}</div>
        </div></section>
        <section className="bg-[#101b36] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-24"><div className="mx-auto grid max-w-[1224px] items-center gap-12 lg:grid-cols-2 lg:gap-24">
          <div className="order-2 rounded-2xl border border-white/10 bg-[#162442] p-5 shadow-2xl sm:p-7 lg:order-1"><div className="flex items-center gap-2 border-b border-white/10 pb-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/15 text-blue-200"><Command size={16} /></div><div><p className="text-xs font-semibold">A place for the whole picture</p><p className="text-[10px] text-slate-400">Illustrative workflow</p></div></div><div className="mt-6 space-y-3">{[{ icon: MessageSquareText, text: 'Describe what you want to accomplish', sub: 'YOUR GOAL' }, { icon: GitBranch, text: 'Connect the right context and skills', sub: 'AGENT WORKSPACE' }, { icon: FileText, text: 'Review the result and next steps', sub: 'YOUR REVIEW' }].map(({ icon: Icon, text, sub }, index) => <div key={text} className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[.035] p-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${index === 1 ? 'bg-orange-400/15 text-orange-300' : 'bg-blue-400/15 text-blue-200'}`}><Icon size={16} /></span><div><p className="text-[9px] font-semibold tracking-[.14em] text-slate-400">{sub}</p><p className="mt-1 text-[13px] font-medium text-white">{text}</p></div><ChevronRight className="ml-auto text-slate-500" size={16} /></div>)}</div></div>
          <div className="order-1 lg:order-2"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff9b6a]">Made for meaningful work</p><h2 className="mt-4 text-[36px] font-semibold leading-[1.12] tracking-[-.045em] sm:text-[47px]">Your intelligence. <span className="text-[#9cbcff]">Amplified.</span></h2><p className="mt-5 max-w-[450px] text-[15px] leading-7 text-slate-300">From your first prompt to the next decision, keep the important pieces in view. AgentOS is designed to help people and AI work together with context and care.</p><div className="mt-7 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.04] p-4"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#ff9b6a]" /><p className="text-[13px] leading-6 text-slate-300">Permissions and human review matter. Available features depend on your deployment and configuration.</p></div></div>
        </div></section>
        <section id="use-cases" className="scroll-mt-8 bg-[#fafbfe] px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="mx-auto max-w-[1224px]"><SectionHeading eyebrow="Built for your kind of work" title="A workspace that grows with your ideas." description="Whether you are building, creating, or coordinating, start with a goal and bring the right context along." /><div className="mt-12 grid gap-4 md:grid-cols-3">{cases.map(({ icon: Icon, ...item }) => <article key={item.title} className={`flex min-h-[320px] flex-col rounded-xl p-7 ${item.className}`}><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/75 text-[#223d75]"><Icon size={20} /></span><span className="font-mono text-[10px] text-slate-400">{item.symbol}</span></div><p className="mt-auto pt-14 text-[10px] font-bold tracking-[.15em] text-[#607296]">{item.label}</p><h3 className="mt-3 text-[23px] font-semibold tracking-[-.035em]">{item.title}</h3><p className="mt-2 text-[13px] leading-6 text-slate-600">{item.body}</p></article>)}</div></div></section>
        <section id="faq" className="scroll-mt-8 px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="mx-auto grid max-w-[1224px] gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-24"><SectionHeading eyebrow="Good to know" title="The questions behind the possibilities." description="A little more about AI agents and the workspace we are building." /><div className="border-t border-slate-200">{faqs.map((faq) => <details key={faq.q} className="group border-b border-slate-200"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">{faq.q}<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-normal group-open:rotate-45">+</span></summary><p className="max-w-[560px] pb-6 pr-6 text-sm leading-7 text-slate-500">{faq.a}</p></details>)}</div></div></section>
        <section className="px-5 pb-10 sm:px-8 lg:px-12 lg:pb-16"><div className="relative mx-auto overflow-hidden rounded-2xl bg-[#1f4da2] px-7 py-12 text-white sm:px-12 sm:py-16 lg:flex lg:max-w-[1224px] lg:items-end lg:justify-between"><div aria-hidden="true" className="absolute -right-12 -top-40 h-80 w-80 rounded-full border-[50px] border-white/[.05]" /><div className="relative"><p className="text-[10px] font-bold uppercase tracking-[.17em] text-blue-200">The next step is yours</p><h2 className="mt-4 max-w-[650px] text-[34px] font-semibold leading-tight tracking-[-.04em] sm:text-[46px]">Let’s make good work happen.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-blue-100">Explore the workspace or get in touch to talk about your team’s goals.</p></div><div className="relative mt-7 flex flex-wrap gap-3 lg:mt-0"><Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-[#14336f] hover:bg-blue-50">Open AgentOS <ArrowRight size={16} /></Link><a href={COMPANY.emailHref} className="inline-flex h-11 items-center rounded-lg border border-white/40 px-5 text-sm font-semibold hover:bg-white/10">Contact us</a></div></div></section>
      </main>
      <footer className="border-t border-slate-100 px-5 py-10 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1224px] flex-col justify-between gap-8 sm:flex-row"><div><Link href="/" className="flex items-center gap-2"><Mark size={30} /><span className="font-bold tracking-tight">ALO Labs <span className="text-slate-400">AgentOS</span></span></Link><p className="mt-3 max-w-xs text-xs leading-6 text-slate-500">An AI agent operating system for people with ideas worth pursuing.</p></div><div className="flex flex-wrap gap-x-10 gap-y-3 text-xs font-medium text-slate-500"><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a href={COMPANY.emailHref}>Contact</a><Link href="/login">Log in</Link></div></div><div className="mx-auto mt-10 flex max-w-[1224px] flex-wrap justify-between gap-3 border-t border-slate-100 pt-5 text-[11px] text-slate-400"><span>© {new Date().getFullYear()} ALO Labs. All rights reserved.</span><span>Thoughtfully built for what’s next.</span></div></footer>
    </div>
  )
}
