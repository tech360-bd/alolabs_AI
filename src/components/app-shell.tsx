'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/store/app'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  Bot,
  Sparkles,
  Building2,
  GitBranch,
  ListTodo,
  Footprints,
  CheckCircle2,
  FileOutput,
  Brain,
  TrendingUp,
  Zap,
  ShieldAlert,
  CreditCard,
  Factory,
  Wrench,
  Globe,
  HeartPulse,
  Server,
  Rocket,
  Upload,
  Users,
  Monitor,
  Copy,
  Image as ImageIcon,
  GraduationCap,
  Video,
  Music,
  UserCircle,
  Crown,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import LoginPage from '@/components/pages/login'
import DashboardPage from '@/components/pages/dashboard'
import AgentsRegistryPage from '@/components/pages/agents-registry'
import SkillsRegistryPage from '@/components/pages/skills-registry'
import DepartmentsPage from '@/components/pages/departments'
import WorkflowsPage from '@/components/pages/workflows'
import TasksPage from '@/components/pages/tasks'
import TaskStepsPage from '@/components/pages/task-steps'
import ApprovalQueuePage from '@/components/pages/approval-queue'
import OutputsPage from '@/components/pages/outputs'
import MemoryPage from '@/components/pages/memory'
import SelfImprovementPage from '@/components/pages/self-improvement'
import ProductivityPage from '@/components/pages/productivity'
import ProtectionModePage from '@/components/pages/protection-mode'
import PaymentGuardPage from '@/components/pages/payment-guard'
import AgentFactoryPage from '@/components/pages/agent-factory'
import SkillFactoryPage from '@/components/pages/skill-factory'
import OpenclawToolsPage from '@/components/pages/openclaw-tools'
import AiHealthPage from '@/components/pages/ai-health'
import ServerAutomationPage from '@/components/pages/server-automation'
import AutoDomainDeployPage from '@/components/pages/auto-domain-deploy'
import ProjectUploadsPage from '@/components/pages/project-uploads'
import CrmBuilderPage from '@/components/pages/crm-builder'
import WebsiteBuilderPage from '@/components/pages/website-builder'
import WebCloneScraperPage from '@/components/pages/web-clone-scraper'
import ImageStudioPage from '@/components/pages/image-studio'
import StudyAcademicPage from '@/components/pages/study-academic'
import VideoStudioPage from '@/components/pages/video-studio'
import MusicStudioPage from '@/components/pages/music-studio'
import HumanAvatarVoicePage from '@/components/pages/human-avatar-voice'
import CeoControlPage from '@/components/pages/ceo-control'
import SettingsPage from '@/components/pages/settings'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  category: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Overview' },
  { id: 'agents-registry', label: 'Agents Registry', icon: <Bot className="h-4 w-4" />, category: 'Core' },
  { id: 'skills-registry', label: 'Skills Registry', icon: <Sparkles className="h-4 w-4" />, category: 'Core' },
  { id: 'departments', label: 'Departments', icon: <Building2 className="h-4 w-4" />, category: 'Core' },
  { id: 'workflows', label: 'Workflows', icon: <GitBranch className="h-4 w-4" />, category: 'Automation' },
  { id: 'tasks', label: 'Tasks', icon: <ListTodo className="h-4 w-4" />, category: 'Automation' },
  { id: 'task-steps', label: 'Task Steps', icon: <Footprints className="h-4 w-4" />, category: 'Automation' },
  { id: 'approval-queue', label: 'Approval Queue', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Automation' },
  { id: 'outputs', label: 'Outputs', icon: <FileOutput className="h-4 w-4" />, category: 'Data' },
  { id: 'memory', label: 'Memory', icon: <Brain className="h-4 w-4" />, category: 'Data' },
  { id: 'self-improvement', label: 'Self-Improvement', icon: <TrendingUp className="h-4 w-4" />, category: 'Intelligence' },
  { id: 'productivity', label: 'Productivity', icon: <Zap className="h-4 w-4" />, category: 'Intelligence' },
  { id: 'protection-mode', label: 'Protection Mode', icon: <ShieldAlert className="h-4 w-4" />, category: 'Security' },
  { id: 'payment-guard', label: 'Payment Guard', icon: <CreditCard className="h-4 w-4" />, category: 'Security' },
  { id: 'agent-factory', label: 'Agent Factory', icon: <Factory className="h-4 w-4" />, category: 'Factory' },
  { id: 'skill-factory', label: 'Skill Factory', icon: <Wrench className="h-4 w-4" />, category: 'Factory' },
  { id: 'openclaw-tools', label: 'OpenClaw Tools', icon: <Globe className="h-4 w-4" />, category: 'Factory' },
  { id: 'ai-health', label: 'AI Health', icon: <HeartPulse className="h-4 w-4" />, category: 'Infrastructure' },
  { id: 'server-automation', label: 'Server Automation', icon: <Server className="h-4 w-4" />, category: 'Infrastructure' },
  { id: 'auto-domain-deploy', label: 'Auto Domain Deploy', icon: <Rocket className="h-4 w-4" />, category: 'Infrastructure' },
  { id: 'project-uploads', label: 'Project Uploads', icon: <Upload className="h-4 w-4" />, category: 'Infrastructure' },
  { id: 'crm-builder', label: 'CRM Builder', icon: <Users className="h-4 w-4" />, category: 'Builders' },
  { id: 'website-builder', label: 'Website Builder', icon: <Monitor className="h-4 w-4" />, category: 'Builders' },
  { id: 'web-clone-scraper', label: 'Web Clone & Scraper', icon: <Copy className="h-4 w-4" />, category: 'Builders' },
  { id: 'image-studio', label: 'Image Studio', icon: <ImageIcon className="h-4 w-4" />, category: 'Studios' },
  { id: 'study-academic', label: 'Study & Academic', icon: <GraduationCap className="h-4 w-4" />, category: 'Studios' },
  { id: 'video-studio', label: 'Video Studio', icon: <Video className="h-4 w-4" />, category: 'Studios' },
  { id: 'music-studio', label: 'Music Studio', icon: <Music className="h-4 w-4" />, category: 'Studios' },
  { id: 'human-avatar-voice', label: 'Avatar & Voice', icon: <UserCircle className="h-4 w-4" />, category: 'Studios' },
  { id: 'ceo-control', label: 'CEO Control', icon: <Crown className="h-4 w-4" />, category: 'Admin' },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, category: 'Admin' },
]

