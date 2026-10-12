'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useDelete } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trash2, Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'

export default function OutputsPage() {
  const { data, total, loading, error, page, pageSize, search, filters, setPage, setPageSize, setSearch, setFilter, refresh } = useDataTable<any>({ endpoint: '/api/outputs' })
  const del = useDelete()
  const [viewItem, setViewItem] = useState<any>(null)

  const filterEl = (
    <select value={filters.type || ''} onChange={(e) => setFilter('type', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm ml-auto">
      <option value="">All Types</option>
      <option value="text">Text</option>
      <option value="json">JSON</option>
      <option value="file">File</option>
      <option value="image">Image</option>
    </select>
  )

  return (
    <div className="space-y-4">
      <TableShell loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search outputs..." headerRight={filterEl}>
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Content Preview</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((o: any) => (
                <TableRow key={o.id || o._id}>
                  <TableCell className="text-xs text-muted-foreground">{(o.id || o._id || '').slice(0, 8)}</TableCell>
                  <TableCell><Badge variant="outline">{o.type || o.outputType || '-'}</Badge></TableCell>
                  <TableCell className="text-sm">{o.source || o.agentId || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[250px] truncate">{o.content || o.text || o.data || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewItem(o)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/outputs', o.id || o._id, refresh)} disabled={del.deleting === (o.id || o._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Output Detail</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-2 text-sm">
              <p><strong>Type:</strong> {viewItem.type || '-'}</p>
              <p><strong>Source:</strong> {viewItem.source || '-'}</p>
              <pre className="bg-slate-50 rounded-md p-3 text-xs max-h-64 overflow-auto whitespace-pre-wrap">{typeof viewItem.content === 'string' ? viewItem.content : JSON.stringify(viewItem.content || viewItem.data, null, 2)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}