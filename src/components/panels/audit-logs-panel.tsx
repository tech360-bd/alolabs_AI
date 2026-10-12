'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface AuditLog {
  id: string
  action: string
  resource: string
  details: string
  createdAt: string
  user?: { name: string; email: string }
}

export default function AuditLogsPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 20

  useEffect(() => {
    let cancelled = false
     
    setLoading(true)
    fetch(`/api/audit-logs?page=${page}&limit=${limit}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          setLogs(res.logs || [])
          setTotal(res.pagination?.total || 0)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page])

  const totalPages = Math.ceil(total / limit)

  const actionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-emerald-600/10 text-emerald-600'
      case 'update': return 'bg-[#FF6A00]/10 text-[#FF6A00]'
      case 'delete': return 'bg-red-600/10 text-red-600'
      default: return 'bg-[#003ABC]/10 text-[#003ABC]'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1E293B]">Audit Logs</h2>
        <span className="text-sm text-[#64748B]">{total} entries</span>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Timestamp</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">User</TableHead>
                  <TableHead className="text-[#64748B]">Action</TableHead>
                  <TableHead className="text-[#64748B]">Resource</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[#64748B] py-12">No audit logs</TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="text-[#64748B] text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[#1E293B] hidden md:table-cell">{log.user?.name || 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] py-0 ${actionColor(log.action)}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#1E293B]">{log.resource}</TableCell>
                      <TableCell className="text-[#64748B] text-xs max-w-xs truncate hidden lg:table-cell">
                        {log.details}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#64748B]">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}