'use client'

import React, { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { create } from 'zustand'
import {
  LayoutDashboard, Building2, Bot, Scale, ClipboardList, Landmark, ShieldCheck, FileText,
  Network, Database, FileCode, Wrench, Brain, Map, RotateCcw, Heart, TrendingUp,
  BarChart3, Users, GitBranch, Zap, Globe, Server, HardDrive, Eye, Shield, Lock,
  Menu, ChevronLeft, ChevronRight, Sun, Moon, Activity, Rocket, Calendar,
  Megaphone, PenTool, Palette, Receipt, Globe2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { AloLabsLogo, Mark } from '@/components/brand/alo-logo'

// ─── Types ────────────────────────────────────────────────────────────────────
export type EnterpriseView =
  | 'agent-command-center'
  | 'agentos-command'
  | 'agentos-runs'
  | 'enterprise-overview'
  | 'department-hub'
  | 'ai-employees'
  | 'constitution-engine'
  | 'sop-system'
  | 'knowledge-graph'
  | 'rag-engine'
  | 'prompt-library'
  | 'skills-registry'
  | 'memory-engine'
  | 'planning-engine'
  | 'reflection-engine'
  | 'self-healing'
  | 'self-optimization'
  | 'evaluation-engine'
  | 'collaboration'
  | 'workflow-orchestration'
  | 'event-bus'
  | 'api-gateway'
  | 'mcp-integration'
  | 'data-lake'
  | 'observability'
  | 'security-engine'
  | 'audit-engine'
  | 'compliance-engine'
  | 'governance-engine'
  | 'enterprise-rbac'
  | 'strategic-command'
  | 'master-roadmap'
  | 'system-architecture'
  | 'marketing-kit'
  | 'diagram-studio'
  | 'brand-book'
  | 'invoice'
  | 'public-site'

interface NavItem {
  id: EnterpriseView
  name: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── Local Store ──────────────────────────────────────────────────────────────
interface EnterpriseState {
  currentView: EnterpriseView
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  setView: (view: EnterpriseView) => void
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

const useEnterpriseStore = create<EnterpriseState>((set) => ({
  currentView: 'enterprise-overview',
  sidebarOpen: true,
  theme: 'light',
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') localStorage.setItem('enterprise-theme', theme)
    set({ theme })
  },
}))

// ─── Navigation Config ────────────────────────────────────────────────────────
const navGroups: NavGroup[] = [
  {
    label: 'ALO Labs',
    items: [
      { id: 'strategic-command' as EnterpriseView, name: 'Strategic Command', icon: Rocket },
      { id: 'master-roadmap' as EnterpriseView, name: 'Master Roadmap', icon: Calendar },
      { id: 'system-architecture' as EnterpriseView, name: 'System Architecture', icon: Network },
    ],
  },
  {
    label: 'Command Center',
    items: [
      { id: 'agentos-command' as EnterpriseView, name: 'Command Center', icon: Zap },
      { id: 'agentos-runs' as EnterpriseView, name: 'Runs', icon: Activity },
      { id: 'agent-command-center' as EnterpriseView, name: 'Agent Command Center', icon: Brain },
      { id: 'enterprise-overview', name: 'Enterprise Overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Foundation',
    items: [
      { id: 'department-hub', name: 'Department Hub', icon: Building2 },
      { id: 'ai-employees', name: 'AI Employees', icon: Bot },
    ],
  },
  {
    label: 'Governance',
    items: [
      { id: 'constitution-engine', name: 'Constitutional Rules', icon: Scale },
      { id: 'sop-system', name: 'SOPs System', icon: ClipboardList },
      { id: 'governance-engine', name: 'Governance Engine', icon: Landmark },
      { id: 'compliance-engine', name: 'Compliance Engine', icon: ShieldCheck },
      { id: 'audit-engine', name: 'Audit Engine', icon: FileText },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'knowledge-graph', name: 'Knowledge Graph', icon: Network },
      { id: 'rag-engine', name: 'Enterprise RAG', icon: Database },
      { id: 'prompt-library', name: 'Prompt Library', icon: FileCode },
      { id: 'skills-registry', name: 'Skills Registry', icon: Wrench },
    ],
  },
  {
    label: 'Cognitive',
    items: [
      { id: 'memory-engine', name: 'Memory Engine', icon: Brain },
      { id: 'planning-engine', name: 'Planning Engine', icon: Map },
      { id: 'reflection-engine', name: 'Reflection Engine', icon: RotateCcw },
      { id: 'self-healing', name: 'Self-Healing', icon: Heart },
      { id: 'self-optimization', name: 'Self-Optimization', icon: TrendingUp },
      { id: 'evaluation-engine', name: 'Evaluation Engine', icon: BarChart3 },
    ],
  },
  {
    label: 'Collaboration',
    items: [
      { id: 'collaboration', name: 'Multi-Agent Collab', icon: Users },
      { id: 'workflow-orchestration', name: 'Workflow Orch.', icon: GitBranch },
      { id: 'event-bus', name: 'Event Bus', icon: Zap },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'api-gateway', name: 'API Gateway', icon: Globe },
      { id: 'mcp-integration', name: 'MCP Integration', icon: Server },
      { id: 'data-lake', name: 'Data Lake', icon: HardDrive },
      { id: 'observability', name: 'Observability', icon: Eye },
      { id: 'security-engine', name: 'Security Engine', icon: Shield },
    ],
  },
  {
    label: 'Marketing & Design',
    items: [
      { id: 'marketing-kit', name: 'Marketing Kit', icon: Megaphone },
      { id: 'diagram-studio', name: 'Diagram Studio', icon: PenTool },
      { id: 'brand-book', name: 'Brand Book', icon: Palette },
      { id: 'invoice', name: 'Invoice', icon: Receipt },
      { id: 'public-site', name: 'Public Site', icon: Globe2 },
    ],
  },
  {
    label: 'Identity',
    items: [
      { id: 'enterprise-rbac', name: 'Enterprise RBAC', icon: Lock },
    ],
  },
]

// ─── Lazy Panel Map ────────────────────────────────────────────────────────────
const panelMap: Record<EnterpriseView, React.LazyExoticComponent<React.ComponentType<{ onNavigate?: (view: EnterpriseView) => void }>>> = {
  'agentos-command': lazy(() => import('./panels/agentos-command')),
  'agentos-runs': lazy(() => import('./panels/agentos-runs')),
  'agent-command-center': lazy(() => import('./panels/agent-command-center')),
  'enterprise-overview': lazy(() => import('./panels/enterprise-overview')),
  'department-hub': lazy(() => import('./panels/department-hub')),
  'ai-employees': lazy(() => import('./panels/ai-employees')),
  'constitution-engine': lazy(() => import('./panels/constitution-engine')),
  'sop-system': lazy(() => import('./panels/sop-system')),
  'knowledge-graph': lazy(() => import('./panels/knowledge-graph')),
  'rag-engine': lazy(() => import('./panels/rag-engine')),
  'prompt-library': lazy(() => import('./panels/prompt-library')),
  'skills-registry': lazy(() => import('./panels/skills-registry')),
  'memory-engine': lazy(() => import('./panels/memory-engine')),
  'planning-engine': lazy(() => import('./panels/planning-engine')),
  'reflection-engine': lazy(() => import('./panels/reflection-engine')),
  'self-healing': lazy(() => import('./panels/self-healing-engine')),
  'self-optimization': lazy(() => import('./panels/self-optimization-engine')),
  'evaluation-engine': lazy(() => import('./panels/evaluation-engine')),
  'collaboration': lazy(() => import('./panels/collaboration')),
  'workflow-orchestration': lazy(() => import('./panels/workflow-orchestration')),
  'event-bus': lazy(() => import('./panels/event-bus')),
  'api-gateway': lazy(() => import('./panels/api-gateway')),
  'mcp-integration': lazy(() => import('./panels/mcp-integration')),
  'data-lake': lazy(() => import('./panels/data-lake')),
  'observability': lazy(() => import('./panels/observability')),
  'security-engine': lazy(() => import('./panels/security-engine')),
  'audit-engine': lazy(() => import('./panels/audit-engine')),
  'compliance-engine': lazy(() => import('./panels/compliance-engine')),
  'governance-engine': lazy(() => import('./panels/governance-engine')),
  'enterprise-rbac': lazy(() => import('./panels/enterprise-rbac')),
  'strategic-command': lazy(() => import('./panels/strategic-command')),
  'master-roadmap': lazy(() => import('./panels/master-roadmap')),
  'system-architecture': lazy(() => import('./panels/system-architecture')),
  'marketing-kit': lazy(() => import('@/components/panels/marketing-kit-panel')),
  'diagram-studio': lazy(() => import('@/components/diagrams/diagram-studio-panel')),
  'brand-book': lazy(() => import('@/components/brand/brand-book-panel')),
  invoice: lazy(() => import('@/components/brand/invoice-panel')),
  'public-site': lazy(() => import('@/components/brand/public-site-panel')),
}

// ─── Sidebar Content ───────────────────────────────────────────────────────────
function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const currentView = useEnterpriseStore((s) => s.currentView)
  const setView = useEnterpriseStore((s) => s.setView)

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-2">
            {!collapsed && (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = currentView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`
                    group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150
                    ${collapsed ? 'justify-center px-2' : ''}
                    ${isActive
                      ? 'bg-[#003ABC]/8 text-[#003ABC] shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
                    }
                  `}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#003ABC]' : 'text-slate-500 dark:text-slate-400'}`} />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// ─── Loading Fallback ──────────────────────────────────────────────────────────
function PanelLoader() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ─── Main Shell ────────────────────────────────────────────────────────────────
export default function EnterpriseShell() {
  const { currentView, sidebarOpen, theme, setView, toggleSidebar, setTheme } = useEnterpriseStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('enterprise-theme')
    if (saved === 'light' || saved === 'dark') setTheme(saved)
    setMounted(true)
  }, [setTheme])

  const handleNav = useCallback((view: EnterpriseView) => {
    setView(view)
    setMobileOpen(false)
  }, [setView])

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-xl bg-[#003ABC] flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <p className="text-sm text-slate-500">Loading Enterprise Platform...</p>
        </div>
      </div>
    )
  }

  const isDark = theme === 'dark'
  const PanelComponent = panelMap[currentView]
  const currentNav = navGroups.flatMap(g => g.items).find(i => i.id === currentView)

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? 'dark' : ''}`}>
      <div className={`flex h-full flex-1 ${isDark ? 'bg-[#0F172A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
        {/* ── Desktop Sidebar ── */}
        <aside
          className={`hidden lg:flex flex-col border-r transition-all duration-300 ${
            isDark
              ? 'bg-[#1E293B]/80 border-slate-700/50'
              : 'bg-white/80 border-slate-200'
          } ${sidebarOpen ? 'w-[260px]' : 'w-[68px]'}`}
        >
          {/* Logo area */}
          <div className={`flex items-center gap-3 border-b px-4 h-14 shrink-0 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            {sidebarOpen ? (
              <AloLabsLogo size={30} />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Mark size={30} />
              </span>
            )}
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-hidden">
            <SidebarContent collapsed={!sidebarOpen} />
          </div>

          {/* Collapse toggle */}
          <div className={`border-t p-2 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="w-full justify-center"
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* ── Top Header ── */}
          <header
            className={`flex items-center justify-between border-b px-4 h-14 shrink-0 ${
              isDark ? 'bg-[#1E293B]/80 border-slate-700/50' : 'bg-white/80 border-slate-200'
            } backdrop-blur-sm`}
          >
            <div className="flex items-center gap-3">
              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className={`w-[280px] p-0 ${isDark ? 'bg-[#1E293B]' : 'bg-white'}`}>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className={`flex items-center gap-3 border-b px-4 h-14 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#003ABC]">
                      <span className="text-white font-bold text-sm">A</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold leading-tight">ALO Labs AgentOS</span>
                      <span className="text-[10px] text-slate-500">Enterprise Platform</span>
                    </div>
                  </div>
                  <SidebarContent collapsed={false} />
                </SheetContent>
              </Sheet>

              {/* Mobile logo */}
              <div className="flex items-center gap-3 lg:hidden">
                <AloLabsLogo size={30} tagline={false} />
              </div>

              {/* Breadcrumb */}
              <div className="hidden lg:flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white">Enterprise</span>
                <span className="text-slate-400">/</span>
                {currentNav && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    {(() => { const Ic = currentNav.icon; return <Ic className="h-3.5 w-3.5" /> })()}
                    {currentNav.name}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Health indicator */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <Activity className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">All Systems Go</span>
              </div>

              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="h-8 w-8"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              {/* User avatar */}
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#FF6A00] text-white text-xs font-bold">AL</AvatarFallback>
              </Avatar>
            </div>
          </header>

          {/* ── Content Area ── */}
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<PanelLoader />}>
              <PanelComponent onNavigate={handleNav} />
            </Suspense>
          </main>

          {/* ── Footer ── */}
          <footer
            className={`flex items-center justify-between border-t px-4 h-10 shrink-0 text-[11px] ${
              isDark ? 'bg-[#1E293B]/80 border-slate-700/50 text-slate-500' : 'bg-white/80 border-slate-200 text-slate-400'
            }`}
          >
            <span className="font-medium">ALO Labs AgentOS v3.0 — Enterprise AI Platform</span>
            <span className="hidden sm:inline">Secure. Smart. Scalable.</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
