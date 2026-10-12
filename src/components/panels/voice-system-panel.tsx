'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Mic,
  Volume2,
  Upload,
  Library,
  Play,
  Pause,
  Star,
  Globe,
  Clock,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Languages,
  AudioWaveform,
  FileAudio,
  Headphones,
  Sparkles,
  CircleDot,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Types ───────────────────────────────────────────────────────────────────

interface VoiceModel {
  id: string
  name: string
  provider: string
  status: 'active' | 'loading' | 'inactive'
  languages: string[]
  latencyMs: number
  qualityRating: number
  size?: string
  description: string
}

interface Voice {
  id: string
  name: string
  provider: string
  language: string
  gender: 'male' | 'female' | 'neutral'
  style: string
  previewUrl?: string
  quality: 'low' | 'medium' | 'high' | 'premium'
}

interface TtsHistoryItem {
  id: string
  text: string
  voice: string
  speed: number
  createdAt: string
  duration: string
}

interface SttResult {
  id: string
  text: string
  confidence: number
  language: string
  duration: string
  words?: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getQualityColor(rating: number) {
  if (rating >= 5) return 'text-green-600'
  if (rating >= 4) return 'text-[#003ABC]'
  if (rating >= 3) return 'text-amber-600'
  return 'text-red-500'
}

function getQualityLabel(rating: number) {
  if (rating >= 5) return 'Excellent'
  if (rating >= 4) return 'Good'
  if (rating >= 3) return 'Fair'
  return 'Low'
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
    case 'loading':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Loading</Badge>
    case 'inactive':
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Inactive</Badge>
    default:
      return null
  }
}

function getProviderColor(provider: string) {
  switch (provider) {
    case 'OpenAI': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Kokoro': return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'Piper': return 'bg-orange-50 text-orange-700 border-orange-200'
    default: return 'bg-slate-50 text-slate-500 border-slate-200'
  }
}

function getVoiceQualityColor(quality: string) {
  switch (quality) {
    case 'premium': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'high': return 'bg-green-50 text-green-700 border-green-200'
    case 'medium': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'low': return 'bg-slate-100 text-slate-500 border-slate-200'
    default: return 'bg-slate-100 text-slate-500 border-slate-200'
  }
}

