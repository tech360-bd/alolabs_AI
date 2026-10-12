'use client'

import { useEffect, useState } from 'react'
import { Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectionStats {
  total: number
  blocked: number
  allowed: number
  blockRate: string
}

interface ProtectionLog {
  id: string
  actionType: string
  blocked: boolean
  reason: string
  createdAt: string
}

export default function ProtectionPanel() {
  const [stats, setStats] = useState<ProtectionStats | null>(null)
  const [logs, setLogs] = useState<ProtectionLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/protection')
      .then((r) => r.json())
      .then((res) => {
        setStats(res.stats)
        setLogs(res.logs || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-[#1E293B]">Protection Mode</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Shield, label: 'Total Checked', value: stats?.total ?? 0, color: 'text-[#003ABC]' },
          { icon: ShieldX, label: 'Blocked', value: stats?.blocked ?? 0, color: 'text-red-600' },
          { icon: ShieldCheck, label: 'Allowed', value: stats?.allowed ?? 0, color: 'text-emerald-600' },
          { icon: Shield, label: 'Block Rate', value: stats?.total ? `${Math.round(((stats?.blocked ?? 0) / stats.total) * 100)}%` : '0%', color: 'text-amber-600' },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#64748B]" />
                <span className="text-xs text-[#64748B]">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1E293B]">Recent Protection Logs</h3>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-[#E2E8F0]">
          {logs.length === 0 ? (
            <p className="text-center text-[#64748B] text-sm py-12">No protection logs</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 flex items-start justify-between gap-3 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] py-0 ${log.blocked ? 'bg-red-600/10 text-red-600' : 'bg-emerald-600/10 text-emerald-600'}`}
                    >
                      {log.blocked ? 'BLOCKED' : 'ALLOWED'}
                    </Badge>
                    <span className="text-xs font-medium text-[#1E293B]">{log.actionType}</span>
                  </div>
                  <p className="text-xs text-[#64748B] truncate">{log.reason}</p>
                </div>
                <span className="text-[10px] text-[#64748B] flex-shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}