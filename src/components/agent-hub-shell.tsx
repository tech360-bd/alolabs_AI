'use client'

import { useEffect, useState, useRef, Suspense, lazy } from 'react'
import { useAppStore } from '@/store/app'
import type { ViewType } from '@/store/app'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard,
  Building2,
  Bot,
  Zap,
  GitBranch,
  ClipboardList,
  BarChart3,
  CheckSquare,
  Settings,
  Menu,
  ChevronLeft,
  Crown,
  ArrowRightLeft,
  Users,
  Key,
  Webhook as WebhookIcon,
  Shield,
  Activity,
  Play,
  Network,
  Database,
  Search,
  Cpu,
  DollarSign,
  MessageSquare,
  ShieldAlert,
  CreditCard,
  TrendingUp,
  BarChart2,
  Brain,
  FolderTree,
  Wrench,
  FileText,
  ShieldCheck,
  Receipt,
  Store,
  Layers,
  Coins,
  Eye,
  Building,
  OctagonAlert,
  Server,
  Lock,
  HardDrive,
  Rocket,
  Bell,
  Palette,
  Plug,
  GraduationCap,
  ClipboardCheck,
  Globe,
  Workflow,
  Target,
  Gauge,
  Mic,
  BookOpen,
  Video,
  UserCheck,
  Files,
  Landmark,
  ImageIcon,
  Sun,
  Moon,
} from 'lucide-react'

import LoginPage from '@/components/pages/login'
import { AloLogo } from '@/components/alo-logo'

// ─── Lazy-loaded panel components (grouped by section) ───────────────────────

// Command
const WebCrmDashboard = lazy(() => import('@/components/panels/web-crm-dashboard'))
const SuperCommandingChat = lazy(() => import('@/components/panels/super-commanding-chat'))
const SuperAdminCommandCenter = lazy(() => import('@/components/panels/super-admin-command-center'))

// Overview
const CompaniesPanel = lazy(() => import('@/components/panels/companies-panel'))
const DepartmentsPanel = lazy(() => import('@/components/panels/departments-panel'))
const AgentsRegistryPanel = lazy(() => import('@/components/panels/agents-registry-panel'))
const SkillsPanel = lazy(() => import('@/components/panels/skills-panel'))

// Operations
const CrmDealsPanel = lazy(() => import('@/components/panels/crm-deals-panel'))
const DealPipelinePanel = lazy(() => import('@/components/panels/deal-pipeline-panel'))
const ContactsPanel = lazy(() => import('@/components/panels/contacts-panel'))
const TasksPanel = lazy(() => import('@/components/panels/tasks-panel'))
const OutputCenterPanel = lazy(() => import('@/components/panels/output-center-panel'))
const UsagePanel = lazy(() => import('@/components/panels/usage-panel'))
const AgentUsagePanel = lazy(() => import('@/components/panels/agent-usage-panel'))
const WorkflowUsagePanel = lazy(() => import('@/components/panels/workflow-usage-panel'))

// Management
const CrmConnectionsPanel = lazy(() => import('@/components/panels/crm-connections-panel'))
const ApprovalsPanel = lazy(() => import('@/components/panels/approvals-panel'))
const WorkflowsPanel = lazy(() => import('@/components/panels/workflows-panel'))
const AutomationPanel = lazy(() => import('@/components/panels/automation-panel'))
const IntegrationManagerPanel = lazy(() => import('@/components/panels/integration-manager-panel'))
const DocumentSystemPanel = lazy(() => import('@/components/panels/document-system-panel'))

// Intelligence
const RagPanel = lazy(() => import('@/components/panels/rag-panel'))
const CapabilityRequestPanel = lazy(() => import('@/components/panels/capability-request-panel'))
const MemoryPanel = lazy(() => import('@/components/panels/memory-panel'))

// AI Hub
const ModelHubPanel = lazy(() => import('@/components/panels/model-hub-panel'))
const ResearchHubPanel = lazy(() => import('@/components/panels/research-hub-panel'))
const EducationHubPanel = lazy(() => import('@/components/panels/education-hub-panel'))
const UniversityDirectoryPanel = lazy(() => import('@/components/panels/university-directory-panel').then(m => ({ default: m.UniversityDirectoryPanel })))
const VideoHubPanel = lazy(() => import('@/components/panels/video-hub-panel'))
const InterviewHubPanel = lazy(() => import('@/components/panels/interview-hub-panel'))
const VoiceSystemPanel = lazy(() => import('@/components/panels/voice-system-panel'))

