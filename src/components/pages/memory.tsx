'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useCreateForm, useDelete } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Pencil } from 'lucide-react'

export default function MemoryPage() {
  const { data, total, loading, error, page, pageSize, search, filters, setPage, setPageSize, setSearch, setFilter, refresh } = useDataTable<any>({ endpoint: '/api/memory' })
  const form = useCreateForm({ endpoint: '/api/memory' })
  const del = useDelete()

  const filterEl = (
    <div className="flex gap-2 ml-auto">
      <select value={filters.temperature || ''} onChange={(e) => setFilter('temperature', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">All Temperatures</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </select>
      <Button size="sm" onClick={form.openCreate} className="bg-amber-600 hover:bg-amber-700 text-white"><Plus className="h-4 w-4 mr-1" />New Memory</Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <TableShell loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search memory..." headerRight={filterEl}>
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Key</TableHead><TableHead>Temperature</TableHead><TableHead>Content</TableHead><TableHead>Accessed</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((m: any) => (
                <TableRow key={m.id || m._id}>
                  <TableCell className="text-xs text-muted-foreground">{(m.id || m._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{m.key || m.title || '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={m.temperature === 'hot' ? 'bg-rose-100 text-rose-700' : m.temperature === 'warm' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}>{m.temperature || 'warm'}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{m.content || m.value || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.accessedAt || m.updatedAt ? new Date(m.accessedAt || m.updatedAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/memory', m.id || m._id, refresh)} disabled={del.deleting === (m.id || m._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Memory' : 'Create Memory'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Key</Label><Input value={form.form.key || ''} onChange={(e) => form.setForm({ ...form.form, key: e.target.value })} placeholder="Memory key" /></div>
            <div><Label>Temperature</Label>
              <select value={form.form.temperature || 'warm'} onChange={(e) => form.setForm({ ...form.form, temperature: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
            </div>
            <div><Label>Content</Label><Textarea value={form.form.content || ''} onChange={(e) => form.setForm({ ...form.form, content: e.target.value })} placeholder="Memory content" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {form.loading ? 'Saving...' : form.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}