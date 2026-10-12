'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useApproveAction } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Check, X, Loader2 } from 'lucide-react'

export default function ApprovalQueuePage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/approvals', defaultParams: { status: 'pending' } })
  const { acting, act } = useApproveAction()

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    act('/api/approvals', id, action, refresh)
  }

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search approvals..."
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Type</TableHead><TableHead>Requester</TableHead><TableHead>Description</TableHead><TableHead>Risk</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((a: any) => {
                const id = a.id || a._id
                const isActing = acting === id
                const riskClass = a.riskLevel === 'high' ? 'bg-rose-100 text-rose-700' : a.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                return (
                  <TableRow key={id}>
                    <TableCell className="text-xs text-muted-foreground">{(id || '').slice(0, 8)}</TableCell>
                    <TableCell className="font-medium">{a.type || a.actionType || 'Action'}</TableCell>
                    <TableCell className="text-sm">{a.requester || a.agentId || '-'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{a.description || a.reason || '-'}</TableCell>
                    <TableCell><Badge variant="outline" className={riskClass}>{a.riskLevel || 'low'}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleAction(id, 'approve')} disabled={isActing} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                          {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleAction(id, 'reject')} disabled={isActing} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}