// Build
const AgentFactoryPanel = lazy(() => import('@/components/panels/agent-factory-panel'))
const ToolRegistryPanel = lazy(() => import('@/components/panels/tool-registry-panel'))
const McpManagerPanel = lazy(() => import('@/components/panels/mcp-manager-panel'))
const MarketplacePanel = lazy(() => import('@/components/panels/marketplace-panel'))
const ModelRegistryPanel = lazy(() => import('@/components/panels/model-registry-panel'))

// Finance
const CostEstimatePanel = lazy(() => import('@/components/panels/cost-estimate-panel'))
const PaymentGuardPanel = lazy(() => import('@/components/panels/payment-guard-panel'))
const BillingPanel = lazy(() => import('@/components/panels/billing-panel'))

// Security
const AuthCenterPanel = lazy(() => import('@/components/panels/auth-center-panel'))
const PromptVaultPanel = lazy(() => import('@/components/panels/prompt-vault-panel'))
const ApiKeysPanel = lazy(() => import('@/components/panels/api-keys-panel'))
const WebhooksPanel = lazy(() => import('@/components/panels/webhooks-panel'))
const CompanyAccessPanel = lazy(() => import('@/components/panels/company-access-panel'))
const RoleManagementPanel = lazy(() => import('@/components/panels/role-management-panel'))
const ProtectionPanel = lazy(() => import('@/components/panels/protection-panel'))
const SecurityCenterPanel = lazy(() => import('@/components/panels/security-center-panel'))

// Learning
const FeedbackPanel = lazy(() => import('@/components/panels/feedback-panel'))
const SelfImprovementPanel = lazy(() => import('@/components/panels/self-improvement-panel'))
const AgentEvolutionPanel = lazy(() => import('@/components/panels/agent-evolution-panel'))
const ProductivityPanel = lazy(() => import('@/components/panels/productivity-panel'))
const AgentTrainingPanel = lazy(() => import('@/components/panels/agent-training-panel'))
const AgentEvaluationPanel = lazy(() => import('@/components/panels/agent-evaluation-panel'))

// System
const GpuMonitorPanel = lazy(() => import('@/components/panels/gpu-monitor-panel'))
const TokenBudgetPanel = lazy(() => import('@/components/panels/token-budget-panel'))
const QueuePanel = lazy(() => import('@/components/panels/queue-panel'))
const ObservatoryPanel = lazy(() => import('@/components/panels/observatory-panel'))
const InfraDashboardPanel = lazy(() => import('@/components/panels/infra-dashboard-panel'))
const SystemHealthPanel = lazy(() => import('@/components/panels/system-health-panel'))
const JobMonitorPanel = lazy(() => import('@/components/panels/job-monitor-panel'))
const TenantGatewayPanel = lazy(() => import('@/components/panels/tenant-gateway-panel'))
const IncidentPanel = lazy(() => import('@/components/panels/incident-panel'))
const NotificationPanel = lazy(() => import('@/components/panels/notification-panel'))
const WorkerManagerPanel = lazy(() => import('@/components/panels/worker-manager-panel'))
const AuditLogsPanel = lazy(() => import('@/components/panels/audit-logs-panel'))
const SettingsPanel = lazy(() => import('@/components/panels/settings-panel'))
const CommandCenter = lazy(() => import('@/components/panels/command-center'))

// Admin
const SisterCompaniesPanel = lazy(() => import('@/components/panels/sister-companies-panel'))
const EmergencyPanel = lazy(() => import('@/components/panels/emergency-panel'))
const BackupPanel = lazy(() => import('@/components/panels/backup-panel'))
const DisasterRecoveryPanel = lazy(() => import('@/components/panels/disaster-recovery-panel'))
const DeploymentPanel = lazy(() => import('@/components/panels/deployment-panel'))
const TenantAdminPanel = lazy(() => import('@/components/panels/tenant-admin-panel'))
const UserManagementPanel = lazy(() => import('@/components/panels/user-management-panel'))
const BrandManagementPanel = lazy(() => import('@/components/panels/brand-management-panel'))
const MediaLibraryPanel = lazy(() => import('@/components/panels/media-library-panel'))
const SuperAdminPanel = lazy(() => import('@/components/panels/super-admin-panel'))

