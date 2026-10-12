'use client'

import { useState } from 'react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Music, Loader2 } from 'lucide-react'
import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [genre, setGenre] = useState('pop')
  const [mood, setMood] = useState('upbeat')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const { toast } = useToast()
  const tracks = useDataTable<any>({ endpoint: '/api/music-studio/tracks' })

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setResult(null)
    try {
      const res = await fetchApi<{ url?: string; audio?: string; data?: string }>('/api/music-studio/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, genre, mood }),
      })
      setResult(res.url || res.audio || res.data || null)
      toast({ title: 'Track generation started' })
      tracks.refresh()
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
          <CardTitle className="text-base flex items-center gap-2"><Music className="h-4 w-4 text-orange-500" />Music Creation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Description</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the music you want to create..." rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Genre</Label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="pop">Pop</option>
                <option value="rock">Rock</option>
                <option value="jazz">Jazz</option>
                <option value="electronic">Electronic</option>
                <option value="classical">Classical</option>
                <option value="hiphop">Hip Hop</option>
              </select>
            </div>
            <div><Label>Mood</Label>
              <select value={mood} onChange={(e) => setMood(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="upbeat">Upbeat</option>
                <option value="chill">Chill</option>
                <option value="dramatic">Dramatic</option>
                <option value="sad">Sad</option>
                <option value="energetic">Energetic</option>
              </select>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="bg-orange-600 hover:bg-orange-700 text-white w-full">
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create Music'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <audio src={result} controls className="w-full" />
          </CardContent>
        </Card>
      )}

      <TableShell loading={tracks.loading} error={tracks.error} totalCount={tracks.total} page={tracks.page} pageSize={tracks.pageSize} onPageChange={tracks.setPage} onPageSizeChange={tracks.setPageSize} searchValue={tracks.search} onSearchChange={tracks.setSearch} searchPlaceholder="Search tracks...">
        <div className="rounded-lg border max-h-64 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Title</TableHead><TableHead>Genre</TableHead><TableHead>Mood</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {tracks.data.map((t: any) => (
                <TableRow key={t.id || t._id}>
                  <TableCell className="text-xs text-muted-foreground">{(t.id || t._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{t.title || t.name || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{t.genre || '-'}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{t.mood || '-'}</Badge></TableCell>
                  <TableCell><Badge variant={t.status === 'completed' ? 'default' : 'secondary'} className={t.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : ''}>{t.status || 'pending'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}