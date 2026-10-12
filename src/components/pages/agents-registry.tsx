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
import { Plus, Trash2, Pencil } from 'lucide-react'

export default function AgentsRegistryPage() {
  const { data, total, loading, error, page, pageSize, search, filters, setPage, setPageSize, setSearch, setFilter, refresh } = useDataTable<any>({ endpoint: '/api/agents' })
  const form = useCreateForm({ endpoint: '/api/agents' })
  const del = useDelete()

  const deptFilter = (
    <select
      value={filters.department || ''}
      onChange={(e) => setFilter('department', e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">All Departments</option>
      <option value="engineering">Engineering</option>
      <option value="marketing">Marketing</option>
      <option value="operations">Operations</option>
      <option value="finance">Finance</option>
      <option value="support">Support</option>
    </select>
  )

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search agents..."
        headerRight={<div className="flex gap-2 ml-auto">{deptFilter}<Button size="sm" onClick={form.openCreate} className="bg-amber-600 hover:bg-amber-700 text-white"><Plus className="h-4 w-4 mr-1" />New Agent</Button></div>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Status</TableHead><TableHead>Model</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((a: any) => (
                <TableRow key={a.id || a._id}>
                  <TableCell className="text-xs text-muted-foreground">{(a.id || a._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{a.name || a.agentName}</TableCell>
                  <TableCell>{a.department || '-'}</TableCell>
                  <TableCell><Badge variant={a.status === 'active' ? 'default' : 'secondary'} className={a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}>{a.status || 'unknown'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.model || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/agents', a.id || a._id, refresh)} disabled={del.deleting === (a.id || a._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
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
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Agent' : 'Create Agent'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="Agent name" /></div>
            <div><Label>Department</Label><Input value={form.form.department || ''} onChange={(e) => form.setForm({ ...form.form, department: e.target.value })} placeholder="e.g. engineering" /></div>
            <div><Label>Model</Label><Input value={form.form.model || ''} onChange={(e) => form.setForm({ ...form.form, model: e.target.value })} placeholder="e.g. gpt-4" /></div>
            <div><Label>Description</Label><Input value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Agent description" /></div>
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