// Marketing
const SmsPanel = lazy(() => import('@/components/panels/sms-panel'))
const SeoPanel = lazy(() => import('@/components/panels/seo-panel'))
const MediaStudioPanel = lazy(() => import('@/components/panels/media-studio-panel'))
const TicketsPanel = lazy(() => import('@/components/panels/tickets-panel'))
const MeetingsPanel = lazy(() => import('@/components/panels/meetings-panel'))
const FunnelsPanel = lazy(() => import('@/components/panels/funnels-panel'))
const SeoChallengePanel = lazy(() => import('@/components/panels/seo-challenge-panel'))

interface NavItem {
  id: ViewType
  label: string
  icon: React.ElementType
  group: string
}

const navItems: NavItem[] = [
  { id: 'super-admin', label: 'Command Chat', icon: Crown, group: 'Command' },
  { id: 'web-crm', label: 'CRM Dashboard', icon: LayoutDashboard, group: 'Command' },
  { id: 'companies', label: 'Companies', icon: Building2, group: 'Overview' },
  { id: 'departments', label: 'Departments', icon: FolderTree, group: 'Overview' },
  { id: 'agents-registry', label: 'Agent Registry', icon: Bot, group: 'Overview' },
  { id: 'skills-registry', label: 'Skills', icon: Wrench, group: 'Overview' },
  { id: 'crm-manager', label: 'CRM Manager', icon: Target, group: 'Operations' },
  { id: 'deal-pipeline', label: 'Deal Pipeline', icon: GitBranch, group: 'Operations' },
  { id: 'contacts', label: 'Contacts', icon: Users, group: 'Operations' },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList, group: 'Operations' },
  { id: 'output-center', label: 'Outputs', icon: FileText, group: 'Operations' },
  { id: 'usage-analytics', label: 'Usage Analytics', icon: BarChart3, group: 'Operations' },
  { id: 'agent-usage', label: 'Agent Usage', icon: TrendingUp, group: 'Operations' },
  { id: 'workflow-usage', label: 'Workflow Usage', icon: BarChart2, group: 'Operations' },
  { id: 'crm-connections', label: 'CRM Connections', icon: ArrowRightLeft, group: 'Management' },
  { id: 'approvals', label: 'Approvals', icon: CheckSquare, group: 'Management' },
  { id: 'workflows', label: 'Workflows', icon: Zap, group: 'Management' },
  { id: 'automation', label: 'Automation', icon: Workflow, group: 'Management' },
  { id: 'integration-manager', label: 'Integrations', icon: Plug, group: 'Management' },
  { id: 'document-system', label: 'Documents', icon: Files, group: 'Management' },
  { id: 'rag-center', label: 'RAG Knowledge', icon: Database, group: 'Intelligence' },
  { id: 'capability-request', label: 'Capability Gap', icon: Search, group: 'Intelligence' },
  { id: 'memory-center', label: 'Memory', icon: Brain, group: 'Intelligence' },
  { id: 'model-hub', label: 'Model Hub', icon: Server, group: 'AI Hub' },
  { id: 'research-hub', label: 'Research Hub', icon: BookOpen, group: 'AI Hub' },
  { id: 'education-hub', label: 'Education Hub', icon: GraduationCap, group: 'AI Hub' },
  { id: 'university-directory', label: 'University Directory', icon: Building2, group: 'Education' },
  { id: 'video-hub', label: 'Video Hub', icon: Video, group: 'AI Hub' },
  { id: 'interview-hub', label: 'Interview Hub', icon: UserCheck, group: 'AI Hub' },
  { id: 'voice-system', label: 'Voice System', icon: Mic, group: 'AI Hub' },
  { id: 'agent-factory', label: 'Agent Factory', icon: Cpu, group: 'Build' },
  { id: 'tool-registry', label: 'Tool Registry', icon: Wrench, group: 'Build' },
  { id: 'mcp-manager', label: 'MCP Manager', icon: Server, group: 'Build' },
  { id: 'marketplace', label: 'Marketplace', icon: Store, group: 'Build' },
  { id: 'model-registry', label: 'Model Registry', icon: Database, group: 'Build' },
  { id: 'cost-estimate', label: 'Cost Center', icon: DollarSign, group: 'Finance' },
  { id: 'payment-guard', label: 'Payment Guard', icon: CreditCard, group: 'Finance' },
  { id: 'billing', label: 'Billing', icon: Receipt, group: 'Finance' },
  { id: 'auth-center', label: 'Auth Center', icon: Shield, group: 'Security' },
  { id: 'prompt-vault', label: 'Prompt Vault', icon: Lock, group: 'Security' },
  { id: 'api-keys', label: 'API Keys', icon: Key, group: 'Security' },
  { id: 'webhooks', label: 'Webhooks', icon: WebhookIcon, group: 'Security' },
  { id: 'company-access', label: 'Access Matrix', icon: ShieldCheck, group: 'Security' },
  { id: 'superAdmin', label: 'Super Admin', icon: ShieldCheck, group: 'Security' },
  { id: 'role-management', label: 'Roles', icon: Users, group: 'Security' },
  { id: 'protection-mode', label: 'Protection', icon: ShieldAlert, group: 'Security' },
  { id: 'security-center', label: 'Security Center', icon: Shield, group: 'Security' },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare, group: 'Learning' },
  { id: 'self-improvement', label: 'Self Improve', icon: TrendingUp, group: 'Learning' },
  { id: 'agent-evolution', label: 'Evolution & Lineage', icon: GitBranch, group: 'Learning' },
  { id: 'productivity', label: 'Productivity', icon: BarChart2, group: 'Learning' },
  { id: 'agent-training', label: 'Training', icon: ClipboardCheck, group: 'Learning' },
  { id: 'agent-evaluation', label: 'Evaluation', icon: ClipboardCheck, group: 'Learning' },
  { id: 'gpu-monitor', label: 'GPU Monitor', icon: Gauge, group: 'System' },
  { id: 'token-budget', label: 'Token Budget', icon: Coins, group: 'System' },
  { id: 'queue', label: 'Job Queue', icon: Layers, group: 'System' },
  { id: 'observatory', label: 'Observatory', icon: Eye, group: 'System' },
  { id: 'infra-dashboard', label: 'Infrastructure', icon: HardDrive, group: 'System' },
  { id: 'system-health', label: 'System Health', icon: Activity, group: 'System' },
  { id: 'job-monitor', label: 'Job Monitor', icon: Play, group: 'System' },
  { id: 'tenant-gateway', label: 'Tenant Gateway', icon: Network, group: 'System' },
  { id: 'incident-center', label: 'Incidents', icon: OctagonAlert, group: 'System' },
  { id: 'notification-center', label: 'Notifications', icon: Bell, group: 'System' },
  { id: 'worker-manager', label: 'Workers', icon: Cpu, group: 'System' },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText, group: 'System' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  { id: 'sister-companies', label: 'Sister Companies', icon: Landmark, group: 'Admin' },
  { id: 'emergency', label: 'Emergency', icon: OctagonAlert, group: 'Admin' },
  { id: 'backup', label: 'Backup', icon: HardDrive, group: 'Admin' },
  { id: 'disaster-recovery', label: 'DR Recovery', icon: ShieldAlert, group: 'Admin' },
  { id: 'deployment-center', label: 'Deployments', icon: Rocket, group: 'Admin' },
  { id: 'tenant-admin', label: 'Tenant Admin', icon: Building, group: 'Admin' },
  { id: 'user-management', label: 'Users', icon: Users, group: 'Admin' },
  { id: 'brand-management', label: 'Brand Engine', icon: Palette, group: 'Admin' },
  { id: 'mediaLibrary', label: 'Media Library', icon: ImageIcon, group: 'Management' },
  { id: 'tickets', label: 'Tickets', icon: ClipboardList, group: 'Management' },
  { id: 'meetings', label: 'Meetings', icon: Users, group: 'Management' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, group: 'Marketing' },
  { id: 'seo', label: 'SEO', icon: Search, group: 'Marketing' },
  { id: 'mediaStudio', label: 'Media Studio', icon: ImageIcon, group: 'Marketing' },
  { id: 'funnels', label: 'Funnels', icon: Target, group: 'Marketing' },
  { id: 'seoChallenge', label: 'SEO Challenge', icon: TrendingUp, group: 'Marketing' },
]

