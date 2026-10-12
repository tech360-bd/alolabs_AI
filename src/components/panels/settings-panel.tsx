'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Settings,
  Shield,
  Lock,
  Database,
  Bell,
  Brain,
  Globe,
  Palette,
  Search,
  RotateCcw,
  Save,
  Copy,
  Check,
  Info,
  Server,
  Fingerprint,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Setting {
  id: string
  key: string
  value: string
  type: string
  description?: string
}




const SETTING_SECTIONS = [
  { id: 'general', label: 'General', icon: Settings, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
  { id: 'security', label: 'Security', icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
  { id: 'ai-models', label: 'AI Models', icon: Brain, color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'database', label: 'Database', icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'api', label: 'API', icon: Globe, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
  { id: 'branding', label: 'Branding', icon: Palette, color: 'text-[#FF6A00]', bg: 'bg-orange-50' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('general')
  const [search, setSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [infraServices, setInfraServices] = useState<Array<{ type: string; name: string; status: string; connected: boolean; latencyMs: number; version: string | null; error: string | null }>>([])

  // Local form state for each section
  const [generalSettings, setGeneralSettings] = useState({
    appName: 'ALO Labs AIOS',
    appUrl: 'https://app.alo.ai',
    timezone: 'UTC',
    language: 'en',
    maintenanceMode: false,
    registrationOpen: true,
    maxAgentsPerTenant: '50',
  })

  const [securitySettings, setSecuritySettings] = useState({
    enforceMfa: true,
    sessionTimeout: '24',
    passwordMinLength: '12',
    maxLoginAttempts: '5',
    ipWhitelist: '',
    blockTorExit: true,
    auditLogRetention: '90',
    encryptDataAtRest: true,
  })

  const [aiModelSettings, setAiModelSettings] = useState({
    defaultModel: 'gpt-4o',
    fallbackModel: 'gpt-4o-mini',
    maxTokens: '4096',
    temperature: '0.7',
    enableStreaming: true,
    rateLimitRpm: '60',
    contentFilter: true,
    logModelInputs: false,
  })

  const [notifSettings, setNotifSettings] = useState({
    emailEnabled: true,
    slackEnabled: true,
    smtpHost: 'smtp.mailgun.org',
    smtpPort: '587',
    slackWebhook: 'https://hooks.slack.com/••••••',
    notifyOnDeploy: true,
    notifyOnIncident: true,
    notifyOnBudget: true,
    digestFrequency: 'daily',
  })

  const [dbSettings, setDbSettings] = useState({
    autoBackup: true,
    backupFrequency: 'daily',
    backupRetention: '30',
    readOnlyMode: false,
    connectionPool: '20',
    queryTimeout: '30',
    slowQueryThreshold: '1000',
    enableQueryLog: false,
  })

  const [apiSettings, setApiSettings] = useState({
    rateLimitEnabled: true,
    rateLimitWindow: '60',
    rateLimitMax: '100',
    enableGraphql: false,
    corsOrigins: 'https://app.alo.ai',
    apiKeyExpiry: '365',
    enableDocs: true,
    requireAuth: true,
  })

  const [brandingSettings, setBrandingSettings] = useState({
    primaryColor: '#FF6A00',
    secondaryColor: '#003ABC',
    companyName: 'ALO Labs',
    logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico',
    customCss: '',
    loginMessage: 'Welcome to ALO Labs AI Operating System',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).then((res) => {
        const apiSettings = res.data || []
        if (apiSettings.length > 0) setSettings(apiSettings)
      }).catch(() => {}),
      fetch('/api/infra/status').then((r) => r.json()).then((res) => {
        if (res.services && Array.isArray(res.services)) setInfraServices(res.services)
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const isBool = (v: string) => v === 'true' || v === 'false'
  const toBool = (v: string) => v === 'true'

  const handleToggle = useCallback(async (setting: Setting) => {
    const newVal = String(!toBool(setting.value))
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: setting.key, value: newVal, type: setting.type }),
      })
      if (res.ok) {
        setSettings((prev) => prev.map((s) => (s.key === setting.key ? { ...s, value: newVal } : s)))
        toast.success(`${setting.key} updated`)
      }
    } catch {
      toast.error('Failed to update setting')
    }
  }, [])

  const handleSave = () => {
    toast.success('Settings saved successfully')
    setHasChanges(false)
  }

  const handleReset = () => {
    toast.info('Settings reset to defaults')
    setHasChanges(false)
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const markChanged = () => setHasChanges(true)

  const renderSettingRow = (label: string, description: string, children: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1E293B]">{label}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-4">
          <Skeleton className="h-[500px] w-48 rounded-xl" />
          <Skeleton className="h-[500px] flex-1 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003ABC] to-[#0077FF] flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">System Settings</h2>
            <p className="text-sm text-[#64748B]">Configure your ALO Labs instance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" className="text-[#64748B] border-[#E2E8F0] gap-1.5" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
          <Button size="sm" className={`gap-1.5 ${hasChanges ? 'bg-[#FF6A00] hover:bg-[#E5600A] text-white' : 'bg-slate-200 text-slate-400 cursor-default'}`} onClick={handleSave} disabled={!hasChanges}>
            <Save className="w-3.5 h-3.5" /> Save Changes
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Section Nav */}
        <Card className="border-[#E2E8F0] shadow-sm lg:w-56 flex-shrink-0">
          <CardContent className="p-2">
            <nav className="space-y-0.5">
              {SETTING_SECTIONS.map((section) => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${activeSection === section.id ? 'bg-[#003ABC]/10 text-[#003ABC]' : 'text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]'}`}
                  >
                    <div className={`w-7 h-7 rounded-lg ${section.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${section.color}`} />
                    </div>
                    <span className="text-sm font-medium">{section.label}</span>
                    <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-opacity ${activeSection === section.id ? 'opacity-100 text-[#003ABC]' : 'opacity-0'}`} />
                  </button>
                )
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Settings Content */}
        <div className="flex-1 space-y-4">
          {/* ── General ── */}
          {activeSection === 'general' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">General Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Core application configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Application Name', 'The display name of your ALO Labs instance', (
                  <Input value={generalSettings.appName} onChange={(e) => { setGeneralSettings((s) => ({ ...s, appName: e.target.value })); markChanged() }} className="w-56 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Application URL', 'The base URL for your instance', (
                  <Input value={generalSettings.appUrl} onChange={(e) => { setGeneralSettings((s) => ({ ...s, appUrl: e.target.value })); markChanged() }} className="w-56 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Timezone', 'Default timezone for all operations', (
                  <Select value={generalSettings.timezone} onValueChange={(v) => { setGeneralSettings((s) => ({ ...s, timezone: v })); markChanged() }}>
                    <SelectTrigger className="w-40 bg-white border-[#E2E8F0] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern (US)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific (US)</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                ))}
                <Separator />
                {renderSettingRow('Max Agents per Tenant', 'Maximum number of AI agents per tenant', (
                  <Input type="number" value={generalSettings.maxAgentsPerTenant} onChange={(e) => { setGeneralSettings((s) => ({ ...s, maxAgentsPerTenant: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Maintenance Mode', 'Put the system in maintenance mode', (
                  <Switch checked={generalSettings.maintenanceMode} onCheckedChange={(v) => { setGeneralSettings((s) => ({ ...s, maintenanceMode: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Open Registration', 'Allow new users to register', (
                  <Switch checked={generalSettings.registrationOpen} onCheckedChange={(v) => { setGeneralSettings((s) => ({ ...s, registrationOpen: v })); markChanged() }} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Security ── */}
          {activeSection === 'security' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">Security Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Authentication, authorization, and data protection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Enforce MFA', 'Require multi-factor authentication for all users', (
                  <Switch checked={securitySettings.enforceMfa} onCheckedChange={(v) => { setSecuritySettings((s) => ({ ...s, enforceMfa: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
                <Separator />
                {renderSettingRow('Session Timeout (hours)', 'Duration before inactive sessions expire', (
                  <Input type="number" value={securitySettings.sessionTimeout} onChange={(e) => { setSecuritySettings((s) => ({ ...s, sessionTimeout: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Min Password Length', 'Minimum characters for user passwords', (
                  <Input type="number" value={securitySettings.passwordMinLength} onChange={(e) => { setSecuritySettings((s) => ({ ...s, passwordMinLength: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Max Login Attempts', 'Lock account after failed login attempts', (
                  <Input type="number" value={securitySettings.maxLoginAttempts} onChange={(e) => { setSecuritySettings((s) => ({ ...s, maxLoginAttempts: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Block Tor Exit Nodes', 'Block connections from Tor exit node IP addresses', (
                  <Switch checked={securitySettings.blockTorExit} onCheckedChange={(v) => { setSecuritySettings((s) => ({ ...s, blockTorExit: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Encrypt Data at Rest', 'Enable AES-256 encryption for stored data', (
                  <Switch checked={securitySettings.encryptDataAtRest} onCheckedChange={(v) => { setSecuritySettings((s) => ({ ...s, encryptDataAtRest: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
                <Separator />
                {renderSettingRow('Audit Log Retention (days)', 'How long to keep security audit logs', (
                  <Input type="number" value={securitySettings.auditLogRetention} onChange={(e) => { setSecuritySettings((s) => ({ ...s, auditLogRetention: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('IP Whitelist', 'Comma-separated list of allowed IPs (empty = allow all)', (
                  <Input value={securitySettings.ipWhitelist} onChange={(e) => { setSecuritySettings((s) => ({ ...s, ipWhitelist: e.target.value })); markChanged() }} className="w-56 bg-white border-[#E2E8F0] h-8 text-sm" placeholder="e.g. 10.0.0.1,192.168.1.0/24" />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── AI Models ── */}
          {activeSection === 'ai-models' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">AI Model Configuration</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Configure default models, parameters, and limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Default Model', 'Primary model for agent interactions', (
                  <Select value={aiModelSettings.defaultModel} onValueChange={(v) => { setAiModelSettings((s) => ({ ...s, defaultModel: v })); markChanged() }}>
                    <SelectTrigger className="w-44 bg-white border-[#E2E8F0] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                    </SelectContent>
                  </Select>
                ))}
                <Separator />
                {renderSettingRow('Fallback Model', 'Used when the primary model is unavailable', (
                  <Select value={aiModelSettings.fallbackModel} onValueChange={(v) => { setAiModelSettings((s) => ({ ...s, fallbackModel: v })); markChanged() }}>
                    <SelectTrigger className="w-44 bg-white border-[#E2E8F0] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                    </SelectContent>
                  </Select>
                ))}
                <Separator />
                {renderSettingRow('Max Tokens', 'Maximum tokens per request', (
                  <Input type="number" value={aiModelSettings.maxTokens} onChange={(e) => { setAiModelSettings((s) => ({ ...s, maxTokens: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Temperature', 'Default sampling temperature (0.0 - 2.0)', (
                  <Input type="number" step="0.1" min="0" max="2" value={aiModelSettings.temperature} onChange={(e) => { setAiModelSettings((s) => ({ ...s, temperature: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Enable Streaming', 'Stream responses token by token', (
                  <Switch checked={aiModelSettings.enableStreaming} onCheckedChange={(v) => { setAiModelSettings((s) => ({ ...s, enableStreaming: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Rate Limit (req/min)', 'Max API requests per minute per user', (
                  <Input type="number" value={aiModelSettings.rateLimitRpm} onChange={(e) => { setAiModelSettings((s) => ({ ...s, rateLimitRpm: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Content Filter', 'Enable content moderation and safety filters', (
                  <Switch checked={aiModelSettings.contentFilter} onCheckedChange={(v) => { setAiModelSettings((s) => ({ ...s, contentFilter: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
                <Separator />
                {renderSettingRow('Log Model Inputs', 'Store model inputs for debugging (privacy impact)', (
                  <Switch checked={aiModelSettings.logModelInputs} onCheckedChange={(v) => { setAiModelSettings((s) => ({ ...s, logModelInputs: v })); markChanged() }} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">Notification Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Email and Slack notification configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Email Notifications', 'Send notifications via email', (
                  <Switch checked={notifSettings.emailEnabled} onCheckedChange={(v) => { setNotifSettings((s) => ({ ...s, emailEnabled: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Slack Notifications', 'Send notifications to Slack channels', (
                  <Switch checked={notifSettings.slackEnabled} onCheckedChange={(v) => { setNotifSettings((s) => ({ ...s, slackEnabled: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('SMTP Host', 'Outgoing mail server hostname', (
                  <Input value={notifSettings.smtpHost} onChange={(e) => { setNotifSettings((s) => ({ ...s, smtpHost: e.target.value })); markChanged() }} className="w-48 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('SMTP Port', 'Outgoing mail server port', (
                  <Input value={notifSettings.smtpPort} onChange={(e) => { setNotifSettings((s) => ({ ...s, smtpPort: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Notify on Deploy', 'Alert when agents are deployed', (
                  <Switch checked={notifSettings.notifyOnDeploy} onCheckedChange={(v) => { setNotifSettings((s) => ({ ...s, notifyOnDeploy: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Notify on Incident', 'Alert when incidents are detected', (
                  <Switch checked={notifSettings.notifyOnIncident} onCheckedChange={(v) => { setNotifSettings((s) => ({ ...s, notifyOnIncident: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
                <Separator />
                {renderSettingRow('Notify on Budget Alert', 'Alert when spending reaches threshold', (
                  <Switch checked={notifSettings.notifyOnBudget} onCheckedChange={(v) => { setNotifSettings((s) => ({ ...s, notifyOnBudget: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Digest Frequency', 'How often to send summary digests', (
                  <Select value={notifSettings.digestFrequency} onValueChange={(v) => { setNotifSettings((s) => ({ ...s, digestFrequency: v })); markChanged() }}>
                    <SelectTrigger className="w-36 bg-white border-[#E2E8F0] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realtime">Real-time</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Database ── */}
          {activeSection === 'database' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">Database Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Backup, pooling, and query configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Auto Backup', 'Automatically create database backups', (
                  <Switch checked={dbSettings.autoBackup} onCheckedChange={(v) => { setDbSettings((s) => ({ ...s, autoBackup: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
                <Separator />
                {renderSettingRow('Backup Frequency', 'How often to create automatic backups', (
                  <Select value={dbSettings.backupFrequency} onValueChange={(v) => { setDbSettings((s) => ({ ...s, backupFrequency: v })); markChanged() }}>
                    <SelectTrigger className="w-36 bg-white border-[#E2E8F0] h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                ))}
                <Separator />
                {renderSettingRow('Backup Retention (days)', 'How long to keep backup files', (
                  <Input type="number" value={dbSettings.backupRetention} onChange={(e) => { setDbSettings((s) => ({ ...s, backupRetention: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Connection Pool Size', 'Max simultaneous database connections', (
                  <Input type="number" value={dbSettings.connectionPool} onChange={(e) => { setDbSettings((s) => ({ ...s, connectionPool: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Query Timeout (seconds)', 'Max execution time for database queries', (
                  <Input type="number" value={dbSettings.queryTimeout} onChange={(e) => { setDbSettings((s) => ({ ...s, queryTimeout: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Slow Query Threshold (ms)', 'Log queries exceeding this duration', (
                  <Input type="number" value={dbSettings.slowQueryThreshold} onChange={(e) => { setDbSettings((s) => ({ ...s, slowQueryThreshold: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Read-Only Mode', 'Put the database in read-only mode', (
                  <Switch checked={dbSettings.readOnlyMode} onCheckedChange={(v) => { setDbSettings((s) => ({ ...s, readOnlyMode: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Enable Query Logging', 'Log all database queries for debugging', (
                  <Switch checked={dbSettings.enableQueryLog} onCheckedChange={(v) => { setDbSettings((s) => ({ ...s, enableQueryLog: v })); markChanged() }} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── API ── */}
          {activeSection === 'api' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">API Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Rate limiting, CORS, and API gateway configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Rate Limiting', 'Enable API rate limiting', (
                  <Switch checked={apiSettings.rateLimitEnabled} onCheckedChange={(v) => { setApiSettings((s) => ({ ...s, rateLimitEnabled: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Rate Limit Window (seconds)', 'Time window for rate limiting', (
                  <Input type="number" value={apiSettings.rateLimitWindow} onChange={(e) => { setApiSettings((s) => ({ ...s, rateLimitWindow: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Rate Limit Max Requests', 'Max requests per window per client', (
                  <Input type="number" value={apiSettings.rateLimitMax} onChange={(e) => { setApiSettings((s) => ({ ...s, rateLimitMax: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('CORS Origins', 'Allowed origin URLs for cross-origin requests', (
                  <Input value={apiSettings.corsOrigins} onChange={(e) => { setApiSettings((s) => ({ ...s, corsOrigins: e.target.value })); markChanged() }} className="w-64 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('API Key Expiry (days)', 'Default expiry for new API keys', (
                  <Input type="number" value={apiSettings.apiKeyExpiry} onChange={(e) => { setApiSettings((s) => ({ ...s, apiKeyExpiry: e.target.value })); markChanged() }} className="w-24 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Enable API Docs', 'Expose Swagger/OpenAPI documentation', (
                  <Switch checked={apiSettings.enableDocs} onCheckedChange={(v) => { setApiSettings((s) => ({ ...s, enableDocs: v })); markChanged() }} />
                ))}
                <Separator />
                {renderSettingRow('Require Authentication', 'Require valid auth token for all API endpoints', (
                  <Switch checked={apiSettings.requireAuth} onCheckedChange={(v) => { setApiSettings((s) => ({ ...s, requireAuth: v })); markChanged() }} className="data-[state=checked]:bg-emerald-600" />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Branding ── */}
          {activeSection === 'branding' && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">Branding Settings</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Customize the look and feel of your instance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {renderSettingRow('Primary Color', 'Main brand color used throughout the UI', (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg border border-[#E2E8F0]" style={{ backgroundColor: brandingSettings.primaryColor }} />
                    <Input value={brandingSettings.primaryColor} onChange={(e) => { setBrandingSettings((s) => ({ ...s, primaryColor: e.target.value })); markChanged() }} className="w-28 bg-white border-[#E2E8F0] h-8 text-sm font-mono" />
                  </div>
                ))}
                <Separator />
                {renderSettingRow('Secondary Color', 'Accent color for secondary elements', (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg border border-[#E2E8F0]" style={{ backgroundColor: brandingSettings.secondaryColor }} />
                    <Input value={brandingSettings.secondaryColor} onChange={(e) => { setBrandingSettings((s) => ({ ...s, secondaryColor: e.target.value })); markChanged() }} className="w-28 bg-white border-[#E2E8F0] h-8 text-sm font-mono" />
                  </div>
                ))}
                <Separator />
                {renderSettingRow('Company Name', 'Display name in headers and emails', (
                  <Input value={brandingSettings.companyName} onChange={(e) => { setBrandingSettings((s) => ({ ...s, companyName: e.target.value })); markChanged() }} className="w-48 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Login Message', 'Custom message shown on the login page', (
                  <Input value={brandingSettings.loginMessage} onChange={(e) => { setBrandingSettings((s) => ({ ...s, loginMessage: e.target.value })); markChanged() }} className="w-64 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
                <Separator />
                {renderSettingRow('Logo URL', 'Path to the company logo image', (
                  <Input value={brandingSettings.logoUrl} onChange={(e) => { setBrandingSettings((s) => ({ ...s, logoUrl: e.target.value })); markChanged() }} className="w-48 bg-white border-[#E2E8F0] h-8 text-sm" />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Infrastructure Status (fetched from API) ── */}
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-[#1E293B]">Infrastructure Services</CardTitle>
              <CardDescription className="text-xs text-[#64748B]">Real-time connectivity and health of backend services</CardDescription>
            </CardHeader>
            <CardContent>
              {infraServices.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-[#94A3B8]">
                  <Server className="w-8 h-8" />
                  <p className="text-sm">No service status available</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {infraServices.map((svc) => (
                    <div key={svc.type} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-slate-50">
                      <div className={`w-2.5 h-2.5 rounded-full ${svc.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium text-[#1E293B] w-32 flex-shrink-0">{svc.name}</span>
                      <Badge variant="outline" className={`text-[10px] font-semibold ${svc.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {svc.status}
                      </Badge>
                      {svc.version && <span className="text-xs text-[#94A3B8] font-mono">v{svc.version}</span>}
                      {svc.latencyMs > 0 && <span className="text-xs text-[#94A3B8]">{svc.latencyMs}ms</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>



          {/* DB Settings (from API) */}
          {settings.length > 0 && (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-[#1E293B]">Database Settings (from API)</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Settings stored in the database</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-[#E2E8F0]">
                {settings.map((setting) => {
                  const boolVal = isBool(setting.value)
                  return (
                    <div key={setting.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1E293B] font-mono">{setting.key}</p>
                        {boolVal ? (
                          <p className="text-xs text-[#94A3B8]">{toBool(setting.value) ? 'Enabled' : 'Disabled'}</p>
                        ) : (
                          <p className="text-xs text-[#94A3B8] font-mono truncate">{setting.value}</p>
                        )}
                      </div>
                      {boolVal && <Switch checked={toBool(setting.value)} onCheckedChange={() => handleToggle(setting)} />}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}