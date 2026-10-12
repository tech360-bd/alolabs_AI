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

export default function WorkflowsPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/workflows' })
  const form = useCreateForm({ endpoint: '/api/workflows' })
  const del = useDelete()

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search workflows..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-teal-600 hover:bg-teal-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />New Workflow</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Name</TableHead><TableHead>Trigger</TableHead><TableHead>Steps</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((w: any) => (
                <TableRow key={w.id || w._id}>
                  <TableCell className="text-xs text-muted-foreground">{(w.id || w._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{w.name || w.workflowName}</TableCell>
                  <TableCell><Badge variant="outline">{w.trigger || w.triggerType || '-'}</Badge></TableCell>
                  <TableCell className="text-xs">{w.stepCount ?? w.steps?.length ?? 0}</TableCell>
                  <TableCell><Badge variant={w.status === 'active' ? 'default' : 'secondary'} className={w.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}>{w.status || 'unknown'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(w)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/workflows', w.id || w._id, refresh)} disabled={del.deleting === (w.id || w._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
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
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Workflow' : 'Create Workflow'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="Workflow name" /></div>
            <div><Label>Trigger</Label><Input value={form.form.trigger || ''} onChange={(e) => form.setForm({ ...form.form, trigger: e.target.value })} placeholder="e.g. schedule, event, manual" /></div>
            <div><Label>Description</Label><Input value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Workflow description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-teal-600 hover:bg-teal-700 text-white">
              {form.loading ? 'Saving...' : form.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}