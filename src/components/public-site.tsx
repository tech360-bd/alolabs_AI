'use client'

import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/app'
import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  Cpu,
  Globe,
  Globe2,
  Layers,
  Lock,
  Menu,
  Monitor,
  Rocket,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  Zap,
  ChevronRight,
  Code2,
  Server,
  HardDrive,
  FileCheck,
  Scale,
  Terminal,
  Database,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Activity,
  Clock,
  Cloud,
  Network,
  GitBranch,
  Key,
  Eye,
  BarChart3,
  Users,
  Puzzle,
  BookOpen,
  DollarSign,
  Star,
  ArrowLeft,
  AlertTriangle,
  FileText,
  RefreshCw,
} from 'lucide-react'

type PageId =
  | 'home'
  | 'about'
  | 'platform'
  | 'agents'
  | 'departments'
  | 'infrastructure'
  | 'services'
  | 'api'
  | 'workflows'
  | 'local-ai'
  | 'private-models'
  | 'security'
  | 'integration'
  | 'developers'
  | 'pricing'
  | 'request-access'
  | 'contact'
  | 'documentation'
  | 'status'
  | 'privacy'
  | 'terms'
  | 'security-policy'
  | 'acceptable-use'
  | 'data-processing'
  | 'ai-governance'

interface NavEntry {
  id: PageId
  label: string
  children?: { id: PageId; label: string }[]
}

const mainNav: NavEntry[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'platform', label: 'Platform' },
  { id: 'agents', label: 'AI Agents' },
  { id: 'departments', label: 'Departments' },
  { id: 'services', label: 'Services' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'developers', label: 'Developers' },
  { id: 'documentation', label: 'Docs' },
  { id: 'contact', label: 'Contact' },
]

const moreNav: NavEntry[] = [
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'api', label: 'Agent API' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'local-ai', label: 'Local AI' },
  { id: 'private-models', label: 'Private Models' },
  { id: 'security', label: 'Security' },
  { id: 'integration', label: 'Integration' },
  { id: 'status', label: 'Status' },
  { id: 'request-access', label: 'Request Access' },
]

