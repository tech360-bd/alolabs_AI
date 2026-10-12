'use client'

import { useState } from 'react'
import { fetchApi, fetchApiRaw } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Image as ImageIcon, Loader2 } from 'lucide-react'

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('realistic')
  const [size, setSize] = useState('1024x1024')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const { toast } = useToast()

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setResult(null)
    try {
      const res = await fetchApi<{ url?: string; image?: string; data?: string }>('/api/image-studio/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, style, size }),
      })
      setResult(res.url || res.image || res.data || null)
      if (!res.url && !res.image && !res.data) {
        toast({ title: 'Generated', description: 'No image URL returned' })
      }
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4 text-amber-500" />Image Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Prompt</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image you want to generate..." rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Style</Label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="realistic">Realistic</option>
                <option value="artistic">Artistic</option>
                <option value="anime">Anime</option>
                <option value="3d">3D Render</option>
              </select>
            </div>
            <div><Label>Size</Label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="1024x1024">1024 x 1024</option>
                <option value="1024x768">1024 x 768</option>
                <option value="768x1024">768 x 1024</option>
                <option value="512x512">512 x 512</option>
              </select>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="bg-amber-600 hover:bg-amber-700 text-white w-full">
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : 'Generate Image'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <img src={result} alt="Generated" className="w-full rounded-lg" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}