function renderStars(rating: number) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
        />
      ))}
      <span className="text-xs text-[#64748B] ml-1.5">{getQualityLabel(rating)}</span>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export default function VoiceSystemPanel() {
  const [models, setModels] = useState<VoiceModel[]>([])
  const [voices, setVoices] = useState<Voice[]>([])
  const [ttsHistory, setTtsHistory] = useState<TtsHistoryItem[]>([])
  const [sttResults, setSttResults] = useState<SttResult[]>([])
  const [loading, setLoading] = useState(true)

  // TTS state
  const [ttsText, setTtsText] = useState('')
  const [ttsVoice, setTtsVoice] = useState('v1')
  const [ttsSpeed, setTtsSpeed] = useState('1.0')
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState<string | null>(null)

  // STT state
  const [sttLanguage, setSttLanguage] = useState('en')
  const [sttUploading, setSttUploading] = useState(false)
  const [sttTranscribing, setSttTranscribing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Voice library filter
  const [voiceFilter, setVoiceFilter] = useState('all')

  useEffect(() => {
    fetch('/api/voice-system')
      .then((r) => r.json())
      .then((data) => {
        if (data.models) setModels(data.models)
        if (data.voices) setVoices(data.voices)
        if (data.ttsHistory) setTtsHistory(data.ttsHistory)
        if (data.sttResults) setSttResults(data.sttResults)
      })
      .catch(() => {
        setModels([])
        setVoices([])
        setTtsHistory([])
        setSttResults([])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return
    setTtsGenerating(true)
    try {
      const res = await fetch('/api/voice-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', text: ttsText, voice: ttsVoice, speed: ttsSpeed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'TTS generation failed')
      }
      const data = await res.json()
      const newItem: TtsHistoryItem = {
        id: data.id || `h${Date.now()}`,
        text: ttsText,
        voice: data.voice || voices.find((v) => v.id === ttsVoice)?.name || 'Unknown',
        speed: parseFloat(ttsSpeed),
        createdAt: new Date().toISOString(),
        duration: data.duration || `${(ttsText.length * 0.08).toFixed(1)}s`,
      }
      setTtsHistory([newItem, ...ttsHistory])
      if (data.audioUrl) {
        setIsPlaying(newItem.id)
        setTimeout(() => setIsPlaying(null), 3000)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'TTS generation failed'
      toast.error('TTS Error', { description: message })
    } finally {
      setTtsGenerating(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
  }

  const handleUploadSTT = async () => {
    if (!selectedFile) {
      toast.error('No file selected', { description: 'Please select an audio file to transcribe.' })
      return
    }
    setSttUploading(true)
    setSttTranscribing(false)
    try {
      const formData = new FormData()
      formData.append('audio', selectedFile)
      formData.append('action', 'stt')
      formData.append('language', sttLanguage)
      const res = await fetch('/api/voice-system', {
        method: 'POST',
        body: formData,
      })
      setSttUploading(false)
      setSttTranscribing(true)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'STT transcription failed')
      }
      const data = await res.json()
      const newResult: SttResult = {
        id: data.id || `s${Date.now()}`,
        text: data.text || 'Transcription completed.',
        confidence: data.confidence ?? 0,
        language: data.language || sttLanguage,
        duration: data.duration || '0s',
        words: data.words,
      }
      setSttResults([newResult, ...sttResults])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'STT transcription failed'
      toast.error('STT Error', { description: message })
    } finally {
      setSttUploading(false)
      setSttTranscribing(false)
    }
  }

  const filteredVoices =
    voiceFilter === 'all'
      ? voices
      : voices.filter((v) => v.quality === voiceFilter)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <AudioWaveform className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Voice System</h2>
            <p className="text-sm text-[#64748B]">AI voice models, text-to-speech, and speech recognition</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
            <CircleDot className="w-3 h-3 mr-1" />
            {models.filter((m) => m.status === 'active').length} Active Models
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-[#003ABC] border-blue-200 text-xs">
            <Headphones className="w-3 h-3 mr-1" />
            {voices.length} Voices Available
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="models" className="w-full">
        <TabsList className="bg-white border border-[#E2E8F0] rounded-xl p-1 h-auto">
          <TabsTrigger value="models" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Sparkles className="w-4 h-4" />
            Models
          </TabsTrigger>
          <TabsTrigger value="tts" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Volume2 className="w-4 h-4" />
            Text-to-Speech
          </TabsTrigger>
          <TabsTrigger value="stt" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Mic className="w-4 h-4" />
            Speech-to-Text
          </TabsTrigger>
          <TabsTrigger value="library" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Library className="w-4 h-4" />
            Voice Library
          </TabsTrigger>
        </TabsList>

        {/* ─── Models Tab ─────────────────────────────────────────── */}
        <TabsContent value="models" className="mt-4 space-y-4">
          {/* Whisper Models */}
          <div>
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#003ABC]" />
              Whisper (Speech-to-Text)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {models
                .filter((m) => m.provider === 'OpenAI')
                .map((model) => (
                  <Card key={model.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <FileAudio className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <CardTitle className="text-sm text-[#1E293B]">{model.name}</CardTitle>
                            {model.size && (
                              <p className="text-xs text-[#64748B]">{model.size} parameters</p>
                            )}
                          </div>
                        </div>
                        {getStatusBadge(model.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-[#64748B]">{model.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {model.languages.slice(0, 5).map((lang) => (
                          <Badge key={lang} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                            {lang.toUpperCase()}
                          </Badge>
                        ))}
                        {model.languages.length > 5 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                            +{model.languages.length - 5}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0]">
                        <div className="flex items-center gap-1 text-xs text-[#64748B]">
                          <Clock className="w-3 h-3" />
                          {model.latencyMs}ms
                        </div>
                        {renderStars(model.qualityRating)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>

          {/* Kokoro Models */}
          <div>
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-violet-500" />
              Kokoro (Text-to-Speech)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {models
                .filter((m) => m.provider === 'Kokoro')
                .map((model) => (
                  <Card key={model.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-violet-600" />
                          </div>
                          <div>
                            <CardTitle className="text-sm text-[#1E293B]">{model.name}</CardTitle>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${getProviderColor(model.provider)}`}>
                              {model.provider}
                            </Badge>
                          </div>
                        </div>
                        {getStatusBadge(model.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-[#64748B]">{model.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {model.languages.map((lang) => (
                          <Badge key={lang} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                            {lang.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0]">
                        <div className="flex items-center gap-1 text-xs text-[#64748B]">
                          <Zap className="w-3 h-3" />
                          {model.latencyMs}ms latency
                        </div>
                        {renderStars(model.qualityRating)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>

          {/* Piper Models */}
          <div>
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
              <Play className="w-4 h-4 text-[#FF6A00]" />
              Piper (Text-to-Speech)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {models
                .filter((m) => m.provider === 'Piper')
                .map((model) => (
                  <Card key={model.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                            <Play className="w-4 h-4 text-[#FF6A00]" />
                          </div>
                          <div>
                            <CardTitle className="text-sm text-[#1E293B]">{model.name}</CardTitle>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${getProviderColor(model.provider)}`}>
                              {model.provider}
                            </Badge>
                          </div>
                        </div>
                        {getStatusBadge(model.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-[#64748B]">{model.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {model.languages.map((lang) => (
                          <Badge key={lang} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                            {lang.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0]">
                        <div className="flex items-center gap-1 text-xs text-[#64748B]">
                          <Zap className="w-3 h-3" />
                          {model.latencyMs}ms latency
                        </div>
                        {renderStars(model.qualityRating)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        </TabsContent>

        {/* ─── TTS Tab ────────────────────────────────────────────── */}
        <TabsContent value="tts" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Controls */}
            <Card className="border-[#E2E8F0]">
              <CardHeader>
                <CardTitle className="text-sm text-[#1E293B]">Generate Speech</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Enter text and configure voice settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-[#1E293B]">Text to Speak</Label>
                  <Textarea
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    placeholder="Enter the text you want to convert to speech..."
                    className="min-h-[120px] border-[#E2E8F0] bg-[#F8FAFC] text-sm resize-none"
                  />
                  <p className="text-xs text-[#64748B] text-right">{ttsText.length} characters</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-[#1E293B]">Voice</Label>
                    <Select value={ttsVoice} onValueChange={setTtsVoice}>
                      <SelectTrigger className="border-[#E2E8F0] bg-[#F8FAFC]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} ({v.gender})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-[#1E293B]">Speed</Label>
                    <Select value={ttsSpeed} onValueChange={setTtsSpeed}>
                      <SelectTrigger className="border-[#E2E8F0] bg-[#F8FAFC]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.5">0.5x (Slow)</SelectItem>
                        <SelectItem value="0.75">0.75x</SelectItem>
                        <SelectItem value="1.0">1.0x (Normal)</SelectItem>
                        <SelectItem value="1.25">1.25x</SelectItem>
                        <SelectItem value="1.5">1.5x (Fast)</SelectItem>
                        <SelectItem value="2.0">2.0x (Very Fast)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateTTS}
                  disabled={ttsGenerating || !ttsText.trim()}
                  className="w-full bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
                >
                  {ttsGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Generate Speech
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* History */}
            <Card className="border-[#E2E8F0]">
              <CardHeader>
                <CardTitle className="text-sm text-[#1E293B]">Generation History</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">{ttsHistory.length} recent generations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {ttsHistory.length === 0 ? (
                    <div className="text-center py-8 text-sm text-[#64748B]">
                      <Volume2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No speech generated yet
                    </div>
                  ) : (
                    ttsHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#003ABC]/30 transition-colors"
                      >
                        <p className="text-sm text-[#1E293B] line-clamp-2">{item.text}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                              {item.voice}
                            </Badge>
                            <span className="text-[10px] text-[#64748B]">{item.speed}x</span>
                            <span className="text-[10px] text-[#64748B]">{item.duration}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#003ABC] hover:bg-[#003ABC]/10"
                          >
                            {isPlaying === item.id ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── STT Tab ────────────────────────────────────────────── */}
        <TabsContent value="stt" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Upload & Settings */}
            <Card className="border-[#E2E8F0]">
              <CardHeader>
                <CardTitle className="text-sm text-[#1E293B]">Transcribe Audio</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">Upload audio files for speech-to-text conversion</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Language selector */}
                <div className="space-y-2">
                  <Label className="text-sm text-[#1E293B]">Source Language</Label>
                  <Select value={sttLanguage} onValueChange={setSttLanguage}>
                    <SelectTrigger className="border-[#E2E8F0] bg-[#F8FAFC]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {/* Upload Area */}
                <div
                  className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-8 text-center hover:border-[#003ABC]/50 hover:bg-[#003ABC]/5 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {sttUploading ? (
                    <div className="space-y-2">
                      <Loader2 className="w-8 h-8 mx-auto text-[#003ABC] animate-spin" />
                      <p className="text-sm text-[#1E293B] font-medium">Uploading audio...</p>
                    </div>
                  ) : sttTranscribing ? (
                    <div className="space-y-2">
                      <AudioWaveform className="w-8 h-8 mx-auto text-[#FF6A00] animate-pulse" />
                      <p className="text-sm text-[#1E293B] font-medium">Transcribing audio...</p>
                      <Progress value={65} className="h-1.5" />
                    </div>
                  ) : selectedFile ? (
                    <div className="space-y-2">
                      <FileAudio className="w-10 h-10 mx-auto text-[#003ABC]" />
                      <p className="text-sm text-[#1E293B] font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-[#94A3B8]">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB — Click to change</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                      <p className="text-sm text-[#1E293B] font-medium">Drop audio file here or click to browse</p>
                      <p className="text-xs text-[#64748B] mt-1">Supports MP3, WAV, M4A, OGG, FLAC (max 100MB)</p>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleUploadSTT}
                  disabled={sttUploading || sttTranscribing}
                  className="w-full bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
                >
                  {sttTranscribing ? (
                    <>
                      <AudioWaveform className="w-4 h-4 mr-2 animate-pulse" />
                      Transcribing...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
                      Upload & Transcribe
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <Card className="border-[#E2E8F0]">
              <CardHeader>
                <CardTitle className="text-sm text-[#1E293B]">Transcription Results</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">{sttResults.length} transcriptions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {sttResults.length === 0 ? (
                    <div className="text-center py-8 text-sm text-[#64748B]">
                      <Mic className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No transcriptions yet
                    </div>
                  ) : (
                    sttResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3"
                      >
                        <p className="text-sm text-[#1E293B] leading-relaxed">{result.text}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                              {result.language}
                            </Badge>
                            <span className="text-[10px] text-[#64748B]">{result.duration}</span>
                            {result.words && (
                              <span className="text-[10px] text-[#64748B]">{result.words} words</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-[#1E293B]">
                              {(result.confidence * 100).toFixed(1)}%
                            </span>
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  result.confidence >= 0.95
                                    ? 'bg-green-500'
                                    : result.confidence >= 0.85
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                }`}
                                style={{ width: `${result.confidence * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Voice Library Tab ──────────────────────────────────── */}
        <TabsContent value="library" className="mt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#64748B]" />
              <span className="text-sm text-[#64748B]">Filter by quality:</span>
            </div>
            <div className="flex gap-1.5">
              {['all', 'premium', 'high', 'medium'].map((f) => (
                <Button
                  key={f}
                  variant={voiceFilter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVoiceFilter(f)}
                  className={
                    voiceFilter === f
                      ? 'bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-xs h-8'
                      : 'text-xs h-8 border-[#E2E8F0] text-[#64748B]'
                  }
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && (
                    <span className="ml-1.5 text-[10px]">
                      ({voices.filter((v) => v.quality === f).length})
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Voice Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredVoices.map((voice) => (
              <Card key={voice.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                          voice.gender === 'female'
                            ? 'bg-pink-50 text-pink-600'
                            : voice.gender === 'male'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {voice.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-sm text-[#1E293B]">{voice.name}</CardTitle>
                        <p className="text-[10px] text-[#64748B]">{voice.provider}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getVoiceQualityColor(voice.quality)}`}>
                      {voice.quality}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                      <Globe className="w-2.5 h-2.5 mr-1" />
                      {voice.language}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        voice.gender === 'female'
                          ? 'bg-pink-50 text-pink-600 border-pink-200'
                          : voice.gender === 'male'
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {voice.gender}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#64748B]">{voice.style}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 border-[#E2E8F0] text-[#003ABC] hover:bg-[#003ABC]/10 group-hover:border-[#003ABC]/30"
                  >
                    <Play className="w-3 h-3 mr-1.5" />
                    Preview Voice
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}