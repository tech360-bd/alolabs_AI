import { create } from 'zustand'

// ─── ViewType Union ───────────────────────────────────────────────────────────
// All 71 nav view names + login view
export type ViewType =
  | 'web-crm'
  | 'super-admin'
  | 'superAdmin'
  | 'super-command'
  | 'crm-connections'
  | 'command-center'
  | 'companies'
  | 'departments'
  | 'agents-registry'
  | 'skills-registry'
  | 'workflows'
  | 'crm-manager'
  | 'deal-pipeline'
  | 'contacts'
  | 'tasks'
  | 'usage-analytics'
  | 'approvals'
  | 'protection-mode'
  | 'payment-guard'
  | 'audit-logs'
  | 'memory-center'
  | 'self-improvement'
  | 'productivity'
  | 'api-keys'
  | 'webhooks'
  | 'company-access'
  | 'system-health'
  | 'job-monitor'
  | 'tenant-gateway'
  | 'rag-center'
  | 'capability-request'
  | 'agent-factory'
  | 'cost-estimate'
  | 'feedback'
  | 'settings'
  | 'auth-center'
  | 'security-center'
  | 'billing'
  | 'marketplace'
  | 'queue'
  | 'token-budget'
  | 'observatory'
  | 'tenant-admin'
  | 'emergency'
  | 'prompt-vault'
  | 'tool-registry'
  | 'mcp-manager'
  | 'incident-center'
  | 'notification-center'
  | 'backup'
  | 'worker-manager'
  | 'output-center'
  | 'deployment-center'
  | 'user-management'
  | 'role-management'
  | 'brand-management'
  | 'integration-manager'
  | 'agent-training'
  | 'agent-evolution'
  | 'agent-evaluation'
  | 'model-registry'
  | 'agent-usage'
  | 'workflow-usage'
  | 'disaster-recovery'
  | 'automation'
  | 'infra-dashboard'
  | 'model-hub'
  | 'research-hub'
  | 'education-hub'
  | 'video-hub'
  | 'interview-hub'
  | 'voice-system'
  | 'document-system'
  | 'sister-companies'
  | 'gpu-monitor'
  | 'mediaLibrary'
  | 'sms'
  | 'seo'
  | 'mediaStudio'
  | 'tickets'
  | 'meetings'
  | 'funnels'
  | 'seoChallenge'
  | 'university-directory'
  | 'login'

// ─── User Interface ───────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  role: string
}

// ─── Theme Type ───────────────────────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark'

// ─── App State Interface ─────────────────────────────────────────────────────
interface AppState {
  // Auth
  user: User | null
  token: string | null

  // Navigation
  sidebarOpen: boolean
  currentView: ViewType
  selectedCompany: string | null
  showPublicSite: boolean

  // UI State
  notificationCount: number
  theme: ThemeMode
  commandPaletteOpen: boolean

  // Actions
  login: (user: User, token: string) => void
  logout: () => void
  setSidebarOpen: (open: boolean) => void
  setView: (view: ViewType) => void
  setSelectedCompany: (slug: string | null) => void
  setShowPublicSite: (show: boolean) => void
  setNotificationCount: (count: number) => void
  setTheme: (theme: ThemeMode) => void
  setCommandPaletteOpen: (open: boolean) => void
  _init: () => void
}

// ─── Default View ─────────────────────────────────────────────────────────────
const DEFAULT_VIEW: ViewType = 'web-crm'
const LOGIN_VIEW: ViewType = 'login'

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>((set) => ({
  // Auth defaults
  user: null,
  token: null,

  // Navigation defaults
  sidebarOpen: true,
  currentView: DEFAULT_VIEW,
  selectedCompany: null,
  showPublicSite: false,

  // UI State defaults
  notificationCount: 0,
  theme: 'light',
  commandPaletteOpen: false,

  // ─── Auth Actions ────────────────────────────────────────────────────────
  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token)
      localStorage.setItem('alo_token', token)
      localStorage.setItem('user', JSON.stringify(user))
      window.dispatchEvent(new Event('auth-change'))
    }
    set({ user, token, currentView: DEFAULT_VIEW })
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('alo_token')
      localStorage.removeItem('user')
      window.dispatchEvent(new Event('auth-change'))
    }
    set({ user: null, token: null, currentView: LOGIN_VIEW })
  },

  // ─── Navigation Actions ──────────────────────────────────────────────────
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setView: (view) => set({ currentView: view }),
  setSelectedCompany: (slug) => set({ selectedCompany: slug }),
  setShowPublicSite: (show) => set({ showPublicSite: show }),

  // ─── UI State Actions ────────────────────────────────────────────────────
  setNotificationCount: (count) => set({ notificationCount: count }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme)
    }
    set({ theme })
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  // ─── Init (hydrate from localStorage) ────────────────────────────────────
  _init: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token') || localStorage.getItem('alo_token')
      const userStr = localStorage.getItem('user')
      if (token && userStr) {
        try {
          set({ token, user: JSON.parse(userStr), currentView: DEFAULT_VIEW })
        } catch {
          // ignore parse errors
        }
      }

      // Restore theme preference
      const savedTheme = localStorage.getItem('theme') as ThemeMode | null
      if (savedTheme === 'light' || savedTheme === 'dark') {
        set({ theme: savedTheme })
      }
    }
  },
}))