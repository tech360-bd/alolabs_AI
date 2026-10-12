'use client'

import { useEffect, useState } from 'react'
import {
  ArrowDown,
  Ban,
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  GitBranch,
  KeyRound,
  LogIn,
  Network,
  Play,
  Receipt,
  Shield,
  ShieldAlert,
  Zap,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GatewayValidation {
  valid: boolean
  companyId: string
  companyName: string
  scopes: string[]
  rateLimit: { remaining: number; limit: number }
  timestamp: string
}

interface UsageEntry {
  companyId: string
  companyName: string
  requests: number
  limit: number
}

interface AuditLogEntry {
  id: string
  companyName: string
  action: string
  status: 'success' | 'denied' | 'error'
  timestamp: string
  details: string
}



// ─── Architecture Steps ──────────────────────────────────────────────────────

interface ArchStep {
  label: string
  sublabel: string
  icon: React.ReactNode
  borderColor: string
  bg: string
}

const ARCH_STEPS: ArchStep[] = [
  {
    label: 'Sister Company Backend',
    sublabel: 'External HTTP request',
    icon: <Building2 className="w-5 h-5" />,
    borderColor: 'border-l-[#FF6A00]',
    bg: 'bg-orange-50',
  },
  {
    label: 'ALO Labs API Gateway',
    sublabel: 'Secure API Key validation',
    icon: <KeyRound className="w-5 h-5" />,
    borderColor: 'border-l-[#FF6A00]',
    bg: 'bg-orange-50',
  },
  {
    label: 'LangGraph Command Router',
    sublabel: 'Intent parsing & dispatch',
    icon: <GitBranch className="w-5 h-5" />,
    borderColor: 'border-l-purple-500',
    bg: 'bg-purple-50',
  },
  {
    label: 'Selected Agents (1–5)',
    sublabel: 'Tenant-scoped agent pool',
    icon: <Network className="w-5 h-5" />,
    borderColor: 'border-l-[#003ABC]',
    bg: 'bg-blue-50',
  },
  {
    label: 'PydanticAI Validation',
    sublabel: 'Schema enforcement',
    icon: <Shield className="w-5 h-5" />,
    borderColor: 'border-l-[#003ABC]',
    bg: 'bg-blue-50',
  },
  {
    label: 'Protection Mode',
    sublabel: 'Content safety & policy guard',
    icon: <ShieldAlert className="w-5 h-5" />,
    borderColor: 'border-l-red-500',
    bg: 'bg-red-50',
  },
  {
    label: 'Payment Guard',
    sublabel: 'Billing & quota enforcement',
    icon: <Receipt className="w-5 h-5" />,
    borderColor: 'border-l-red-500',
    bg: 'bg-red-50',
  },
  {
    label: 'Local AI Execution',
    sublabel: 'On-premises model inference',
    icon: <Zap className="w-5 h-5" />,
    borderColor: 'border-l-green-600',
    bg: 'bg-green-50',
  },
  {
    label: 'Output Validation',
    sublabel: 'Response quality & safety check',
    icon: <CheckCircle2 className="w-5 h-5" />,
    borderColor: 'border-l-green-600',
    bg: 'bg-green-50',
  },
  {
    label: 'Usage & Audit Logs',
    sublabel: 'Full request lifecycle logging',
    icon: <FileText className="w-5 h-5" />,
    borderColor: 'border-l-[#64748B]',
    bg: 'bg-slate-50',
  },
  {
    label: 'Result → Company',
    sublabel: 'Secure response delivery',
    icon: <LogIn className="w-5 h-5" />,
    borderColor: 'border-l-[#FF6A00]',
    bg: 'bg-orange-50',
  },
]

// ─── Rules ───────────────────────────────────────────────────────────────────

const RULES = [
  {
    icon: <Ban className="w-5 h-5" />,
    title: 'No Direct Agent Access',
    description:
      'Sister companies never touch agent internals. All requests flow through the gateway, ensuring zero direct coupling to our AI infrastructure.',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
  },
  {
    icon: <KeyRound className="w-5 h-5" />,
    title: 'Scope Enforcement',
    description:
      'Each API key has limited scopes defining which agents and operations are accessible. Scopes are granted per-company by ALO Labs admins.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: 'Usage Limits',
    description:
      'Monthly request limits per company with real-time tracking. Soft warnings at 80% and hard caps at 100% to ensure fair resource allocation.',
    color: 'text-[#FF6A00]',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
  },
  {
    icon: <FileText className="w-5 h-5" />,
    title: 'Complete Audit Trail',
    description:
      'Every request is logged with full context — company identity, agent used, input/output hashes, duration, tokens consumed, and billing impact.',
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-100',
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function TenantGatewayPanel() {
  const [usage, setUsage] = useState<UsageEntry[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [usageRes, auditRes] = await Promise.all([
          fetch('/api/usage'),
          fetch('/api/audit-logs'),
        ])
        const usageJson = await usageRes.json()
        const auditJson = await auditRes.json()
        setUsage(
          usageJson.data && Array.isArray(usageJson.data) ? usageJson.data : []
        )
        setAuditLogs(
          auditJson.data && Array.isArray(auditJson.data) ? auditJson.data : []
        )
      } catch {
        setUsage([])
        setAuditLogs([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const maxRequests = Math.max(...usage.map((u) => u.requests), 1)

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <div className="space-y-1">
          <Skeleton className="h-7 w-64 bg-slate-200" />
          <Skeleton className="h-4 w-96 bg-slate-100" />
        </div>
        <div className="flex flex-col items-center gap-2 py-8">
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-80 rounded-lg bg-slate-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl bg-slate-100" />
          <Skeleton className="h-64 rounded-xl bg-slate-100" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold text-[#1E293B]">
          Tenant API Gateway
        </h2>
        <p className="text-sm text-[#64748B] mt-0.5">
          How sister companies securely access ALO Labs AI agents
        </p>
      </div>

      {/* ── Central Architecture Diagram ────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <Network className="w-4 h-4 text-[#003ABC]" />
          Request Flow Architecture
        </h3>

        <div className="flex flex-col items-center">
          {ARCH_STEPS.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center w-full max-w-lg">
              {/* Step Card */}
              <div
                className={`
                  w-full bg-white rounded-xl border border-[#E2E8F0] border-l-4 ${step.borderColor}
                  px-4 py-3 flex items-center gap-3 shadow-sm
                  transition-all hover:shadow-md hover:-translate-y-0.5
                `}
              >
                <div
                  className={`w-10 h-10 rounded-lg ${step.bg} flex items-center justify-center shrink-0`}
                >
                  <span className="text-[#1E293B]">{step.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1E293B] truncate">
                    {step.label}
                  </p>
                  <p className="text-xs text-[#64748B]">{step.sublabel}</p>
                </div>
              </div>

              {/* Connector Arrow */}
              {idx < ARCH_STEPS.length - 1 && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-4 bg-[#CBD5E1]" />
                  <ArrowDown className="w-3.5 h-3.5 text-[#94A3B8]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Two-column: Distribution + Rules ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Request Distribution */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#FF6A00]" />
            Company Request Distribution
          </h3>

          <div className="space-y-4">
            {usage.map((entry) => {
              const pct = Math.round((entry.requests / maxRequests) * 100)
              const usagePct = Math.round((entry.requests / entry.limit) * 100)
              const barColor = getUsageBarColor(usagePct)
              return (
                <div key={entry.companyId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#1E293B] truncate">
                      {entry.companyName}
                    </span>
                    <span className="text-xs text-[#64748B] ml-2 shrink-0">
                      {entry.requests.toLocaleString()} / {entry.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="relative h-3 w-full bg-[#F1F5F9] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5 text-right">
                    {usagePct}% of monthly limit
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Request Flow Rules */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#003ABC]" />
            Request Flow Rules
          </h3>

          {RULES.map((rule) => (
            <div
              key={rule.title}
              className={`bg-white rounded-xl border border-[#E2E8F0] p-4 flex gap-3 ${rule.border} hover:shadow-sm transition-shadow`}
            >
              <div
                className={`w-10 h-10 rounded-lg ${rule.bg} ${rule.color} flex items-center justify-center shrink-0`}
              >
                {rule.icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#1E293B]">
                  {rule.title}
                </h4>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  {rule.description}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* ── Recent Gateway Activity ─────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#003ABC]" />
            Recent Gateway Activity
          </h3>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <div className="divide-y divide-[#E2E8F0]">
            {auditLogs.map((entry) => (
              <div
                key={entry.id}
                className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="mt-0.5">
                  {entry.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : entry.status === 'denied' ? (
                    <Ban className="w-4 h-4 text-red-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#1E293B]">
                      {entry.companyName}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        entry.status === 'success'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : entry.status === 'denied'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-[#64748B] mt-0.5">{entry.action}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">{entry.details}</p>
                </div>
                <span className="text-xs text-[#94A3B8] shrink-0 whitespace-nowrap">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function getUsageBarColor(usagePct: number): string {
  if (usagePct >= 90) return 'bg-red-500'
  if (usagePct >= 75) return 'bg-amber-500'
  if (usagePct >= 50) return 'bg-[#FF6A00]'
  return 'bg-[#003ABC]'
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}