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

const statusVariant = (s: string) => {
  if (s === 'completed') return 'default'
  if (s === 'failed' || s === 'cancelled') return 'destructive'
  return 'secondary'
}
const statusClass = (s: string) => {
  if (s === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (s === 'in_progress' || s === 'running') return 'bg-amber-100 text-amber-700'
  if (s === 'failed' || s === 'cancelled') return 'bg-rose-100 text-rose-700'
  return ''
}
const priorityClass = (p: string) => {
  if (p === 'high' || p === 'critical') return 'bg-rose-100 text-rose-700'
  if (p === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

export default function TasksPage() {
  const { data, total, loading, error, page, pageSize, search, filters, setPage, setPageSize, setSearch, setFilter, refresh } = useDataTable<any>({ endpoint: '/api/tasks' })
  const form = useCreateForm({ endpoint: '/api/tasks' })
  const del = useDelete()

  const filtersEl = (
    <div className="flex gap-2 ml-auto">
      <select value={filters.priority || ''} onChange={(e) => setFilter('priority', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">All Priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
      <Button size="sm" onClick={form.openCreate} className="bg-orange-600 hover:bg-orange-700 text-white"><Plus className="h-4 w-4 mr-1" />New Task</Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <TableShell loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search tasks..." headerRight={filtersEl}>
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Title</TableHead><TableHead>Agent</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.id || t._id}>
                  <TableCell className="text-xs text-muted-foreground">{(t.id || t._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{t.title || t.name}</TableCell>
                  <TableCell className="text-sm">{t.agentId || t.agent || '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={priorityClass(t.priority)}>{t.priority || '-'}</Badge></TableCell>
                  <TableCell><Badge variant={statusVariant(t.status)} className={statusClass(t.status)}>{t.status || 'unknown'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/tasks', t.id || t._id, refresh)} disabled={del.deleting === (t.id || t._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
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
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Task' : 'Create Task'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title</Label><Input value={form.form.title || ''} onChange={(e) => form.setForm({ ...form.form, title: e.target.value })} placeholder="Task title" /></div>
            <div><Label>Agent ID</Label><Input value={form.form.agentId || ''} onChange={(e) => form.setForm({ ...form.form, agentId: e.target.value })} placeholder="Assign to agent" /></div>
            <div><Label>Priority</Label>
              <select value={form.form.priority || ''} onChange={(e) => form.setForm({ ...form.form, priority: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div><Label>Description</Label><Input value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Task description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-orange-600 hover:bg-orange-700 text-white">
              {form.loading ? 'Saving...' : form.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}