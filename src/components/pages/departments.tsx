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

export default function DepartmentsPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/departments' })
  const form = useCreateForm({ endpoint: '/api/departments' })
  const del = useDelete()

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search departments..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-rose-600 hover:bg-rose-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />New Department</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Name</TableHead><TableHead>Head</TableHead><TableHead>Agent Count</TableHead><TableHead>Budget</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((d: any) => (
                <TableRow key={d.id || d._id}>
                  <TableCell className="text-xs text-muted-foreground">{(d.id || d._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{d.name || d.departmentName}</TableCell>
                  <TableCell>{d.head || d.leader || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{d.agentCount ?? d.agent_count ?? 0}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.budget ? `$${d.budget}` : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/departments', d.id || d._id, refresh)} disabled={del.deleting === (d.id || d._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
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
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Department' : 'Create Department'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="Department name" /></div>
            <div><Label>Head / Leader</Label><Input value={form.form.head || ''} onChange={(e) => form.setForm({ ...form.form, head: e.target.value })} placeholder="Department head" /></div>
            <div><Label>Budget</Label><Input type="number" value={form.form.budget || ''} onChange={(e) => form.setForm({ ...form.form, budget: e.target.value })} placeholder="100000" /></div>
            <div><Label>Description</Label><Input value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Department description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-rose-600 hover:bg-rose-700 text-white">
              {form.loading ? 'Saving...' : form.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}