const legalNav: NavEntry[] = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'security-policy', label: 'Security Policy' },
  { id: 'acceptable-use', label: 'Acceptable Use' },
  { id: 'data-processing', label: 'Data Processing' },
  { id: 'ai-governance', label: 'AI Governance' },
]

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-12 md:mb-16">
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">{title}</h2>
      {subtitle && <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="group p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] hover:border-[#00D4FF]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,212,255,0.08)]">
      <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4 group-hover:bg-[#00D4FF]/20 transition-colors">
        <Icon className="w-6 h-6 text-[#00D4FF]" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

function CTAButton({ children, href, variant = 'primary' }: { children: React.ReactNode; href?: PageId; variant?: 'primary' | 'secondary' }) {
  const navigate = usePublicNav()
  const cls =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 px-6 py-3 bg-[#00D4FF] text-[#0A1628] font-semibold rounded-lg hover:bg-[#00B8E6] transition-colors'
      : 'inline-flex items-center gap-2 px-6 py-3 border border-[#1E3A5F] text-white rounded-lg hover:border-[#00D4FF]/50 hover:bg-[#0F1F38] transition-all'
  return (
    <button onClick={() => href && navigate(href)} className={cls}>
      {children}
    </button>
  )
}

/* ──────────────── NAVBAR ──────────────── */
function PublicNavbar({ currentPage, onNavigate }: { currentPage: PageId; onNavigate: (p: PageId) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const setShowPublicSite = useAppStore((s) => s.setShowPublicSite)
  const user = useAppStore((s) => s.user)

  const link = (id: PageId, label: string) => (
    <button
      key={id}
      onClick={() => { onNavigate(id); setMobileOpen(false) }}
      className={`text-sm transition-colors ${currentPage === id ? 'text-[#00D4FF]' : 'text-gray-300 hover:text-white'}`}
    >
      {label}
    </button>
  )

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A1628]/95 backdrop-blur-md border-b border-[#1E3A5F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#00D4FF]" />
            </div>
            <span className="text-white font-bold text-lg">ALO Labs</span>
          </button>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-6">
            {mainNav.map((n) => link(n.id, n.label))}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1"
              >
                More <ChevronRight className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-90' : ''}`} />
              </button>
              {moreOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#0F1F38] border border-[#1E3A5F] rounded-xl py-2 shadow-xl">
                  {moreNav.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { onNavigate(n.id); setMoreOpen(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#1E3A5F]/50 transition-colors"
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="hidden lg:flex items-center gap-3">
            {user && (
              <button
                onClick={() => setShowPublicSite(false)}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Admin
              </button>
            )}
            <CTAButton href="request-access">Get Access</CTAButton>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden text-white p-2">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[#0A1628] border-t border-[#1E3A5F] max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-4 space-y-1">
            {mainNav.map((n) => (
              <button
                key={n.id}
                onClick={() => { onNavigate(n.id); setMobileOpen(false) }}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm ${currentPage === n.id ? 'text-[#00D4FF] bg-[#00D4FF]/10' : 'text-gray-300 hover:text-white hover:bg-[#0F1F38]'}`}
              >
                {n.label}
              </button>
            ))}
            <div className="border-t border-[#1E3A5F] my-3" />
            <p className="px-3 text-xs text-gray-500 uppercase tracking-wider mb-2">More</p>
            {moreNav.map((n) => (
              <button
                key={n.id}
                onClick={() => { onNavigate(n.id); setMobileOpen(false) }}
                className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-[#0F1F38]"
              >
                {n.label}
              </button>
            ))}
            {user && (
              <button
                onClick={() => { setShowPublicSite(false); setMobileOpen(false) }}
                className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-[#0F1F38] mt-2"
              >
                ← Back to Admin
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

/* ──────────────── FOOTER ──────────────── */
function PublicFooter({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  return (
    <footer className="bg-[#060E1A] border-t border-[#1E3A5F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#00D4FF]" />
              </div>
              <span className="text-white font-bold text-lg">ALO Labs</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              Building the future of enterprise AI with private, secure, and intelligent agent infrastructure.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span>All systems operational</span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {['platform', 'agents', 'departments', 'services', 'api', 'workflows'].map((id) => (
                <li key={id}>
                  <button onClick={() => onNavigate(id as PageId)} className="text-gray-500 text-sm hover:text-[#00D4FF] transition-colors">
                    {mainNav.find(n => n.id === id)?.label || moreNav.find(n => n.id === id)?.label || id}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
            <ul className="space-y-2.5">
              {['about', 'developers', 'pricing', 'documentation', 'contact', 'request-access'].map((id) => (
                <li key={id}>
                  <button onClick={() => onNavigate(id as PageId)} className="text-gray-500 text-sm hover:text-[#00D4FF] transition-colors">
                    {mainNav.find(n => n.id === id)?.label || moreNav.find(n => n.id === id)?.label || id}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {legalNav.map((n) => (
                <li key={n.id}>
                  <button onClick={() => onNavigate(n.id)} className="text-gray-500 text-sm hover:text-[#00D4FF] transition-colors">
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#1E3A5F] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-600 text-sm">&copy; {new Date().getFullYear()} ALO Labs, Inc. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span>San Francisco, CA</span>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <span>Version 3.2.0</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ──────────────── PAGE: HOME ──────────────── */
function HomePage() {
  const navigate = usePublicNav()
  return (
    <div>
      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,212,255,0.08)_0%,_transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] text-xs font-medium mb-6">
              <Rocket className="w-3.5 h-3.5" /> Now in General Availability
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              The Enterprise AI Platform That{' '}
              <span className="text-[#00D4FF]">Runs Itself</span>
            </h1>
            <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-8 max-w-2xl">
              Deploy thousands of intelligent AI agents across your entire organization with private infrastructure,
              zero data leakage, and enterprise-grade security. Built for companies that demand absolute control.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('request-access')}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#00D4FF] text-[#0A1628] font-bold rounded-lg hover:bg-[#00B8E6] transition-colors text-sm"
              >
                Request Access <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('platform')}
                className="inline-flex items-center gap-2 px-8 py-3.5 border border-[#1E3A5F] text-white rounded-lg hover:border-[#00D4FF]/50 hover:bg-[#0F1F38] transition-all text-sm"
              >
                Explore Platform
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 md:mt-24">
            {[
              { value: '2,000+', label: 'AI Agents' },
              { value: '100+', label: 'Departments' },
              { value: '99.99%', label: 'Uptime SLA' },
              { value: '<50ms', label: 'Avg Latency' },
            ].map((s) => (
              <div key={s.label} className="p-5 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] text-center">
                <div className="text-2xl md:text-3xl font-bold text-[#00D4FF] mb-1">{s.value}</div>
                <div className="text-gray-500 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 md:py-28 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Everything You Need for Enterprise AI" subtitle="A complete platform that handles the complexity of large-scale AI deployment so you can focus on outcomes." />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Bot} title="Autonomous AI Agents" description="Pre-built, production-ready agents that handle complex business processes end-to-end with human-in-the-loop oversight." />
            <FeatureCard icon={Shield} title="Zero-Knowledge Privacy" description="Your data never leaves your infrastructure. All processing happens within your private environment with full encryption at rest and in transit." />
            <FeatureCard icon={Workflow} title="Intelligent Workflows" description="Orchestrate hundreds of agents into coordinated workflows that span departments, systems, and data sources seamlessly." />
            <FeatureCard icon={Cpu} title="Private Model Hosting" description="Run your own fine-tuned models on dedicated infrastructure. No shared resources, no data co-mingling, no compromise." />
            <FeatureCard icon={Network} title="Multi-Tenant Architecture" description="Isolate every department, team, and project with robust tenant boundaries while maintaining unified oversight and governance." />
            <FeatureCard icon={Zap} title="Real-Time Performance" description="Sub-50ms response times backed by distributed inference, intelligent caching, and automatic load balancing across regions." />
            <FeatureCard icon={Code2} title="Powerful APIs" description="RESTful and streaming APIs with comprehensive SDKs for every major platform. Integrate agents into any workflow in minutes." />
            <FeatureCard icon={Eye} title="Full Observability" description="Track every agent decision, workflow execution, and API call with built-in auditing, logging, and real-time monitoring dashboards." />
            <FeatureCard icon={Puzzle} title="Seamless Integration" description="Connect to 200+ enterprise systems including Salesforce, SAP, Slack, Jira, and more through native connectors and webhooks." />
          </div>
        </div>
      </section>

      {/* Social proof / trust */}
      <section className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Trusted by Security-First Organizations" subtitle="From Fortune 500 enterprises to growth-stage startups, organizations that require absolute data privacy choose ALO Labs." />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <div className="flex items-center gap-1 mb-3">{[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-[#00D4FF] text-[#00D4FF]" />)}</div>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                &ldquo;ALO Labs transformed how we handle customer support. Our AI agents resolve 85% of inquiries without human intervention, and the ones that escalate are perfectly contextualized.&rdquo;
              </p>
              <div className="text-white text-sm font-medium">VP of Customer Success</div>
              <div className="text-gray-500 text-xs">Enterprise SaaS Company</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <div className="flex items-center gap-1 mb-3">{[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-[#00D4FF] text-[#00D4FF]" />)}</div>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                &ldquo;The private infrastructure was the deciding factor for us. No other platform could guarantee that our proprietary training data would never be exposed to third-party models.&rdquo;
              </p>
              <div className="text-white text-sm font-medium">CTO</div>
              <div className="text-gray-500 text-xs">Financial Services Firm</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <div className="flex items-center gap-1 mb-3">{[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-[#00D4FF] text-[#00D4FF]" />)}</div>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                &ldquo;We deployed across 40 departments in under a week. The multi-tenant isolation and departmental governance features are years ahead of anything else on the market.&rdquo;
              </p>
              <div className="text-white text-sm font-medium">Head of Digital Transformation</div>
              <div className="text-gray-500 text-xs">Global Manufacturing Company</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to Deploy Enterprise AI at Scale?</h2>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
            Join the organizations that trust ALO Labs to power their most critical AI workloads.
          </p>
          <button
            onClick={() => navigate('request-access')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#00D4FF] text-[#0A1628] font-bold rounded-lg hover:bg-[#00B8E6] transition-colors"
          >
            Start Your Journey <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: ABOUT ──────────────── */
function AboutPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">About ALO Labs</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              ALO Labs was founded in 2022 with a singular vision: make enterprise-grade AI accessible, private,
              and manageable at unprecedented scale. We believe that every organization deserves AI infrastructure
              that respects data sovereignty while delivering transformative results.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">Our Mission</h2>
              <p className="text-gray-400 leading-relaxed mb-4">
                We are building the operating system for enterprise AI. Just as traditional operating systems manage
                hardware, processes, and resources, ALO Labs AgentOS manages AI agents, workflows, data flows, and
                organizational boundaries at scale.
              </p>
              <p className="text-gray-400 leading-relaxed mb-4">
                Our platform currently powers thousands of AI agents across over 100 specialized departments, handling
                everything from customer engagement and sales intelligence to compliance monitoring and financial analysis.
              </p>
              <p className="text-gray-400 leading-relaxed">
                We are headquartered in San Francisco with a globally distributed team of AI researchers, security engineers,
                and platform architects who are passionate about building responsible, powerful AI systems.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Users, value: '50+', label: 'Team Members' },
                { icon: Building2, value: '200+', label: 'Enterprise Clients' },
                { icon: Bot, value: '2,000+', label: 'AI Agents Deployed' },
                { icon: Globe, value: '30+', label: 'Countries Served' },
              ].map((s) => (
                <div key={s.label} className="p-5 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] text-center">
                  <s.icon className="w-6 h-6 text-[#00D4FF] mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
                  <div className="text-gray-500 text-xs">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Our Values" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <ShieldCheck className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Security First</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every architectural decision begins with security. We implement zero-trust principles, end-to-end encryption,
                and comprehensive audit logging across every layer of the platform.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <Brain className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Intelligence by Design</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Our agents are not simple chatbots. They are contextually aware, memory-equipped systems that learn from
                interactions while respecting strict privacy boundaries and governance policies.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <Scale className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Responsible AI</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                We are committed to ethical AI development. Our governance framework ensures transparency, fairness,
                and accountability in every agent decision and model output.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: PLATFORM ──────────────── */
function PlatformPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">The ALO Labs Platform</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              AgentOS is a complete operating system for enterprise AI. It manages the full lifecycle of AI agents
              from creation and deployment to monitoring, optimization, and governance — all within your private infrastructure.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Platform Architecture" subtitle="A modular, layered architecture designed for enterprise scale and security." />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Layers, title: 'Agent Layer', desc: 'Manages the lifecycle, configuration, and execution of thousands of AI agents with automatic scaling and failover.' },
              { icon: Workflow, title: 'Orchestration Layer', desc: 'Coordinates multi-agent workflows, handles dependency management, and ensures reliable execution across departments.' },
              { icon: Database, title: 'Data Layer', desc: 'Private vector stores, encrypted databases, and secure data pipelines with RAG-powered knowledge retrieval.' },
              { icon: Shield, title: 'Security Layer', desc: 'Zero-trust architecture with role-based access control, encryption at rest and in transit, and comprehensive audit trails.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <item.icon className="w-8 h-8 text-[#00D4FF] mb-4" />
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Key Capabilities" />
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Bot, title: 'Agent Registry', desc: 'A centralized catalog of all available AI agents with capability descriptions, usage statistics, and deployment status. Browse, discover, and deploy the right agent for any task.' },
              { icon: GitBranch, title: 'Workflow Engine', desc: 'Visual and code-based workflow builder that lets you chain agents together, add conditional logic, implement human approvals, and handle errors gracefully.' },
              { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Real-time and historical analytics covering agent performance, workflow efficiency, cost tracking, token usage, and organizational productivity metrics.' },
              { icon: Eye, title: 'Observability Suite', desc: 'Full-stack observability with distributed tracing, structured logging, anomaly detection, and customizable alerting for every component in the system.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: 2000 AGENTS ──────────────── */
function AgentsPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] text-xs font-medium mb-6">
              <Bot className="w-3.5 h-3.5" /> Scale Without Limits
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              2,000+ AI Agents. <span className="text-[#00D4FF]">One Platform.</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              The ALO Labs platform hosts over two thousand specialized AI agents, each designed for specific business
              functions and industry use cases. From customer support and sales outreach to compliance review and
              financial modeling — there is an agent for every organizational need.
            </p>
          </div>

          {/* Big number showcase */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16">
            {[
              { value: '2,000+', label: 'Total Agents', icon: Bot },
              { value: '100+', label: 'Specializations', icon: Layers },
              { value: '50M+', label: 'Tasks / Month', icon: Zap },
              { value: '99.7%', label: 'Success Rate', icon: CheckCircle2 },
            ].map((s) => (
              <div key={s.label} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] text-center">
                <s.icon className="w-6 h-6 text-[#00D4FF] mx-auto mb-3" />
                <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
                <div className="text-gray-500 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Agent Capabilities" subtitle="Each agent is a specialized AI worker with deep domain expertise." />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Natural Language Understanding', desc: 'Agents comprehend context, nuance, and intent across 40+ languages with enterprise-grade accuracy.' },
              { title: 'Autonomous Decision Making', desc: 'Make informed decisions based on policies, data, and learned patterns with configurable human-in-the-loop checkpoints.' },
              { title: 'Multi-Modal Processing', desc: 'Process and generate text, structured data, and integrate with document analysis pipelines.' },
              { title: 'Memory & Context', desc: 'Maintain conversation history, organizational context, and learn from past interactions within privacy boundaries.' },
              { title: 'Tool Integration', desc: 'Connect to external APIs, databases, and enterprise systems through a secure, governed tool framework.' },
              { title: 'Compliance Awareness', desc: 'Built-in compliance checks ensure all agent actions adhere to organizational policies and regulatory requirements.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: 100 DEPARTMENTS ──────────────── */
function DepartmentsPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              100+ Departmental <span className="text-[#00D4FF]">Organizations</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              The ALO Labs platform structures AI operations through a departmental model that mirrors real
              organizational hierarchies. Each department maintains its own isolated environment, governance policies,
              and agent configurations while contributing to the overall organizational intelligence.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Department Categories" subtitle="Agents are organized into specialized departments for optimal governance and performance." />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Customer Operations', desc: 'AI agents for support, onboarding, success management, and customer feedback analysis.', count: '20+ agents' },
              { title: 'Sales & Revenue', desc: 'Lead qualification, pipeline management, proposal generation, and revenue forecasting agents.', count: '15+ agents' },
              { title: 'Marketing & Growth', desc: 'Content creation, campaign optimization, audience segmentation, and brand monitoring agents.', count: '12+ agents' },
              { title: 'Engineering & DevOps', desc: 'Code review, deployment automation, incident response, and infrastructure monitoring agents.', count: '15+ agents' },
              { title: 'Finance & Accounting', desc: 'Invoice processing, financial analysis, budget optimization, and compliance reporting agents.', count: '10+ agents' },
              { title: 'Human Resources', desc: 'Recruiting, onboarding, employee engagement, and policy management agents.', count: '8+ agents' },
              { title: 'Legal & Compliance', desc: 'Contract review, regulatory monitoring, policy enforcement, and risk assessment agents.', count: '10+ agents' },
              { title: 'Product & Design', desc: 'User research, feature prioritization, design review, and usability testing agents.', count: '8+ agents' },
              { title: 'Data & Analytics', desc: 'Data pipeline management, reporting, anomaly detection, and business intelligence agents.', count: '12+ agents' },
            ].map((d) => (
              <div key={d.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">{d.title}</h3>
                  <span className="text-[#00D4FF] text-xs font-medium bg-[#00D4FF]/10 px-2 py-1 rounded-md">{d.count}</span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: INFRASTRUCTURE ──────────────── */
function InfrastructurePage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Private AI Infrastructure</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Unlike cloud AI services that process your data on shared infrastructure, ALO Labs provides a fully
              private AI stack. Your models, your data, your rules — deployed within environments you control.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Server, title: 'Dedicated Compute', desc: 'Every tenant gets dedicated GPU and CPU resources. No noisy neighbors, no resource contention, no performance variability.' },
              { icon: HardDrive, title: 'Encrypted Storage', desc: 'All data at rest is encrypted with AES-256. Database-level, file-level, and backup encryption with customer-managed keys.' },
              { icon: Network, title: 'Private Networking', desc: 'VPC-isolated networking with private API endpoints, mTLS between services, and no public-facing data interfaces.' },
              { icon: Cloud, title: 'Hybrid Deployment', desc: 'Deploy on-premises, in your private cloud, or in our managed environment. The choice is yours, and you can migrate at any time.' },
              { icon: RefreshCw, title: 'Automatic Failover', desc: 'Multi-region deployment with automatic failover ensures 99.99% uptime. Your AI operations continue even during infrastructure events.' },
              { icon: Monitor, title: 'Infrastructure Monitoring', desc: 'Real-time visibility into compute utilization, memory consumption, GPU performance, and network throughput with configurable alerts.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: SERVICES ──────────────── */
function ServicesPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">AI Services</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              ALO Labs offers a comprehensive suite of AI services designed for enterprise adoption.
              From pre-built solutions to custom development, we meet organizations wherever they are on their AI journey.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Agent Deployment', desc: 'Rapid deployment of pre-configured AI agents tailored to your industry and use cases. Production-ready in days, not months.', icon: Rocket },
              { title: 'Custom Agent Development', desc: 'Our team designs and builds bespoke agents for unique requirements, trained on your data and integrated with your systems.', icon: Code2 },
              { title: 'Workflow Design', desc: 'Collaborative workflow architecture that maps your business processes to automated agent orchestrations with built-in controls.', icon: GitBranch },
              { title: 'Integration Services', desc: 'Expert integration with your existing tech stack — CRM, ERP, communication tools, databases, and custom internal systems.', icon: Puzzle },
              { title: 'Training & Onboarding', desc: 'Comprehensive training programs for your teams, from AI fundamentals to advanced agent management and workflow optimization.', icon: BookOpen },
              { title: 'Managed Operations', desc: 'Let our team handle day-to-day AI operations — monitoring, optimization, scaling, and incident response — so you can focus on outcomes.', icon: Activity },
            ].map((s) => (
              <div key={s.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <s.icon className="w-8 h-8 text-[#00D4FF] mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: API ──────────────── */
function ApiPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Agent API</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              A powerful, well-documented API that gives you programmatic access to every capability in the ALO Labs
              platform. Manage agents, trigger workflows, query analytics, and integrate AI into any application.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">API Overview</h2>
              <div className="space-y-4">
                {[
                  { title: 'RESTful Endpoints', desc: 'Clean, consistent REST API with JSON request/response format. Easy to integrate with any language or framework.' },
                  { title: 'Streaming Support', desc: 'Server-Sent Events (SSE) for real-time agent responses. Get partial results as agents process complex requests.' },
                  { title: 'Webhook Events', desc: 'Subscribe to platform events via webhooks. Get notified when agents complete tasks, workflows reach milestones, or issues arise.' },
                  { title: 'SDKs & Libraries', desc: 'Official SDKs for TypeScript, Python, Go, and Java. Community-maintained libraries for Rust, Ruby, and more.' },
                ].map((item) => (
                  <div key={item.title} className="p-4 rounded-xl bg-[#0F1F38] border border-[#1E3A5F]">
                    <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                    <p className="text-gray-400 text-sm">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">Quick Example</h2>
              <div className="p-4 rounded-xl bg-[#0D1117] border border-[#1E3A5F] font-mono text-sm">
                <pre className="text-gray-300 overflow-x-auto">
{`// Execute an agent via the API
const response = await fetch(
  '/api/v1/agents/execute',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <api-key>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agent_id: 'support-triage',
      input: {
        message: customerMessage,
        context: { ticket_id: 'TK-1234' }
      },
      options: {
        stream: true,
        priority: 'high'
      }
    })
  }
);`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: WORKFLOWS ──────────────── */
function WorkflowsPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Workflow Automation</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Orchestrate complex multi-agent workflows that span departments, systems, and data sources.
              Our visual workflow builder and powerful DSL let you automate even the most intricate business processes.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Workflow Capabilities" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Visual Builder', desc: 'Drag-and-drop workflow designer with conditional branching, parallel execution, and error handling — no code required.' },
              { title: 'Code-Based Flows', desc: 'For advanced users, define workflows in TypeScript with full IDE support, version control, and automated testing.' },
              { title: 'Human-in-the-Loop', desc: 'Insert approval gates, review checkpoints, and escalation paths that pause workflows for human decision-making.' },
              { title: 'Event-Driven Triggers', desc: 'Start workflows automatically based on webhooks, scheduled times, data changes, or agent completion events.' },
              { title: 'Retry & Recovery', desc: 'Automatic retry with exponential backoff, dead-letter queues, and manual replay for failed workflow steps.' },
              { title: 'Version Control', desc: 'Track workflow changes, roll back to previous versions, and promote workflows through dev, staging, and production environments.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: LOCAL AI ──────────────── */
function LocalAIPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Local AI</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Run AI agents entirely on your own hardware — no cloud dependency, no data transmission, no third-party
              access. ALO Labs supports full on-premises deployment for organizations with the strictest data residency requirements.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">Why Local AI?</h2>
              <div className="space-y-4">
                {[
                  { title: 'Data Sovereignty', desc: 'Your data never leaves your premises. Meet GDPR, HIPAA, SOC 2, and industry-specific data residency requirements without compromise.' },
                  { title: 'Zero Latency', desc: 'Process requests on-premises for sub-10ms latency. No network round-trips to cloud providers, no bandwidth constraints.' },
                  { title: 'Air-Gap Capability', desc: 'Deploy in completely disconnected environments. Our local AI stack works without any internet connectivity for maximum security.' },
                  { title: 'Cost Predictability', desc: 'Pay for hardware once, not per-token forever. Local deployment provides predictable costs that scale with your compute, not your usage.' },
                ].map((item) => (
                  <div key={item.title} className="p-4 rounded-xl bg-[#0F1F38] border border-[#1E3A5F]">
                    <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                    <p className="text-gray-400 text-sm">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <h3 className="text-white font-semibold mb-4">Supported Hardware</h3>
              <ul className="space-y-3">
                {['NVIDIA A100 / H100 / L40S GPUs', 'AMD MI300X Instinct Accelerators', 'Apple Silicon (M2 Ultra, M3 Max)', 'Intel Gaudi2 / Gaudi3', 'ARM-based inference servers', 'Custom FPGA configurations'].map((hw) => (
                  <li key={hw} className="flex items-center gap-3 text-gray-300 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#00D4FF] flex-shrink-0" /> {hw}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: PRIVATE MODELS ──────────────── */
function PrivateModelsPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Private Models</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Fine-tune and deploy your own AI models on isolated infrastructure. Your models, trained on your data,
              serving only your organization — with full ownership and control over every parameter.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Model Privacy Guarantees" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <Lock className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Isolated Training</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Fine-tuning happens on dedicated infrastructure. Your training data is never mixed with other organizations&apos;
                data. Model weights are encrypted at all times.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <Key className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Ownership Rights</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                You retain full ownership of all fine-tuned models. Export model weights at any time. No vendor lock-in,
                no usage restrictions on your own models.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
              <ShieldCheck className="w-8 h-8 text-[#00D4FF] mb-4" />
              <h3 className="text-white font-semibold text-lg mb-2">Audit Trail</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Complete audit logging for every model operation — training, deployment, inference, and access. Meet
                regulatory requirements with verifiable compliance records.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: SECURITY ──────────────── */
function SecurityPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium mb-6">
              <ShieldCheck className="w-3.5 h-3.5" /> SOC 2 Type II Certified
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Security Architecture</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Security is not a feature — it is the foundation. Every component of the ALO Labs platform is built with
              defense-in-depth principles, zero-trust architecture, and comprehensive security controls.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { title: 'Zero-Trust Architecture', desc: 'Every request is authenticated and authorized regardless of network location. No implicit trust based on network boundaries.', icon: Shield },
              { title: 'End-to-End Encryption', desc: 'AES-256 encryption at rest, TLS 1.3 for data in transit. Optional client-side encryption for maximum data protection.', icon: Lock },
              { title: 'Role-Based Access Control', desc: 'Granular RBAC with custom roles, permission inheritance, and attribute-based access control for complex organizational structures.', icon: Users },
              { title: 'Audit Logging', desc: 'Immutable, tamper-proof audit logs for every user action, API call, and agent decision. Retained for compliance and forensic analysis.', icon: FileText },
              { title: 'Vulnerability Management', desc: 'Continuous security scanning, dependency auditing, and automated patching. Bug bounty program for responsible disclosure.', icon: ShieldCheck },
              { title: 'Incident Response', desc: '24/7 security operations center with automated threat detection, defined escalation procedures, and rapid response capabilities.', icon: AlertTriangle },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
            <h3 className="text-white font-semibold text-lg mb-4">Compliance Certifications</h3>
            <div className="flex flex-wrap gap-3">
              {['SOC 2 Type II', 'HIPAA Ready', 'GDPR Compliant', 'ISO 27001', 'CCPA Compliant', 'PCI DSS', 'FedRAMP Ready'].map((c) => (
                <span key={c} className="px-4 py-2 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] text-sm font-medium">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: INTEGRATION ──────────────── */
function IntegrationPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Company Integration</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Connect ALO Labs to your existing technology stack with pre-built connectors, webhook integrations,
              and a flexible API. Our platform integrates seamlessly with the tools your teams already use.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Integration Ecosystem" subtitle="200+ native connectors and unlimited extensibility." />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { category: 'CRM', tools: ['Salesforce', 'HubSpot', 'Dynamics 365', 'Pipedrive'] },
              { category: 'Communication', tools: ['Slack', 'Microsoft Teams', 'Email (SMTP/IMAP)', 'Twilio'] },
              { category: 'DevOps', tools: ['GitHub', 'GitLab', 'Jenkins', 'Jira'] },
              { category: 'Data', tools: ['Snowflake', 'PostgreSQL', 'S3', 'BigQuery'] },
              { category: 'ERP', tools: ['SAP', 'Oracle', 'NetSuite', 'Workday'] },
              { category: 'Marketing', tools: ['Marketo', 'Mailchimp', 'Google Ads', 'HubSpot Marketing'] },
              { category: 'Support', tools: ['Zendesk', 'Intercom', 'Freshdesk', 'Help Scout'] },
              { category: 'Productivity', tools: ['Notion', 'Confluence', 'Google Workspace', 'Microsoft 365'] },
            ].map((cat) => (
              <div key={cat.category} className="p-5 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <h3 className="text-white font-semibold mb-3">{cat.category}</h3>
                <ul className="space-y-1.5">
                  {cat.tools.map((t) => (
                    <li key={t} className="text-gray-400 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00D4FF]" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: DEVELOPERS ──────────────── */
function DevelopersPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Developer Platform</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Built by developers, for developers. The ALO Labs developer platform provides everything you need
              to build, test, deploy, and monitor AI-powered applications with confidence.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Code2, title: 'Comprehensive APIs', desc: 'RESTful and streaming APIs covering every platform capability — agent management, workflow execution, analytics queries, and system administration.' },
              { icon: Terminal, title: 'CLI Tools', desc: 'Command-line interface for agent deployment, workflow management, and local development. Works with your existing dev workflow and CI/CD pipelines.' },
              { icon: BookOpen, title: 'Documentation', desc: 'Detailed API references, quickstart guides, architecture overviews, and best practices. Everything you need to build production AI applications.' },
              { icon: GitBranch, title: 'SDK Support', desc: 'Official SDKs for TypeScript, Python, Go, and Java with type safety, auto-completion, and comprehensive error handling built in.' },
              { icon: Activity, title: 'Sandbox Environment', desc: 'Free sandbox with pre-configured agents for testing and prototyping. Experiment without impacting production data or incurring costs.' },
              { icon: Users, title: 'Developer Community', desc: 'Join our developer community for support, shared patterns, and collaboration. Regular office hours with the engineering team.' },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: PRICING ──────────────── */
function PricingPage() {
  const navigate = usePublicNav()
  const tiers = [
    {
      name: 'Starter',
      price: '$2,500',
      period: '/month',
      desc: 'For teams getting started with enterprise AI.',
      features: ['Up to 50 AI agents', '5 department workspaces', '10 GB encrypted storage', 'Basic analytics dashboard', 'Email support', '99.9% uptime SLA'],
      cta: 'Get Started',
    },
    {
      name: 'Professional',
      price: '$10,000',
      period: '/month',
      desc: 'For growing organizations scaling AI across teams.',
      features: ['Up to 500 AI agents', '25 department workspaces', '100 GB encrypted storage', 'Advanced analytics & reports', 'Priority support (8/5)', 'Workflow automation', 'API access', '99.95% uptime SLA'],
      cta: 'Start Free Trial',
      featured: true,
    },
    {
      name: 'Enterprise',
      price: '$35,000',
      period: '/month',
      desc: 'For large organizations with advanced requirements.',
      features: ['Up to 2,000 AI agents', 'Unlimited departments', '1 TB encrypted storage', 'Full observability suite', '24/7 dedicated support', 'Custom workflows', 'SSO & advanced security', 'Private model hosting', '99.99% uptime SLA'],
      cta: 'Contact Sales',
    },
    {
      name: 'Custom',
      price: 'Custom',
      period: '',
      desc: 'For organizations with unique requirements.',
      features: ['Unlimited AI agents', 'Unlimited departments', 'Custom storage allocation', 'White-label options', 'Dedicated success manager', 'On-premises deployment', 'Custom integrations', 'Custom SLA', 'Training & onboarding'],
      cta: 'Talk to Us',
    },
  ]

  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Choose the plan that fits your organization. All plans include private infrastructure, encryption, and enterprise-grade security.
          </p>
        </div>
      </section>
      <section className="pb-20 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`p-6 rounded-2xl border flex flex-col ${
                  tier.featured
                    ? 'bg-[#0F1F38] border-[#00D4FF]/50 relative'
                    : 'bg-[#0F1F38] border-[#1E3A5F]'
                }`}
              >
                {tier.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#00D4FF] text-[#0A1628] text-xs font-bold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-white font-semibold text-lg mb-1">{tier.name}</h3>
                <p className="text-gray-500 text-sm mb-4">{tier.desc}</p>
                <div className="mb-6">
                  <span className="text-3xl font-bold text-white">{tier.price}</span>
                  <span className="text-gray-500 text-sm">{tier.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-gray-300 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-[#00D4FF] mt-0.5 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('request-access')}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    tier.featured
                      ? 'bg-[#00D4FF] text-[#0A1628] hover:bg-[#00B8E6]'
                      : 'border border-[#1E3A5F] text-white hover:border-[#00D4FF]/50'
                  }`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: REQUEST ACCESS ──────────────── */
function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false)
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 text-center">Request Access</h1>
            <p className="text-gray-400 text-lg text-center mb-10">
              Tell us about your organization and we will reach out within 24 hours with next steps.
            </p>
            {submitted ? (
              <div className="p-8 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] text-center">
                <CheckCircle2 className="w-12 h-12 text-[#00D4FF] mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Request Submitted</h2>
                <p className="text-gray-400 text-sm">Our team will review your application and get back to you within one business day.</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); setSubmitted(true) }}
                className="space-y-5 p-8 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]"
              >
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Full Name</label>
                    <input required type="text" className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#1E3A5F] text-white text-sm focus:outline-none focus:border-[#00D4FF]" placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Work Email</label>
                    <input required type="email" className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#1E3A5F] text-white text-sm focus:outline-none focus:border-[#00D4FF]" placeholder="jane@company.com" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Company Name</label>
                    <input required type="text" className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#1E3A5F] text-white text-sm focus:outline-none focus:border-[#00D4FF]" placeholder="Acme Inc." />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5">Company Size</label>
                    <select required className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#1E3A5F] text-white text-sm focus:outline-none focus:border-[#00D4FF]">
                      <option value="">Select size</option>
                      <option value="1-50">1–50 employees</option>
                      <option value="51-200">51–200 employees</option>
                      <option value="201-1000">201–1,000 employees</option>
                      <option value="1001-5000">1,001–5,000 employees</option>
                      <option value="5000+">5,000+ employees</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Use Case</label>
                  <textarea required rows={4} className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#1E3A5F] text-white text-sm focus:outline-none focus:border-[#00D4FF] resize-none" placeholder="Describe how you plan to use AI agents in your organization..." />
                </div>
                <button type="submit" className="w-full py-3 bg-[#00D4FF] text-[#0A1628] font-bold rounded-lg hover:bg-[#00B8E6] transition-colors">
                  Submit Request
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: CONTACT ──────────────── */
function ContactPage() {
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Contact Us</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Have questions about the platform, need technical support, or want to discuss a custom engagement?
              We are here to help.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Mail, title: 'Email', value: 'hello@alolabs.ai', desc: 'General inquiries and partnerships' },
              { icon: Phone, title: 'Phone', value: '+1 (415) 555-0147', desc: 'Mon–Fri, 9 AM – 6 PM PT' },
              { icon: MapPin, title: 'Office', value: 'San Francisco, CA', desc: '548 Market St, Suite 36879' },
            ].map((c) => (
              <div key={c.title} className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <c.icon className="w-8 h-8 text-[#00D4FF] mb-4" />
                <h3 className="text-white font-semibold mb-1">{c.title}</h3>
                <p className="text-[#00D4FF] text-sm font-medium mb-1">{c.value}</p>
                <p className="text-gray-500 text-sm">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Departments</h2>
              <div className="space-y-3">
                {[
                  { dept: 'Sales', email: 'sales@alolabs.ai' },
                  { dept: 'Technical Support', email: 'support@alolabs.ai' },
                  { dept: 'Partnerships', email: 'partners@alolabs.ai' },
                  { dept: 'Security', email: 'security@alolabs.ai' },
                  { dept: 'Press & Media', email: 'press@alolabs.ai' },
                ].map((d) => (
                  <div key={d.dept} className="flex items-center justify-between p-3 rounded-lg bg-[#0F1F38] border border-[#1E3A5F]">
                    <span className="text-white text-sm">{d.dept}</span>
                    <span className="text-gray-400 text-sm">{d.email}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Response Times</h2>
              <div className="p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
                <div className="space-y-4">
                  {[
                    { priority: 'Critical Issues', time: '< 1 hour', color: 'text-red-400' },
                    { priority: 'High Priority', time: '< 4 hours', color: 'text-orange-400' },
                    { priority: 'General Inquiries', time: '< 24 hours', color: 'text-[#00D4FF]' },
                    { priority: 'Partnership Requests', time: '< 48 hours', color: 'text-gray-400' },
                  ].map((r) => (
                    <div key={r.priority} className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm">{r.priority}</span>
                      <span className={`${r.color} text-sm font-medium`}>{r.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: DOCUMENTATION ──────────────── */
function DocumentationPage() {
  const navigate = usePublicNav()
  const docs = [
    { title: 'Getting Started', desc: 'Set up your account, configure your first agent, and run your first workflow in under 15 minutes.', icon: Rocket },
    { title: 'Agent Management', desc: 'Learn how to browse, configure, deploy, and monitor AI agents across your organization.', icon: Bot },
    { title: 'Workflow Guide', desc: 'Build, test, and deploy automated workflows that orchestrate multiple agents and systems.', icon: Workflow },
    { title: 'API Reference', desc: 'Complete API documentation with examples, authentication guides, and SDK references.', icon: Code2 },
    { title: 'Security Guide', desc: 'Configure access controls, manage API keys, and implement security best practices.', icon: Shield },
    { title: 'Integration Hub', desc: 'Step-by-step guides for connecting to popular enterprise tools and custom systems.', icon: Puzzle },
  ]
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Documentation</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Comprehensive guides, API references, and tutorials to help you get the most from the ALO Labs platform.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docs.map((d) => (
              <button
                key={d.title}
                onClick={() => navigate('developers')}
                className="text-left p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] hover:border-[#00D4FF]/50 transition-colors"
              >
                <d.icon className="w-8 h-8 text-[#00D4FF] mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">{d.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{d.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── PAGE: STATUS ──────────────── */
function StatusPage() {
  const services = [
    { name: 'Agent Execution Engine', status: 'operational' },
    { name: 'Workflow Orchestrator', status: 'operational' },
    { name: 'API Gateway', status: 'operational' },
    { name: 'Model Inference', status: 'operational' },
    { name: 'Vector Database', status: 'operational' },
    { name: 'Real-Time Streaming', status: 'operational' },
    { name: 'Webhook Delivery', status: 'operational' },
    { name: 'Admin Dashboard', status: 'operational' },
  ]
  return (
    <div>
      <section className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-6">
              <Activity className="w-4 h-4" /> All Systems Operational
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">System Status</h1>
            <p className="text-gray-400 text-lg">Real-time status of all ALO Labs platform services.</p>
          </div>
        </div>
      </section>
      <section className="py-16 bg-[#060E1A]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-[#0F1F38] border border-[#1E3A5F] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E3A5F] flex items-center justify-between">
              <span className="text-white font-semibold">Service</span>
              <span className="text-gray-400 text-sm">Status</span>
            </div>
            {services.map((s) => (
              <div key={s.name} className="px-6 py-4 border-b border-[#1E3A5F]/50 flex items-center justify-between last:border-b-0">
                <span className="text-gray-300 text-sm">{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-green-400 text-sm">Operational</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
            <h3 className="text-white font-semibold mb-4">Recent Incidents</h3>
            <div className="text-gray-500 text-sm text-center py-6">No incidents in the last 90 days.</div>
            <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
              <span>Uptime (30d): 99.998%</span>
              <span>Last updated: {new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ──────────────── LEGAL PAGES ──────────────── */
function LegalPageShell({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: React.ReactNode }) {
  return (
    <div>
      <section className="pt-32 pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{title}</h1>
          <p className="text-gray-500 text-sm">Last updated: {lastUpdated}</p>
        </div>
      </section>
      <section className="py-8 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 rounded-2xl bg-[#0F1F38] border border-[#1E3A5F]">
            <div className="prose-custom text-gray-300 text-sm leading-relaxed space-y-6">{children}</div>
          </div>
        </div>
      </section>
    </div>
  )
}

function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="January 15, 2025">
      <p>ALO Labs, Inc. (&ldquo;ALO Labs,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI agent platform and related services.</p>
      <h3 className="text-white font-semibold text-base">1. Information We Collect</h3>
      <p>We collect information that you provide directly, including your name, email address, company name, and payment information. We also collect usage data such as API request logs, agent interaction metrics, and platform navigation patterns. All data is stored within your private tenant environment and is not shared with other organizations.</p>
      <h3 className="text-white font-semibold text-base">2. How We Use Your Information</h3>
      <p>We use collected information to provide and improve our services, process transactions, communicate with you about your account, and comply with legal obligations. Agent interaction data is used solely within your tenant environment to provide AI services and is not used to train models for other organizations.</p>
      <h3 className="text-white font-semibold text-base">3. Data Sharing and Disclosure</h3>
      <p>We do not sell your personal data. We may share data with service providers who assist in operating our platform (hosting, payment processing) under strict data processing agreements. We may disclose data when required by law or to protect the rights and safety of ALO Labs and our users.</p>
      <h3 className="text-white font-semibold text-base">4. Data Retention</h3>
      <p>We retain your personal data for as long as your account is active or as needed to provide services. Upon account termination, personal data is deleted within 90 days unless retention is required by law. Agent interaction logs follow your configured retention policies within your tenant environment.</p>
      <h3 className="text-white font-semibold text-base">5. Your Rights</h3>
      <p>You have the right to access, correct, delete, and port your personal data. You may also opt out of marketing communications. To exercise these rights, contact us at privacy@alolabs.ai. We respond to all requests within 30 days.</p>
      <h3 className="text-white font-semibold text-base">6. Security Measures</h3>
      <p>We implement industry-standard security measures including AES-256 encryption at rest, TLS 1.3 in transit, access controls, audit logging, and regular security assessments. For full details, see our Security Policy.</p>
      <h3 className="text-white font-semibold text-base">7. Contact</h3>
      <p>For privacy-related inquiries, contact our Data Protection Officer at privacy@alolabs.ai or ALO Labs, Inc., 548 Market St, Suite 36879, San Francisco, CA 94104.</p>
    </LegalPageShell>
  )
}

function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="January 15, 2025">
      <p>These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the ALO Labs AI agent platform, APIs, documentation, and related services (collectively, the &ldquo;Services&rdquo;). By accessing or using our Services, you agree to be bound by these Terms.</p>
      <h3 className="text-white font-semibold text-base">1. Account Registration</h3>
      <p>You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must notify us immediately of any unauthorized access.</p>
      <h3 className="text-white font-semibold text-base">2. Service Description</h3>
      <p>ALO Labs provides an enterprise AI platform that enables organizations to deploy, manage, and monitor AI agents and automated workflows. The specific features, capabilities, and limitations depend on your subscription plan. We reserve the right to modify or discontinue any Service with reasonable notice.</p>
      <h3 className="text-white font-semibold text-base">3. Acceptable Use</h3>
      <p>You agree not to use the Services for any unlawful purpose, to generate harmful content, to attempt to gain unauthorized access to systems, or to interfere with the platform&apos;s operation. See our Acceptable Use Policy for complete details on prohibited activities.</p>
      <h3 className="text-white font-semibold text-base">4. Intellectual Property</h3>
      <p>The Services and their original content, features, and functionality are owned by ALO Labs and are protected by copyright, trademark, and other intellectual property laws. Your content remains your property. You grant us a limited license to process your content solely to provide the Services.</p>
      <h3 className="text-white font-semibold text-base">5. Payment Terms</h3>
      <p>Fees are billed according to your subscription plan. Payment is due within 30 days of invoice. Late payments may incur interest at 1.5% per month. We reserve the right to suspend services for accounts more than 60 days past due.</p>
      <h3 className="text-white font-semibold text-base">6. Limitation of Liability</h3>
      <p>ALO Labs shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Services. Our total liability shall not exceed the fees paid by you in the 12 months preceding the claim.</p>
      <h3 className="text-white font-semibold text-base">7. Termination</h3>
      <p>Either party may terminate with 30 days written notice. Upon termination, you must cease using the Services and we will provide a reasonable data export period. Sections 4, 6, and 7 survive termination.</p>
    </LegalPageShell>
  )
}

function SecurityPolicyPage() {
  return (
    <LegalPageShell title="Security Policy" lastUpdated="January 15, 2025">
      <p>ALO Labs maintains a comprehensive security program designed to protect the confidentiality, integrity, and availability of customer data and our platform. This Security Policy outlines our approach to security across people, processes, and technology.</p>
      <h3 className="text-white font-semibold text-base">1. Security Governance</h3>
      <p>Our security program is led by a dedicated Chief Information Security Officer (CISO) and governed by our security steering committee. We conduct annual security program reviews and maintain a risk register that is reviewed quarterly. All employees complete security awareness training upon hire and annually thereafter.</p>
      <h3 className="text-white font-semibold text-base">2. Infrastructure Security</h3>
      <p>Our platform runs on hardened infrastructure with automated security patching, network segmentation, and DDoS protection. All systems are deployed within VPCs with strict security group rules. Infrastructure-as-code is used for all deployments, enabling automated security scanning and reproducible environments.</p>
      <h3 className="text-white font-semibold text-base">3. Data Protection</h3>
      <p>Customer data is encrypted at rest using AES-256 and in transit using TLS 1.3. Encryption keys are managed through a dedicated key management service with automatic rotation. Database backups are encrypted and stored in geographically separate locations.</p>
      <h3 className="text-white font-semibold text-base">4. Access Control</h3>
      <p>We implement least-privilege access controls with role-based permissions. All access to production systems requires multi-factor authentication and is logged. Access reviews are conducted quarterly, and privileged access sessions are recorded.</p>
      <h3 className="text-white font-semibold text-base">5. Vulnerability Management</h3>
      <p>We conduct continuous automated vulnerability scanning, quarterly penetration testing by independent third parties, and annual security architecture reviews. Critical vulnerabilities are remediated within 24 hours, high within 72 hours.</p>
      <h3 className="text-white font-semibold text-base">6. Incident Response</h3>
      <p>We maintain a 24/7 Security Operations Center (SOC) with defined incident response procedures. Customers are notified of security incidents affecting their data within 72 hours. We conduct post-incident reviews and share relevant learnings.</p>
      <h3 className="text-white font-semibold text-base">7. Compliance</h3>
      <p>ALO Labs maintains SOC 2 Type II certification and is compliant with GDPR, HIPAA, CCPA, and PCI DSS requirements. We undergo annual third-party audits and make compliance reports available to enterprise customers under NDA.</p>
    </LegalPageShell>
  )
}

function AcceptableUsePage() {
  return (
    <LegalPageShell title="Acceptable Use Policy" lastUpdated="January 15, 2025">
      <p>This Acceptable Use Policy (&ldquo;AUP&rdquo;) describes the activities that are prohibited when using the ALO Labs platform. By using our Services, you agree to comply with this policy. Violations may result in suspension or termination of your account.</p>
      <h3 className="text-white font-semibold text-base">1. Prohibited Content</h3>
      <p>You may not use the Services to generate, store, or distribute content that is illegal, harmful, threatening, abusive, defamatory, obscene, or otherwise objectionable. This includes content that promotes violence, discrimination, self-harm, or illegal activities.</p>
      <h3 className="text-white font-semibold text-base">2. Prohibited Activities</h3>
      <p>You may not attempt to gain unauthorized access to any system or data, distribute malware, engage in phishing, circumvent security controls, overload the platform through excessive automated requests, or use the Services to compete directly with ALO Labs&apos; core offerings.</p>
      <h3 className="text-white font-semibold text-base">3. AI-Specific Restrictions</h3>
      <p>You may not use AI agents to impersonate individuals without consent, generate deepfakes or misleading synthetic media, automate decisions in regulated domains without appropriate human oversight, or use agent outputs to train competing AI systems.</p>
      <h3 className="text-white font-semibold text-base">4. Data Restrictions</h3>
      <p>You may not input data that you do not have the right to process. You are responsible for ensuring that data provided to agents complies with applicable laws and your own data governance policies.</p>
      <h3 className="text-white font-semibold text-base">5. Enforcement</h3>
      <p>We may monitor for compliance with this policy. Suspected violations are investigated by our trust and safety team. Consequences range from warnings to immediate account termination depending on severity. We cooperate with law enforcement when required.</p>
      <h3 className="text-white font-semibold text-base">6. Reporting</h3>
      <p>To report potential violations, contact trust@alolabs.ai. We investigate all reports and take appropriate action. We do not retaliate against good-faith reporters.</p>
    </LegalPageShell>
  )
}

function DataProcessingPage() {
  return (
    <LegalPageShell title="Data Processing Policy" lastUpdated="January 15, 2025">
      <p>This Data Processing Policy (&ldquo;DPP&rdquo;) describes how ALO Labs processes personal data on behalf of our customers as a data processor under applicable data protection laws, including GDPR and CCPA.</p>
      <h3 className="text-white font-semibold text-base">1. Roles and Responsibilities</h3>
      <p>ALO Labs acts as a data processor on behalf of our customers (data controllers). We process personal data only in accordance with our customers&apos; instructions as documented in our agreements and this policy. Customers retain full control over what data is processed and for what purposes.</p>
      <h3 className="text-white font-semibold text-base">2. Data Processing Activities</h3>
      <p>We process personal data to provide the AI agent platform services, including storing and retrieving data for agent interactions, executing workflows, providing analytics, and maintaining platform security. Specific processing activities are detailed in Data Processing Agreements (DPAs) available to enterprise customers.</p>
      <h3 className="text-white font-semibold text-base">3. Data Subject Rights</h3>
      <p>When we receive a data subject request from a customer, we assist in fulfilling the request within the required timeframes. We provide tools and APIs that enable customers to search for, access, correct, export, and delete personal data within their tenant environments.</p>
      <h3 className="text-white font-semibold text-base">4. Sub-Processors</h3>
      <p>We engage a limited number of sub-processors for infrastructure hosting, payment processing, and customer support. All sub-processors are bound by data processing agreements with equivalent protections. We notify customers of material changes to our sub-processor list with 30 days&apos; notice.</p>
      <h3 className="text-white font-semibold text-base">5. International Transfers</h3>
      <p>Data may be transferred to and processed in countries other than the customer&apos;s country of residence. We use Standard Contractual Clauses (SCCs) approved by the European Commission and implement supplementary measures where required to ensure adequate protection.</p>
      <h3 className="text-white font-semibold text-base">6. Data Breach Notification</h3>
      <p>In the event of a personal data breach, we notify affected customers without undue delay and no later than 72 hours after becoming aware. We provide information about the nature of the breach, the data involved, and our remediation actions.</p>
    </LegalPageShell>
  )
}

function AIGovernancePage() {
  return (
    <LegalPageShell title="AI Governance Policy" lastUpdated="January 15, 2025">
      <p>ALO Labs is committed to the responsible development and deployment of artificial intelligence. This AI Governance Policy establishes our principles, practices, and accountability structures for ensuring that our AI systems are fair, transparent, and beneficial.</p>
      <h3 className="text-white font-semibold text-base">1. Governance Principles</h3>
      <p>Our AI systems are designed with the following core principles: fairness and non-discrimination, transparency and explainability, privacy and data protection, safety and reliability, and human oversight. These principles guide every decision from model selection to agent deployment.</p>
      <h3 className="text-white font-semibold text-base">2. Model Governance</h3>
      <p>All models deployed on our platform undergo rigorous evaluation for bias, safety, and performance before production deployment. We maintain a model registry with version control, lineage tracking, and documented evaluation results. Model updates follow a staged rollout process with monitoring at each stage.</p>
      <h3 className="text-white font-semibold text-base">3. Agent Behavior Standards</h3>
      <p>AI agents operate within defined behavioral boundaries established by organizational policies. Agents are configured with content safety filters, output validation rules, and escalation triggers. All agent decisions are logged and auditable.</p>
      <h3 className="text-white font-semibold text-base">4. Human Oversight</h3>
      <p>Critical decisions that significantly impact individuals are subject to human-in-the-loop review. Customers can configure oversight thresholds based on their risk tolerance and regulatory requirements. We provide tools for reviewing, correcting, and overriding agent decisions.</p>
      <h3 className="text-white font-semibold text-base">5. Transparency</h3>
      <p>We provide customers with documentation about how our AI systems work, their limitations, and their potential biases. Agent outputs include confidence scores and reasoning traces where applicable. We publish an annual AI transparency report.</p>
      <h3 className="text-white font-semibold text-base">6. Accountability</h3>
      <p>Our AI Ethics Committee, comprising engineers, researchers, legal experts, and external advisors, reviews AI governance practices quarterly. We maintain a responsible AI incident response process and publish findings from any significant AI-related incidents.</p>
      <h3 className="text-white font-semibold text-base">7. Continuous Improvement</h3>
      <p>We invest in ongoing research to improve the fairness, safety, and reliability of our AI systems. We participate in industry working groups on AI governance and contribute to the development of AI safety standards.</p>
    </LegalPageShell>
  )
}

/* ──────────────── HOOK ──────────────── */
function usePublicNav() {
  const navigate = useCallback((page: PageId) => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return navigate
}

/* ──────────────── MAIN COMPONENT ──────────────── */
export default function PublicSite() {
  const [currentPage, setCurrentPage] = useState<PageId>('home')
  const handleNavigate = useCallback((page: PageId) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const renderPage = () => {
    const pages: Record<PageId, React.ReactNode> = {
      home: <HomePage />,
      about: <AboutPage />,
      platform: <PlatformPage />,
      agents: <AgentsPage />,
      departments: <DepartmentsPage />,
      infrastructure: <InfrastructurePage />,
      services: <ServicesPage />,
      api: <ApiPage />,
      workflows: <WorkflowsPage />,
      'local-ai': <LocalAIPage />,
      'private-models': <PrivateModelsPage />,
      security: <SecurityPage />,
      integration: <IntegrationPage />,
      developers: <DevelopersPage />,
      pricing: <PricingPage />,
      'request-access': <RequestAccessPage />,
      contact: <ContactPage />,
      documentation: <DocumentationPage />,
      status: <StatusPage />,
      privacy: <PrivacyPage />,
      terms: <TermsPage />,
      'security-policy': <SecurityPolicyPage />,
      'acceptable-use': <AcceptableUsePage />,
      'data-processing': <DataProcessingPage />,
      'ai-governance': <AIGovernancePage />,
    }
    return pages[currentPage] || <HomePage />
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <PublicNavbar currentPage={currentPage} onNavigate={handleNavigate} />
      <main className="pt-16">{renderPage()}</main>
      <PublicFooter onNavigate={handleNavigate} />
    </div>
  )
}