const groups = ['Command', 'Overview', 'Operations', 'Management', 'Intelligence', 'AI Hub', 'Education', 'Build', 'Finance', 'Security', 'Learning', 'System', 'Admin', 'Marketing']

function PanelLoader() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48 bg-gray-100" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-96 rounded-xl bg-gray-100 lg:col-span-1" />
        <Skeleton className="h-96 rounded-xl bg-gray-100 lg:col-span-1" />
        <Skeleton className="h-96 rounded-xl bg-gray-100 lg:col-span-1" />
      </div>
      <Skeleton className="h-64 rounded-xl bg-gray-100" />
    </div>
  )
}

// AloLogo imported from @/components/alo-logo

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <AloLogo size={36} />
        {!collapsed && (
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-tight">
              <span className="text-[#FF6A00]">ALO Labs</span>
              <span className="text-[#003ABC] ml-1">AgentOS</span>
            </h2>
            <p className="text-[10px] text-[#94A3B8] leading-tight">AI Agent Operating System</p>
          </div>
        )}
      </div>
      <Separator className="bg-[#E2E8F0]" />
      <ScrollArea className="flex-1 py-2">
        {groups.map((group) => (
          <div key={group} className="mb-1">
            {!collapsed && (
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                {group}
              </p>
            )}
            {navItems
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = item.icon
                const active = currentView === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id)
                      onNavigate()
                    }}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1 ${
                      active
                        ? 'bg-[#003ABC]/8 text-[#003ABC] font-medium'
                        : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9]'
                    } ${collapsed ? 'justify-center px-2' : ''}`}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-[#003ABC]' : ''}`} />
                    {!collapsed && <span className="truncate text-[13px]">{item.label}</span>}
                    {active && !collapsed && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF6A00]" />
                    )}
                  </button>
                )
              })}
          </div>
        ))}
      </ScrollArea>

      {/* Bottom tagline */}
      {!collapsed && (
        <div className="p-4 border-t border-[#E2E8F0]">
          <p className="text-[10px] text-[#94A3B8] leading-relaxed">
            Secure. Smart. Scalable.<br />Built for the Future.
          </p>
        </div>
      )}
    </div>
  )
}