const pageComponents: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  'agents-registry': AgentsRegistryPage,
  'skills-registry': SkillsRegistryPage,
  departments: DepartmentsPage,
  workflows: WorkflowsPage,
  tasks: TasksPage,
  'task-steps': TaskStepsPage,
  'approval-queue': ApprovalQueuePage,
  outputs: OutputsPage,
  memory: MemoryPage,
  'self-improvement': SelfImprovementPage,
  productivity: ProductivityPage,
  'protection-mode': ProtectionModePage,
  'payment-guard': PaymentGuardPage,
  'agent-factory': AgentFactoryPage,
  'skill-factory': SkillFactoryPage,
  'openclaw-tools': OpenclawToolsPage,
  'ai-health': AiHealthPage,
  'server-automation': ServerAutomationPage,
  'auto-domain-deploy': AutoDomainDeployPage,
  'project-uploads': ProjectUploadsPage,
  'crm-builder': CrmBuilderPage,
  'website-builder': WebsiteBuilderPage,
  'web-clone-scraper': WebCloneScraperPage,
  'image-studio': ImageStudioPage,
  'study-academic': StudyAcademicPage,
  'video-studio': VideoStudioPage,
  'music-studio': MusicStudioPage,
  'human-avatar-voice': HumanAvatarVoicePage,
  'ceo-control': CeoControlPage,
  settings: SettingsPage,
}

export default function AppShell() {
  const { user, currentView, sidebarOpen, setSidebarOpen, setView, logout, _init } = useAppStore()

  useEffect(() => {
    _init()
  }, [_init])

  if (!user) {
    return <LoginPage />
  }

  const categories = [...new Set(navItems.map((item) => item.category))]
  const PageComponent = pageComponents[currentView] || DashboardPage
  const currentNav = navItems.find((n) => n.id === currentView)

  const NavButton = ({ item }: { item: NavItem }) => {
    const active = currentView === item.id
    const btn = (
      <Button
        key={item.id}
        variant={active ? 'secondary' : 'ghost'}
        className={`w-full justify-start gap-3 h-9 px-3 text-sm font-normal ${
          active
            ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
        }`}
        onClick={() => setView(item.id as any)}
      >
        {item.icon}
        {sidebarOpen && <span className="truncate">{item.label}</span>}
      </Button>
    )
    if (!sidebarOpen) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent side="right" className="bg-slate-800 text-white">
              {item.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    return btn
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'w-60' : 'w-14'
          } flex-shrink-0 bg-slate-900 text-white flex flex-col transition-all duration-300 border-r border-slate-700`}
        >
          {/* Logo */}
          <div className="flex items-center gap-2 px-3 h-14 border-b border-slate-700 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            {sidebarOpen && (
              <span className="font-bold text-sm text-amber-400 truncate">AI Command Center</span>
            )}
          </div>

          {/* Nav */}
          <ScrollArea className="flex-1 py-2">
            {categories.map((cat) => (
              <div key={cat} className="mb-2">
                {sidebarOpen && (
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {cat}
                  </div>
                )}
                {!sidebarOpen && <Separator className="bg-slate-700/50 my-2" />}
                <div className="space-y-0.5 px-2">
                  {navItems
                    .filter((item) => item.category === cat)
                    .map((item) => (
                      <NavButton key={item.id} item={item} />
                    ))}
                </div>
              </div>
            ))}
          </ScrollArea>

          {/* Collapse toggle */}
          <div className="border-t border-slate-700 p-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-slate-400 hover:text-white hover:bg-slate-700/50"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {sidebarOpen && <span className="ml-2 text-xs">Collapse</span>}
            </Button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-14 bg-white border-b flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
            <div className="flex items-center gap-2">
              {currentNav && (
                <>
                  <div className="w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                    {currentNav.icon}
                  </div>
                  <h1 className="text-base font-semibold text-slate-800">{currentNav.label}</h1>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 hidden sm:block">{user.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{user.role}</span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500 hover:text-rose-600">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <PageComponent key={currentView} />
          </main>

          {/* Footer */}
          <footer className="h-10 bg-white border-t flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
            AI Command Center &copy; {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  )
}