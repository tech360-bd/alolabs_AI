/**
 * Unified dashboard navigation — the single source of truth for every view in
 * the ALO Labs AgentOS dashboard.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The repository previously shipped three parallel shells, each with its own
 * navigation list and its own copy of the panels:
 *
 *   - src/components/enterprise/enterprise-shell.tsx  (the only one rendered)
 *   - src/components/agent-hub-shell.tsx              (never imported)
 *   - src/components/app-shell.tsx                    (never imported)
 *
 * Two thirds of the product was therefore unreachable: the AI agent panels,
 * the open-source model hub and the studio/factory tools existed only inside
 * the two shells that nothing mounted. This module merges all three lists into
 * one ordered, de-duplicated catalogue so every panel is reachable.
 *
 * Ordering rule: the enterprise groups come first (that is the shipped
 * information architecture), then any group that existed only in the hub or
 * app shells. Where an id existed in more than one shell, the richest
 * implementation is kept — see DASHBOARD_PANELS below.
 */

import type { ComponentType } from 'react'
import {
  Activity,
  ArrowRightLeft,
  BarChart2,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Building,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Copy,
  Cpu,
  CreditCard,
  Crown,
  Database,
  DollarSign,
  Eye,
  FileCheck2,
  FileCode,
  FileOutput,
  FileText,
  Files,
  FolderTree,
  Footprints,
  Gauge,
  GitBranch,
  Globe,
  Globe2,
  GraduationCap,
  HardDrive,
  Heart,
  HeartPulse,
  ImageIcon,
  Key,
  Landmark,
  Layers,
  LayoutDashboard,
  Lock,
  Map,
  Megaphone,
  MessageSquare,
  Mic,
  Monitor,
  Music,
  Network,
  OctagonAlert,
  Palette,
  PenTool,
  Play,
  Plug,
  Receipt,
  Rocket,
  RotateCcw,
  Scale,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Target,
  TrendingUp,
  Upload,
  UserCheck,
  UserCircle,
  Users,
  Video,
  WebhookIcon,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react'

export interface DashboardNavItem {
  /** Stable view id; also the key into DASHBOARD_PANELS. */
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export interface DashboardNavGroup {
  label: string
  items: DashboardNavItem[]
}

/** Default view shown after sign-in. */
export const DEFAULT_DASHBOARD_VIEW = 'enterprise-overview'

export const DASHBOARD_NAV: DashboardNavGroup[] = [
  {
    label: "ALO Labs",
    items: [
      { id: "strategic-command", label: "Strategic Command", icon: Rocket },
      { id: "master-roadmap", label: "Master Roadmap", icon: Calendar },
      { id: "system-architecture", label: "System Architecture", icon: Network },
    ],
  },
  {
    label: "Command Center",
    items: [
      { id: "command-agent", label: "Commanding Center (Free AI Agent)", icon: Brain },
      { id: "agentos-command", label: "Command Center", icon: Zap },
      { id: "agentos-runs", label: "Runs", icon: Activity },
      { id: "agent-command-center", label: "Agent Command Center", icon: Brain },
      { id: "enterprise-overview", label: "Enterprise Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Foundation",
    items: [
      { id: "department-hub", label: "Department Hub", icon: Building2 },
      { id: "ai-employees", label: "AI Employees", icon: Bot },
    ],
  },
  {
    label: "Governance",
    items: [
      { id: "constitution-engine", label: "Constitutional Rules", icon: Scale },
      { id: "sop-system", label: "SOPs System", icon: ClipboardList },
      { id: "governance-engine", label: "Governance Engine", icon: Landmark },
      { id: "compliance-engine", label: "Compliance Engine", icon: ShieldCheck },
      { id: "audit-engine", label: "Audit Engine", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "knowledge-graph", label: "Knowledge Graph", icon: Network },
      { id: "rag-engine", label: "Enterprise RAG", icon: Database },
      { id: "prompt-library", label: "Prompt Library", icon: FileCode },
      { id: "skills-registry", label: "Skills Registry", icon: Wrench },
      { id: "rag-center", label: "RAG Knowledge", icon: Database },
      { id: "capability-request", label: "Capability Gap", icon: Search },
      { id: "memory-center", label: "Memory", icon: Brain },
    ],
  },
  {
    label: "Workforce",
    items: [
      { id: "ai-workforce", label: "AI Workforce", icon: Bot },
      { id: "ai-employee-governance", label: "Employee Governance", icon: ShieldCheck },
      { id: "agent-intelligence", label: "Agent Intelligence", icon: Brain },
      { id: "self-learning", label: "Self-Learning", icon: TrendingUp },
    ],
  },
  {
    label: "Cognitive",
    items: [
      { id: "memory-engine", label: "Memory Engine", icon: Brain },
      { id: "planning-engine", label: "Planning Engine", icon: Map },
      { id: "reflection-engine", label: "Reflection Engine", icon: RotateCcw },
      { id: "self-healing", label: "Self-Healing", icon: Heart },
      { id: "self-optimization", label: "Self-Optimization", icon: TrendingUp },
      { id: "evaluation-engine", label: "Evaluation Engine", icon: BarChart3 },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { id: "collaboration", label: "Multi-Agent Collab", icon: Users },
      { id: "workflow-orchestration", label: "Workflow Orch.", icon: GitBranch },
      { id: "event-bus", label: "Event Bus", icon: Zap },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { id: "api-gateway", label: "API Gateway", icon: Globe },
      { id: "ai-providers", label: "AI Providers", icon: Cpu },
      { id: "super-admin-ai", label: "Super Admin AI Control Plane", icon: ShieldCheck },
      { id: "mcp-integration", label: "MCP Integration", icon: Server },
      { id: "data-lake", label: "Data Lake", icon: HardDrive },
      { id: "observability", label: "Observability", icon: Eye },
      { id: "security-engine", label: "Security Engine", icon: Shield },
      { id: "ai-health", label: "AI Health", icon: HeartPulse },
      { id: "server-automation", label: "Server Automation", icon: Server },
      { id: "auto-domain-deploy", label: "Auto Domain Deploy", icon: Rocket },
      { id: "project-uploads", label: "Project Uploads", icon: Upload },
    ],
  },
  {
    label: "Marketing & Design",
    items: [
      { id: "marketing-kit", label: "Marketing Kit", icon: Megaphone },
      { id: "diagram-studio", label: "Diagram Studio", icon: PenTool },
      { id: "brand-book", label: "Brand Book", icon: Palette },
      { id: "invoice", label: "Invoice", icon: Receipt },
      { id: "public-site", label: "Public Site", icon: Globe2 },
    ],
  },
  {
    label: "Identity",
    items: [
      { id: "enterprise-rbac", label: "Enterprise RBAC", icon: Lock },
    ],
  },
  {
    label: "Command",
    items: [
      { id: "super-admin", label: "Command Chat", icon: Crown },
      { id: "web-crm", label: "CRM Dashboard", icon: LayoutDashboard },
      { id: "command-center", label: "Command Center", icon: LayoutDashboard },
      { id: "super-command", label: "Super Commanding Chat", icon: Crown },
    ],
  },
  {
    label: "Overview",
    items: [
      { id: "companies", label: "Companies", icon: Building2 },
      { id: "departments", label: "Departments", icon: FolderTree },
      { id: "agents-registry", label: "Agent Registry", icon: Bot },
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "crm-manager", label: "CRM Manager", icon: Target },
      { id: "deal-pipeline", label: "Deal Pipeline", icon: GitBranch },
      { id: "contacts", label: "Contacts", icon: Users },
      { id: "tasks", label: "Tasks", icon: ClipboardList },
      { id: "output-center", label: "Outputs", icon: FileText },
      { id: "usage-analytics", label: "Usage Analytics", icon: BarChart3 },
      { id: "agent-usage", label: "Agent Usage", icon: TrendingUp },
      { id: "workflow-usage", label: "Workflow Usage", icon: BarChart2 },
    ],
  },
  {
    label: "Management",
    items: [
      { id: "crm-connections", label: "CRM Connections", icon: ArrowRightLeft },
      { id: "approvals", label: "Approvals", icon: CheckSquare },
      { id: "workflows", label: "Workflows", icon: Zap },
      { id: "automation", label: "Automation", icon: Workflow },
      { id: "integration-manager", label: "Integrations", icon: Plug },
      { id: "document-system", label: "Documents", icon: Files },
      { id: "mediaLibrary", label: "Media Library", icon: ImageIcon },
      { id: "tickets", label: "Tickets", icon: ClipboardList },
      { id: "meetings", label: "Meetings", icon: Users },
    ],
  },
  {
    label: "AI Hub",
    items: [
      { id: "model-hub", label: "Model Hub", icon: Server },
      { id: "research-hub", label: "Research Hub", icon: BookOpen },
      { id: "education-hub", label: "Education Hub", icon: GraduationCap },
      { id: "video-hub", label: "Video Hub", icon: Video },
      { id: "interview-hub", label: "Interview Hub", icon: UserCheck },
      { id: "voice-system", label: "Voice System", icon: Mic },
    ],
  },
  {
    label: "Education",
    items: [
      { id: "university-directory", label: "University Directory", icon: Building2 },
    ],
  },
  {
    label: "Build",
    items: [
      { id: "agent-factory", label: "Agent Factory", icon: Cpu },
      { id: "tool-registry", label: "Tool Registry", icon: Wrench },
      { id: "mcp-manager", label: "MCP Manager", icon: Server },
      { id: "marketplace", label: "Marketplace", icon: Store },
      { id: "model-registry", label: "Model Registry", icon: Database },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "cost-estimate", label: "Cost Center", icon: DollarSign },
      { id: "payment-guard", label: "Payment Guard", icon: CreditCard },
      { id: "billing", label: "Billing", icon: Receipt },
    ],
  },
  {
    label: "Security",
    items: [
      { id: "auth-center", label: "Auth Center", icon: Shield },
      { id: "prompt-vault", label: "Prompt Vault", icon: Lock },
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "webhooks", label: "Webhooks", icon: WebhookIcon },
      { id: "company-access", label: "Access Matrix", icon: ShieldCheck },
      { id: "superAdmin", label: "Super Admin", icon: ShieldCheck },
      { id: "role-management", label: "Roles", icon: Users },
      { id: "protection-mode", label: "Protection", icon: ShieldAlert },
      { id: "security-center", label: "Security Center", icon: Shield },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "link-coverage", label: "Link Coverage", icon: FileCheck2 },
      { id: "sister-companies", label: "Sister Companies", icon: Landmark },
      { id: "emergency", label: "Emergency", icon: OctagonAlert },
      { id: "backup", label: "Backup", icon: HardDrive },
      { id: "disaster-recovery", label: "DR Recovery", icon: ShieldAlert },
      { id: "deployment-center", label: "Deployments", icon: Rocket },
      { id: "tenant-admin", label: "Tenant Admin", icon: Building },
      { id: "user-management", label: "Users", icon: Users },
      { id: "brand-management", label: "Brand Engine", icon: Palette },
      { id: "ceo-control", label: "CEO Control", icon: Crown },
    ],
  },
  {
    label: "Learning",
    items: [
      { id: "feedback", label: "Feedback", icon: MessageSquare },
      { id: "self-improvement", label: "Self Improve", icon: TrendingUp },
      { id: "agent-evolution", label: "Evolution & Lineage", icon: GitBranch },
      { id: "productivity", label: "Productivity", icon: BarChart2 },
      { id: "agent-training", label: "Training", icon: ClipboardCheck },
      { id: "agent-evaluation", label: "Evaluation", icon: ClipboardCheck },
    ],
  },
  {
    label: "System",
    items: [
      { id: "gpu-monitor", label: "GPU Monitor", icon: Gauge },
      { id: "token-budget", label: "Token Budget", icon: Coins },
      { id: "queue", label: "Job Queue", icon: Layers },
      { id: "observatory", label: "Observatory", icon: Eye },
      { id: "infra-dashboard", label: "Infrastructure", icon: HardDrive },
      { id: "system-health", label: "System Health", icon: Activity },
      { id: "job-monitor", label: "Job Monitor", icon: Play },
      { id: "tenant-gateway", label: "Tenant Gateway", icon: Network },
      { id: "incident-center", label: "Incidents", icon: OctagonAlert },
      { id: "notification-center", label: "Notifications", icon: Bell },
      { id: "worker-manager", label: "Workers", icon: Cpu },
      { id: "audit-logs", label: "Audit Logs", icon: FileText },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Marketing",
    items: [
      { id: "sms", label: "SMS", icon: MessageSquare },
      { id: "seo", label: "SEO", icon: Search },
      { id: "mediaStudio", label: "Media Studio", icon: ImageIcon },
      { id: "funnels", label: "Funnels", icon: Target },
      { id: "seoChallenge", label: "SEO Challenge", icon: TrendingUp },
    ],
  },
  {
    label: "Automation",
    items: [
      { id: "task-steps", label: "Task Steps", icon: Footprints },
      { id: "approval-queue", label: "Approval Queue", icon: CheckCircle2 },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "outputs", label: "Outputs", icon: FileOutput },
      { id: "memory", label: "Memory", icon: Brain },
    ],
  },
  {
    label: "Factory",
    items: [
      { id: "skill-factory", label: "Skill Factory", icon: Wrench },
      { id: "openclaw-tools", label: "OpenClaw Tools", icon: Globe },
    ],
  },
  {
    label: "Builders",
    items: [
      { id: "crm-builder", label: "CRM Builder", icon: Users },
      { id: "website-builder", label: "Website Builder", icon: Monitor },
      { id: "web-clone-scraper", label: "Web Clone & Scraper", icon: Copy },
    ],
  },
  {
    label: "Studios",
    items: [
      { id: "image-studio", label: "Image Studio", icon: ImageIcon },
      { id: "study-academic", label: "Study & Academic", icon: GraduationCap },
      { id: "video-studio", label: "Video Studio", icon: Video },
      { id: "music-studio", label: "Music Studio", icon: Music },
      { id: "human-avatar-voice", label: "Avatar & Voice", icon: UserCircle },
    ],
  },
]