export default function AgentHubShell() {
  const _init = useAppStore((s) => s._init)
  const currentView = useAppStore((s) => s.currentView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const selectedCompany = useAppStore((s) => s.selectedCompany)
  const setSelectedCompany = useAppStore((s) => s.setSelectedCompany)
  const user = useAppStore((s) => s.user)

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const setShowPublicSite = useAppStore((s) => s.setShowPublicSite)

  const [companies, setCompanies] = useState<{ id: string; name: string; slug: string }[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Use ref to track initialization so we only call _init once
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      _init()
    }
  }, [_init])

  useEffect(() => {
    if (user) {
      fetch('/api/companies')
        .then((r) => r.json())
        .then((res) => setCompanies(res.data || []))
        .catch(() => {})
    }
  }, [user])

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />
  }

  const renderPanel = () => {
    const panelMap: Record<string, React.ReactNode> = {
      'web-crm': <WebCrmDashboard />,
      'super-admin': <SuperCommandingChat />,
      'super-command': <SuperAdminCommandCenter />,
      'crm-connections': <CrmConnectionsPanel />,
      'command-center': <CommandCenter />,
      'companies': <CompaniesPanel />,
      'departments': <DepartmentsPanel />,
      'agents-registry': <AgentsRegistryPanel />,
      'skills-registry': <SkillsPanel />,
      'workflows': <WorkflowsPanel />,
      'crm-manager': <CrmDealsPanel />,
      'deal-pipeline': <DealPipelinePanel />,
      'contacts': <ContactsPanel />,
      'tasks': <TasksPanel />,
      'usage-analytics': <UsagePanel />,
      'approvals': <ApprovalsPanel />,
      'protection-mode': <ProtectionPanel />,
      'payment-guard': <PaymentGuardPanel />,
      'audit-logs': <AuditLogsPanel />,
      'memory-center': <MemoryPanel />,
      'self-improvement': <SelfImprovementPanel />,
      'agent-evolution': <AgentEvolutionPanel />,
      'productivity': <ProductivityPanel />,
      'api-keys': <ApiKeysPanel />,
      'webhooks': <WebhooksPanel />,
      'company-access': <CompanyAccessPanel />,
      'system-health': <SystemHealthPanel />,
      'job-monitor': <JobMonitorPanel />,
      'tenant-gateway': <TenantGatewayPanel />,
      'rag-center': <RagPanel />,
      'capability-request': <CapabilityRequestPanel />,
      'agent-factory': <AgentFactoryPanel />,
      'cost-estimate': <CostEstimatePanel />,
      'feedback': <FeedbackPanel />,
      'settings': <SettingsPanel />,
      'auth-center': <AuthCenterPanel />,
      'security-center': <SecurityCenterPanel />,
      'billing': <BillingPanel />,
      'marketplace': <MarketplacePanel />,
      'queue': <QueuePanel />,
      'token-budget': <TokenBudgetPanel />,
      'observatory': <ObservatoryPanel />,
      'tenant-admin': <TenantAdminPanel />,
      'emergency': <EmergencyPanel />,
      'prompt-vault': <PromptVaultPanel />,
      'tool-registry': <ToolRegistryPanel />,
      'mcp-manager': <McpManagerPanel />,
      'incident-center': <IncidentPanel />,
      'notification-center': <NotificationPanel />,
      'backup': <BackupPanel />,
      'worker-manager': <WorkerManagerPanel />,
      'output-center': <OutputCenterPanel />,
      'deployment-center': <DeploymentPanel />,
      'user-management': <UserManagementPanel />,
      'role-management': <RoleManagementPanel />,
      'brand-management': <BrandManagementPanel />,
      'integration-manager': <IntegrationManagerPanel />,
      'agent-training': <AgentTrainingPanel />,
      'agent-evaluation': <AgentEvaluationPanel />,
      'model-registry': <ModelRegistryPanel />,
      'agent-usage': <AgentUsagePanel />,
      'workflow-usage': <WorkflowUsagePanel />,
      'disaster-recovery': <DisasterRecoveryPanel />,
      'automation': <AutomationPanel />,
      'infra-dashboard': <InfraDashboardPanel />,
      'model-hub': <ModelHubPanel />,
      'research-hub': <ResearchHubPanel />,
      'education-hub': <EducationHubPanel />,
      'video-hub': <VideoHubPanel />,
      'interview-hub': <InterviewHubPanel />,
      'voice-system': <VoiceSystemPanel />,
      'document-system': <DocumentSystemPanel />,
      'sister-companies': <SisterCompaniesPanel />,
      'gpu-monitor': <GpuMonitorPanel />,
      'mediaLibrary': <MediaLibraryPanel />,
      'superAdmin': <SuperAdminPanel />,
      'sms': <SmsPanel />,
      'seo': <SeoPanel />,
      'mediaStudio': <MediaStudioPanel />,
      'tickets': <TicketsPanel />,
      'meetings': <MeetingsPanel />,
      'funnels': <FunnelsPanel />,
      'seoChallenge': <SeoChallengePanel />,
      'university-directory': <UniversityDirectoryPanel />,
    }
    return panelMap[currentView] || <WebCrmDashboard />
  }

  const handleMobileNavigate = () => setMobileOpen(false)

  return (
    <div className={`flex h-screen overflow-hidden ${theme === 'dark' ? 'dark bg-[#0F172A]' : 'bg-[#F8FAFC]'}`}>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r backdrop-blur-xl ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E2E8F0]'} transition-all duration-300 ${
          collapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
      >
        <div className="flex items-center justify-end p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] rounded-lg"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        <SidebarContent collapsed={collapsed} onNavigate={() => {}} />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className={`h-14 border-b backdrop-blur-xl flex items-center justify-between px-4 flex-shrink-0 ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E2E8F0]'}`}>
          {/* Left: Mobile menu */}
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 text-[#64748B] hover:text-[#1E293B]">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={`left`} className={`w-[260px] p-0 backdrop-blur-xl ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E2E8F0]'}`}>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent collapsed={false} onNavigate={handleMobileNavigate} />
              </SheetContent>
            </Sheet>

            {/* Title */}
            <h1 className="text-lg font-bold hidden sm:block">
              <span className="alo-gradient-text">AgentOS</span>
            </h1>
          </div>

          {/* Right: Public site + Company switcher + health + avatar */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPublicSite(true)}
              className="h-8 text-xs text-[#64748B] hover:text-[#003ABC] hover:bg-[#F1F5F9] gap-1.5 rounded-lg"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Public Website</span>
            </Button>

            <Select value={selectedCompany || '__all__'} onValueChange={(v) => setSelectedCompany(v === '__all__' ? null : v)}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                <SelectItem value="__all__" className="text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]">
                  All Companies
                </SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.slug} value={c.slug} className="text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Health dot */}
            <div className="flex items-center gap-2">
              <span className="status-dot status-dot-active alo-pulse" />
              <span className="text-xs text-[#64748B] hidden md:inline">Healthy</span>
            </div>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-8 w-8 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] rounded-lg"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Avatar */}
            <Avatar className="h-8 w-8 border-2 border-[#E2E8F0]">
              <AvatarFallback className="bg-[#003ABC] text-white text-xs font-bold rounded-lg">
                {(user?.name || 'SA').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 overflow-hidden ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'} ${currentView === 'super-admin' ? '' : 'overflow-y-auto'}`}>
          <Suspense fallback={<PanelLoader />}>
            {renderPanel()}
          </Suspense>
        </main>
      </div>
    </div>
  )
}