'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Ban, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface PaymentStats {
  total: number
  blocked: number
  allowed: number
  blockRate: string
  replacementsFound?: number
}

interface PaymentLog {
  id: string
  apiName: string
  blocked: boolean
  replacementUsed: boolean
  replacementName: string | null
  reason: string
  createdAt: string
}

export default function PaymentGuardPanel() {
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [logs, setLogs] = useState<PaymentLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/payment-guard')
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
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-[#1E293B]">Payment Guard</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { icon: CreditCard, label: 'Total Blocked', value: stats?.blocked ?? 0, color: 'text-red-600' },
          { icon: RefreshCw, label: 'Replacements Found', value: stats?.replacementsFound ?? 0, color: 'text-emerald-600' },
          { icon: Ban, label: 'Block Rate', value: stats?.total ? `${Math.round(((stats?.blocked ?? 0) / stats.total) * 100)}%` : '0%', color: 'text-amber-600' },
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
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
              <TableHead className="text-[#64748B]">API Name</TableHead>
              <TableHead className="text-[#64748B]">Blocked</TableHead>
              <TableHead className="text-[#64748B] hidden sm:table-cell">Replacement Used</TableHead>
              <TableHead className="text-[#64748B] hidden md:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-[#64748B] py-12">No payment guard logs</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-[#E2E8F0] hover:bg-gray-50">
                  <TableCell className="text-[#1E293B] font-medium">{log.apiName}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] py-0 ${log.blocked ? 'bg-red-600/10 text-red-600' : 'bg-emerald-600/10 text-emerald-600'}`}
                    >
                      {log.blocked ? 'Blocked' : 'Allowed'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">{log.replacementName || '—'}</TableCell>
                  <TableCell className="text-[#64748B] text-xs hidden md:table-cell">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}