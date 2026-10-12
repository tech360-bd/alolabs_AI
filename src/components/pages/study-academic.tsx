'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useCreateForm } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, GraduationCap, BookOpen, FileText } from 'lucide-react'

export default function StudyAcademicPage() {
  const materials = useDataTable<any>({ endpoint: '/api/study/materials' })
  const courses = useDataTable<any>({ endpoint: '/api/study/courses' })
  const notes = useDataTable<any>({ endpoint: '/api/study/notes' })
  const form = useCreateForm({ endpoint: '/api/study/materials' })

  return (
    <div className="space-y-4">
      <Tabs defaultValue="materials">
        <TabsList>
          <TabsTrigger value="materials"><BookOpen className="h-3.5 w-3.5 mr-1" />Materials</TabsTrigger>
          <TabsTrigger value="courses"><GraduationCap className="h-3.5 w-3.5 mr-1" />Courses</TabsTrigger>
          <TabsTrigger value="notes"><FileText className="h-3.5 w-3.5 mr-1" />Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-4">
          <TableShell loading={materials.loading} error={materials.error} totalCount={materials.total} page={materials.page} pageSize={materials.pageSize} onPageChange={materials.setPage} onPageSizeChange={materials.setPageSize} searchValue={materials.search} onSearchChange={materials.setSearch} searchPlaceholder="Search materials..." headerRight={<Button size="sm" onClick={form.openCreate} className="bg-amber-600 hover:bg-amber-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />Add Material</Button>}>
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Type</TableHead><TableHead>Added</TableHead></TableRow></TableHeader>
                <TableBody>
                  {materials.data.map((m: any) => (
                    <TableRow key={m.id || m._id}>
                      <TableCell className="text-xs text-muted-foreground">{(m.id || m._id || '').slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{m.title || m.name || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{m.subject || '-'}</Badge></TableCell>
                      <TableCell className="text-xs">{m.type || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </TabsContent>

        <TabsContent value="courses" className="mt-4">
          <TableShell loading={courses.loading} error={courses.error} totalCount={courses.total} page={courses.page} pageSize={courses.pageSize} onPageChange={courses.setPage} onPageSizeChange={courses.setPageSize} searchValue={courses.search} onSearchChange={courses.setSearch} searchPlaceholder="Search courses...">
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Course Name</TableHead><TableHead>Instructor</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {courses.data.map((c: any) => (
                    <TableRow key={c.id || c._id}>
                      <TableCell className="text-xs text-muted-foreground">{(c.id || c._id || '').slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{c.name || c.title || '-'}</TableCell>
                      <TableCell className="text-sm">{c.instructor || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${c.progress || 0}%` }} /></div>
                          <span className="text-xs">{c.progress || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={c.status === 'completed' ? 'default' : 'secondary'} className={c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : c.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : ''}>{c.status || 'not_started'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <TableShell loading={notes.loading} error={notes.error} totalCount={notes.total} page={notes.page} pageSize={notes.pageSize} onPageChange={notes.setPage} onPageSizeChange={notes.setPageSize} searchValue={notes.search} onSearchChange={notes.setSearch} searchPlaceholder="Search notes...">
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Preview</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>
                  {notes.data.map((n: any) => (
                    <TableRow key={n.id || n._id}>
                      <TableCell className="text-xs text-muted-foreground">{(n.id || n._id || '').slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{n.title || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{n.subject || '-'}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{n.content || n.text || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{n.updatedAt || n.createdAt ? new Date(n.updatedAt || n.createdAt).toLocaleDateString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </TabsContent>
      </Tabs>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Study Material</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title</Label><Input value={form.form.title || ''} onChange={(e) => form.setForm({ ...form.form, title: e.target.value })} placeholder="Material title" /></div>
            <div><Label>Subject</Label><Input value={form.form.subject || ''} onChange={(e) => form.setForm({ ...form.form, subject: e.target.value })} placeholder="e.g. Mathematics" /></div>
            <div><Label>Type</Label><Input value={form.form.type || ''} onChange={(e) => form.setForm({ ...form.form, type: e.target.value })} placeholder="e.g. PDF, Video, Article" /></div>
            <div><Label>URL / Content</Label><Textarea value={form.form.url || form.form.content || ''} onChange={(e) => form.setForm({ ...form.form, url: e.target.value, content: e.target.value })} placeholder="URL or content" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(materials.refresh)} disabled={form.loading} className="bg-amber-600 hover:bg-amber-700 text-white">{form.loading ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}