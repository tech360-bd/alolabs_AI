'use client'

import { useCreateForm } from '@/hooks/use-api-actions'
import { useDataTable } from '@/hooks/use-data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Copy, Trash2 } from 'lucide-react'
import { useDelete } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'

export default function WebCloneScraperPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/web-clone/jobs' })
  const form = useCreateForm({ endpoint: '/api/web-clone/scrape' })
  const del = useDelete()

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search jobs..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-amber-600 hover:bg-amber-700 text-white ml-auto"><Copy className="h-4 w-4 mr-1" />New Scrape</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>URL</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Pages</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((j: any) => (
                <TableRow key={j.id || j._id}>
                  <TableCell className="text-xs text-muted-foreground">{(j.id || j._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium text-xs max-w-[200px] truncate">{j.url || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{j.type || 'clone'}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}
                      className={j.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : j.status === 'scraping' ? 'bg-amber-100 text-amber-700' : ''}>
                      {j.status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{j.pagesScraped ?? j.pages ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.createdAt ? new Date(j.createdAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/web-clone/jobs', j.id || j._id, refresh)} disabled={del.deleting === (j.id || j._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Web Clone / Scrape Job</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Target URL</Label><Input value={form.form.url || ''} onChange={(e) => form.setForm({ ...form.form, url: e.target.value })} placeholder="https://example.com" /></div>
            <div><Label>Type</Label>
              <select value={form.form.type || 'clone'} onChange={(e) => form.setForm({ ...form.form, type: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="clone">Full Clone</option>
                <option value="scrape">Scrape Data</option>
                <option value="screenshot">Screenshot</option>
              </select>
            </div>
            <div><Label>Max Pages</Label><Input type="number" value={form.form.maxPages || '10'} onChange={(e) => form.setForm({ ...form.form, maxPages: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.form.notes || ''} onChange={(e) => form.setForm({ ...form.form, notes: e.target.value })} placeholder="Any notes" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {form.loading ? 'Starting...' : 'Start Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}