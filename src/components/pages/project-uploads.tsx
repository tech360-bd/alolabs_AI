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
import { Plus, Trash2, FileUp } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useState } from 'react'

export default function ProjectUploadsPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/uploads' })
  const del = useDelete()
  const { toast } = useToast()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', description: '' })
  const [file, setFile] = useState<File | null>(null)

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', uploadForm.name || file.name)
      fd.append('description', uploadForm.description)
      const token = (await import('@/store/app')).useAppStore.getState().token
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!res.ok) throw new Error('Upload failed')
      toast({ title: 'File uploaded' })
      setUploadOpen(false)
      setFile(null)
      setUploadForm({ name: '', description: '' })
      refresh()
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const formatSize = (b: number) => {
    if (!b) return '-'
    if (b < 1024) return `${b}B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
    return `${(b / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search uploads..."
        headerRight={<Button size="sm" onClick={() => setUploadOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white ml-auto"><FileUp className="h-4 w-4 mr-1" />Upload File</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>File Name</TableHead><TableHead>Size</TableHead><TableHead>Type</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((u: any) => (
                <TableRow key={u.id || u._id}>
                  <TableCell className="text-xs text-muted-foreground">{(u.id || u._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{u.name || u.filename || u.originalName || '-'}</TableCell>
                  <TableCell className="text-xs">{formatSize(u.size)}</TableCell>
                  <TableCell><Badge variant="outline">{u.mimetype || u.type || '-'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/uploads', u.id || u._id, refresh)} disabled={del.deleting === (u.id || u._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Project File</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>File</Label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" />
            </div>
            <div><Label>Name (optional)</Label><Input value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} placeholder="Override file name" /></div>
            <div><Label>Description</Label><Textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="File description" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !file} className="bg-teal-600 hover:bg-teal-700 text-white">
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}