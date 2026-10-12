'use client'

import { useState } from 'react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Video, Loader2 } from 'lucide-react'
import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function VideoStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState('30')
  const [style, setStyle] = useState('cinematic')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const { toast } = useToast()
  const videos = useDataTable<any>({ endpoint: '/api/video-studio/productions' })

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setResult(null)
    try {
      const res = await fetchApi<{ url?: string; video?: string; data?: string }>('/api/video-studio/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, duration, style }),
      })
      setResult(res.url || res.video || res.data || null)
      toast({ title: 'Video generation started' })
      videos.refresh()
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Video className="h-4 w-4 text-rose-500" />Video Production</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Prompt</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the video you want to create..." rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Duration (seconds)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
            <div><Label>Style</Label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="cinematic">Cinematic</option>
                <option value="animated">Animated</option>
                <option value="documentary">Documentary</option>
                <option value="presentation">Presentation</option>
              </select>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="bg-rose-600 hover:bg-rose-700 text-white w-full">
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : 'Generate Video'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <video src={result} controls className="w-full rounded-lg" />
          </CardContent>
        </Card>
      )}

      <TableShell loading={videos.loading} error={videos.error} totalCount={videos.total} page={videos.page} pageSize={videos.pageSize} onPageChange={videos.setPage} onPageSizeChange={videos.setPageSize} searchValue={videos.search} onSearchChange={videos.setSearch} searchPlaceholder="Search productions...">
        <div className="rounded-lg border max-h-64 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Prompt</TableHead><TableHead>Style</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {videos.data.map((v: any) => (
                <TableRow key={v.id || v._id}>
                  <TableCell className="text-xs text-muted-foreground">{(v.id || v._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="text-xs max-w-[250px] truncate">{v.prompt || v.title || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{v.style || '-'}</Badge></TableCell>
                  <TableCell><Badge variant={v.status === 'completed' ? 'default' : 'secondary'} className={v.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : v.status === 'processing' ? 'bg-amber-100 text-amber-700' : ''}>{v.status || 'pending'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}