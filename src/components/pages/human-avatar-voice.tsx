'use client'

import { useState } from 'react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { UserCircle, Loader2 } from 'lucide-react'
import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'

export default function HumanAvatarVoicePage() {
  const [prompt, setPrompt] = useState('')
  const [voiceStyle, setVoiceStyle] = useState('natural')
  const [consent, setConsent] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [avatarResult, setAvatarResult] = useState<string | null>(null)
  const [voiceResult, setVoiceResult] = useState<string | null>(null)
  const { toast } = useToast()
  const avatars = useDataTable<any>({ endpoint: '/api/avatar-voice/avatars' })

  const handleGenerateAvatar = async () => {
    if (!prompt.trim() || !consent) return
    setGenerating(true)
    setAvatarResult(null)
    try {
      const res = await fetchApi<{ url?: string; image?: string }>('/api/avatar-voice/generate-avatar', {
        method: 'POST',
        body: JSON.stringify({ prompt, voiceStyle, consent: true }),
      })
      setAvatarResult(res.url || res.image || null)
      toast({ title: 'Avatar generated' })
      avatars.refresh()
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateVoice = async () => {
    if (!prompt.trim() || !consent) return
    setGenerating(true)
    setVoiceResult(null)
    try {
      const res = await fetchApi<{ url?: string; audio?: string }>('/api/avatar-voice/generate-voice', {
        method: 'POST',
        body: JSON.stringify({ text: prompt, voiceStyle, consent: true }),
      })
      setVoiceResult(res.url || res.audio || null)
      toast({ title: 'Voice generated' })
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4 text-teal-500" />Avatar & Voice Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Description / Script</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the avatar or enter voice script..." rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Voice Style</Label>
              <select value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="natural">Natural</option>
                <option value="warm">Warm</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={consent} onCheckedChange={setConsent} id="consent" />
              <Label htmlFor="consent" className="text-xs">I have consent to generate</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateAvatar} disabled={generating || !prompt.trim() || !consent} variant="outline" className="flex-1">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Generate Avatar
            </Button>
            <Button onClick={handleGenerateVoice} disabled={generating || !prompt.trim() || !consent} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Generate Voice
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {avatarResult && (
          <Card><CardContent className="pt-6"><img src={avatarResult} alt="Avatar" className="w-full rounded-lg" /></CardContent></Card>
        )}
        {voiceResult && (
          <Card><CardContent className="pt-6"><audio src={voiceResult} controls className="w-full" /></CardContent></Card>
        )}
      </div>

      <TableShell loading={avatars.loading} error={avatars.error} totalCount={avatars.total} page={avatars.page} pageSize={avatars.pageSize} onPageChange={avatars.setPage} onPageSizeChange={avatars.setPageSize} searchValue={avatars.search} onSearchChange={avatars.setSearch} searchPlaceholder="Search avatars...">
        <div className="rounded-lg border max-h-64 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Description</TableHead><TableHead>Voice Style</TableHead><TableHead>Consented</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {avatars.data.map((a: any) => (
                <TableRow key={a.id || a._id}>
                  <TableCell className="text-xs text-muted-foreground">{(a.id || a._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium text-xs max-w-[200px] truncate">{a.prompt || a.description || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{a.voiceStyle || '-'}</Badge></TableCell>
                  <TableCell>{a.consent ? <Badge className="bg-emerald-100 text-emerald-700">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}