/**
 * Lazy loaders for every dashboard view.
 *
 * Props are intentionally loose because the three legacy shells passed
 * different ones: enterprise panels accept an optional `onNavigate`, hub and
 * app panels take none. The shell passes `onNavigate` to all of them; panels
 * that ignore it simply do not declare it.
 */
export type DashboardPanelProps = { onNavigate?: (view: string) => void }

export const DASHBOARD_PANELS: Record<string, () => Promise<{ default: ComponentType<DashboardPanelProps> }>> = {
  "agent-command-center": () => import('@/components/enterprise/panels/agent-command-center') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-evaluation": () => import('@/components/panels/agent-evaluation-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-evolution": () => import('@/components/panels/agent-evolution-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-factory": () => import('@/components/panels/agent-factory-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-intelligence": () => import('@/components/panels/agent-intelligence-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-training": () => import('@/components/panels/agent-training-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agent-usage": () => import('@/components/panels/agent-usage-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agentos-command": () => import('@/components/enterprise/panels/agentos-command') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agentos-runs": () => import('@/components/enterprise/panels/agentos-runs') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "agents-registry": () => import('@/components/panels/agents-registry-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ai-employee-governance": () => import('@/components/enterprise/panels/ai-employee-governance') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ai-employees": () => import('@/components/enterprise/panels/ai-employees') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ai-health": () => import('@/components/pages/ai-health') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ai-providers": () => import('@/components/enterprise/panels/ai-providers') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ai-workforce": () => import('@/components/panels/ai-workforce-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "api-gateway": () => import('@/components/enterprise/panels/api-gateway') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "api-keys": () => import('@/components/panels/api-keys-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "approval-queue": () => import('@/components/pages/approval-queue') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "approvals": () => import('@/components/panels/approvals-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "audit-engine": () => import('@/components/enterprise/panels/audit-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "audit-logs": () => import('@/components/panels/audit-logs-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "auth-center": () => import('@/components/panels/auth-center-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "auto-domain-deploy": () => import('@/components/pages/auto-domain-deploy') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "automation": () => import('@/components/panels/automation-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "backup": () => import('@/components/panels/backup-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "billing": () => import('@/components/panels/billing-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "brand-book": () => import('@/components/brand/brand-book-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "brand-management": () => import('@/components/panels/brand-management-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "capability-request": () => import('@/components/panels/capability-request-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "ceo-control": () => import('@/components/pages/ceo-control') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "collaboration": () => import('@/components/enterprise/panels/collaboration') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "command-agent": () => import('@/components/enterprise/panels/command-agent-center') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "command-center": () => import('@/components/panels/command-center') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "companies": () => import('@/components/panels/companies-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "company-access": () => import('@/components/panels/company-access-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "compliance-engine": () => import('@/components/enterprise/panels/compliance-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "constitution-engine": () => import('@/components/enterprise/panels/constitution-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "contacts": () => import('@/components/panels/contacts-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "cost-estimate": () => import('@/components/panels/cost-estimate-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "crm-builder": () => import('@/components/pages/crm-builder') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "crm-connections": () => import('@/components/panels/crm-connections-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "crm-manager": () => import('@/components/panels/crm-deals-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "dashboard": () => import('@/components/pages/dashboard') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "data-lake": () => import('@/components/enterprise/panels/data-lake') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "deal-pipeline": () => import('@/components/panels/deal-pipeline-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "department-hub": () => import('@/components/enterprise/panels/department-hub') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "departments": () => import('@/components/panels/departments-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "deployment-center": () => import('@/components/panels/deployment-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "diagram-studio": () => import('@/components/diagrams/diagram-studio-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "disaster-recovery": () => import('@/components/panels/disaster-recovery-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "document-system": () => import('@/components/panels/document-system-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "education-hub": () => import('@/components/panels/education-hub-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "emergency": () => import('@/components/panels/emergency-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "enterprise-overview": () => import('@/components/enterprise/panels/enterprise-overview') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "enterprise-rbac": () => import('@/components/enterprise/panels/enterprise-rbac') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "evaluation-engine": () => import('@/components/enterprise/panels/evaluation-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "event-bus": () => import('@/components/enterprise/panels/event-bus') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "feedback": () => import('@/components/panels/feedback-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "funnels": () => import('@/components/panels/funnels-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "governance-engine": () => import('@/components/enterprise/panels/governance-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "gpu-monitor": () => import('@/components/panels/gpu-monitor-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "human-avatar-voice": () => import('@/components/pages/human-avatar-voice') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "image-studio": () => import('@/components/pages/image-studio') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "incident-center": () => import('@/components/panels/incident-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "infra-dashboard": () => import('@/components/panels/infra-dashboard-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "integration-manager": () => import('@/components/panels/integration-manager-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "interview-hub": () => import('@/components/panels/interview-hub-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "invoice": () => import('@/components/brand/invoice-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "job-monitor": () => import('@/components/panels/job-monitor-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "knowledge-graph": () => import('@/components/enterprise/panels/knowledge-graph') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "link-coverage": () => import('@/components/panels/link-coverage-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "marketing-kit": () => import('@/components/panels/marketing-kit-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "marketplace": () => import('@/components/panels/marketplace-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "master-roadmap": () => import('@/components/enterprise/panels/master-roadmap') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "mcp-integration": () => import('@/components/enterprise/panels/mcp-integration') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "mcp-manager": () => import('@/components/panels/mcp-manager-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "mediaLibrary": () => import('@/components/panels/media-library-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "mediaStudio": () => import('@/components/panels/media-studio-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "meetings": () => import('@/components/panels/meetings-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "memory": () => import('@/components/pages/memory') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "memory-center": () => import('@/components/panels/memory-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "memory-engine": () => import('@/components/enterprise/panels/memory-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "model-hub": () => import('@/components/panels/model-hub-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "model-registry": () => import('@/components/panels/model-registry-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "music-studio": () => import('@/components/pages/music-studio') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "notification-center": () => import('@/components/panels/notification-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "observability": () => import('@/components/enterprise/panels/observability') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "observatory": () => import('@/components/panels/observatory-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "openclaw-tools": () => import('@/components/pages/openclaw-tools') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "output-center": () => import('@/components/panels/output-center-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "outputs": () => import('@/components/pages/outputs') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "payment-guard": () => import('@/components/panels/payment-guard-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "planning-engine": () => import('@/components/enterprise/panels/planning-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "productivity": () => import('@/components/panels/productivity-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "project-uploads": () => import('@/components/pages/project-uploads') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "prompt-library": () => import('@/components/enterprise/panels/prompt-library') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "prompt-vault": () => import('@/components/panels/prompt-vault-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "protection-mode": () => import('@/components/panels/protection-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "public-site": () => import('@/components/brand/public-site-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "queue": () => import('@/components/panels/queue-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "rag-center": () => import('@/components/panels/rag-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "rag-engine": () => import('@/components/enterprise/panels/rag-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "reflection-engine": () => import('@/components/enterprise/panels/reflection-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "research-hub": () => import('@/components/panels/research-hub-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "role-management": () => import('@/components/panels/role-management-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "security-center": () => import('@/components/panels/security-center-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "security-engine": () => import('@/components/enterprise/panels/security-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "self-healing": () => import('@/components/enterprise/panels/self-healing-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "self-improvement": () => import('@/components/panels/self-improvement-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "self-learning": () => import('@/components/panels/self-learning-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "self-optimization": () => import('@/components/enterprise/panels/self-optimization-engine') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "seo": () => import('@/components/panels/seo-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "seoChallenge": () => import('@/components/panels/seo-challenge-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "server-automation": () => import('@/components/pages/server-automation') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "settings": () => import('@/components/panels/settings-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "sister-companies": () => import('@/components/panels/sister-companies-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "skill-factory": () => import('@/components/pages/skill-factory') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "skills-registry": () => import('@/components/panels/skills-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "sms": () => import('@/components/panels/sms-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "sop-system": () => import('@/components/enterprise/panels/sop-system') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "strategic-command": () => import('@/components/enterprise/panels/strategic-command') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "study-academic": () => import('@/components/pages/study-academic') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "super-admin": () => import('@/components/panels/super-commanding-chat') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "super-admin-ai": () => import('@/components/enterprise/panels/super-admin-ai-control-plane') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "super-command": () => import('@/components/panels/super-admin-command-center') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "superAdmin": () => import('@/components/panels/super-admin-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "system-architecture": () => import('@/components/enterprise/panels/system-architecture') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "system-health": () => import('@/components/panels/system-health-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "task-steps": () => import('@/components/pages/task-steps') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "tasks": () => import('@/components/panels/tasks-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "tenant-admin": () => import('@/components/panels/tenant-admin-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "tenant-gateway": () => import('@/components/panels/tenant-gateway-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "tickets": () => import('@/components/panels/tickets-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "token-budget": () => import('@/components/panels/token-budget-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "tool-registry": () => import('@/components/panels/tool-registry-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "university-directory": () => import('@/components/panels/university-directory-panel').then((m) => ({ default: m.UniversityDirectoryPanel as unknown as ComponentType<DashboardPanelProps> })),
  "usage-analytics": () => import('@/components/panels/usage-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "user-management": () => import('@/components/panels/user-management-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "video-hub": () => import('@/components/panels/video-hub-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "video-studio": () => import('@/components/pages/video-studio') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "voice-system": () => import('@/components/panels/voice-system-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "web-clone-scraper": () => import('@/components/pages/web-clone-scraper') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "web-crm": () => import('@/components/panels/web-crm-dashboard') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "webhooks": () => import('@/components/panels/webhooks-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "website-builder": () => import('@/components/pages/website-builder') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "worker-manager": () => import('@/components/panels/worker-manager-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "workflow-orchestration": () => import('@/components/enterprise/panels/workflow-orchestration') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "workflow-usage": () => import('@/components/panels/workflow-usage-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
  "workflows": () => import('@/components/panels/workflows-panel') as unknown as Promise<{ default: ComponentType<DashboardPanelProps> }>,
}

/** Flat lookup of nav items by id, for breadcrumbs and validation. */
export const DASHBOARD_NAV_INDEX: Record<string, DashboardNavItem> = Object.fromEntries(
  DASHBOARD_NAV.flatMap((group) => group.items).map((item) => [item.id, item]),
)

/** Resolve a view id to its loader, falling back to the default view. */
export function resolveDashboardPanel(viewId: string) {
  return DASHBOARD_PANELS[viewId] ?? DASHBOARD_PANELS[DEFAULT_DASHBOARD_VIEW]
}
