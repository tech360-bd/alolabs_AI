'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Video,
  User,
  Play,
  Clock,
  Globe,
  Sparkles,
  Upload,
  Mic,
  Languages,
  Film,
  ImagePlus,
  Subtitles,
  Volume2,
  CheckCircle2,
  Circle,
  Loader2,
  FileVideo,
  BarChart3,
  Pause,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ───────────────────────────────────────────────────────────────────

interface AIPresenter {
  id: string
  name: string
  style: string
  language: string
  generationCount: number
  avatarUrl: string | null
}

interface AvatarStyle {
  id: string
  name: string
  category: 'professional' | 'casual' | 'animated'
  thumbnail: string | null
  gender: string
  ethnicity: string
}

interface VideoProject {
  id: string
  title: string
  status: 'draft' | 'rendering' | 'complete'
  duration: string
  resolution: string
  progress: number
  createdAt: string
}

interface Subtitle {
  id: string
  startTime: string
  endTime: string
  text: string
  language: string
}

interface VoiceProfile {
  id: string
  name: string
  engine: string
  language: string
  syncedVideos: number
  status: 'ready' | 'syncing' | 'error'
}

interface VideoHubData {
  presenters: AIPresenter[]
  avatarStyles: AvatarStyle[]
  projects: VideoProject[]
  subtitles: Subtitle[]
  voiceProfiles: VoiceProfile[]
}

const DURATION_OPTIONS = [
  { label: '5 min', value: '5' },
  { label: '15 min', value: '15' },
  { label: '30 min', value: '30' },
  { label: '60 min', value: '60' },
  { label: 'Multi-hour Course', value: 'course' },
]

const STYLE_COLORS: Record<string, string> = {
  professional: 'bg-blue-100 text-blue-800',
  casual: 'bg-green-100 text-green-800',
  animated: 'bg-purple-100 text-purple-800',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function VideoHubPanel() {
  const [data, setData] = useState<VideoHubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDuration, setSelectedDuration] = useState('15')
  const [selectedLanguage, setSelectedLanguage] = useState('english')
  const [subtitleLang, setSubtitleLang] = useState('english')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/video-hub')
      const json = await res.json()
      if (json.data) {
        setData(json.data)
      } else {
        setData(null)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">AI Video Hub</h2>
          <p className="text-sm text-slate-500 mt-1">Create, manage, and enhance AI-generated videos</p>
        </div>
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <Film className="size-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No video data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">AI Video Hub</h2>
          <p className="text-sm text-slate-500 mt-1">Create, manage, and enhance AI-generated videos</p>
        </div>
        <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white gap-2">
          <Film className="size-4" />
          New Project
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="presenter" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 h-auto flex-wrap">
          <TabsTrigger value="presenter" className="gap-1.5 text-sm">
            <User className="size-3.5" /> AI Presenter
          </TabsTrigger>
          <TabsTrigger value="avatar" className="gap-1.5 text-sm">
            <ImagePlus className="size-3.5" /> Avatar Generator
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5 text-sm">
            <FileVideo className="size-3.5" /> Video Projects
          </TabsTrigger>
          <TabsTrigger value="subtitle" className="gap-1.5 text-sm">
            <Subtitles className="size-3.5" /> Subtitles
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-1.5 text-sm">
            <Volume2 className="size-3.5" /> Voice Sync
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: AI Presenter ────────────────────────────────────────── */}
        <TabsContent value="presenter">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-[#1E293B] text-lg">AI Presenters</CardTitle>
                  <CardDescription>Select a presenter and generate videos with custom duration</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                    <SelectTrigger className="w-40 h-9 text-sm">
                      <Clock className="size-3.5 mr-1.5" />
                      <SelectValue placeholder="Duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger className="w-36 h-9 text-sm">
                      <Globe className="size-3.5 mr-1.5" />
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="spanish">Spanish</SelectItem>
                      <SelectItem value="french">French</SelectItem>
                      <SelectItem value="japanese">Japanese</SelectItem>
                      <SelectItem value="hindi">Hindi</SelectItem>
                      <SelectItem value="arabic">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.presenters.map((presenter) => (
                  <Card key={presenter.id} className="rounded-xl border-slate-100 hover:border-[#003ABC]/30 hover:shadow-md transition-all group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="size-12 rounded-full bg-gradient-to-br from-[#003ABC] to-[#0066FF] flex items-center justify-center text-white font-semibold text-lg shrink-0">
                          {presenter.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[#1E293B] text-sm truncate">{presenter.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{presenter.style}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                              <Globe className="size-2.5" /> {presenter.language}
                            </Badge>
                            <span className="text-[10px] text-slate-400">
                              <BarChart3 className="size-2.5 inline mr-0.5" />
                              {presenter.generationCount} videos
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-3 bg-[#003ABC] hover:bg-[#002A8F] text-white text-xs h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="size-3 mr-1.5" />
                        Generate Video
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Avatar Generator ────────────────────────────────────── */}
        <TabsContent value="avatar">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-[#1E293B] text-lg">AI Avatar Generator</CardTitle>
                  <CardDescription>Browse and create custom AI avatars for your videos</CardDescription>
                </div>
                <Button className="bg-[#FF6A00] hover:bg-[#E05E00] text-white gap-2 h-9">
                  <Sparkles className="size-4" />
                  Create Avatar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.avatarStyles.map((avatar) => (
                  <Card key={avatar.id} className="rounded-xl border-slate-100 hover:border-[#FF6A00]/30 hover:shadow-md transition-all group">
                    <CardContent className="p-4">
                      <div className="aspect-video rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-3 overflow-hidden">
                        <div className={`size-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${
                          avatar.category === 'professional'
                            ? 'bg-gradient-to-br from-[#003ABC] to-[#0066FF]'
                            : avatar.category === 'casual'
                            ? 'bg-gradient-to-br from-[#FF6A00] to-[#FF9A50]'
                            : 'bg-gradient-to-br from-purple-500 to-pink-500'
                        }`}>
                          <User className="size-8" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-[#1E293B] text-sm">{avatar.name}</h3>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={`text-[10px] px-1.5 py-0 border-0 ${STYLE_COLORS[avatar.category]}`}>
                          {avatar.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{avatar.gender}</Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{avatar.ethnicity}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Video Projects ──────────────────────────────────────── */}
        <TabsContent value="projects">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-[#1E293B] text-lg">Video Projects</CardTitle>
              <CardDescription>Track rendering progress and manage your video library</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="text-xs font-semibold text-slate-600">Project</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Duration</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Resolution</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Progress</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projects.map((project) => (
                      <TableRow key={project.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileVideo className="size-4 text-[#003ABC]" />
                            <span className="text-sm font-medium text-[#1E293B]">{project.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[10px] px-2 py-0.5 border-0 ${
                              project.status === 'complete'
                                ? 'bg-green-100 text-green-700'
                                : project.status === 'rendering'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {project.status === 'complete' && <CheckCircle2 className="size-3 mr-1" />}
                            {project.status === 'rendering' && <Loader2 className="size-3 mr-1 animate-spin" />}
                            {project.status === 'draft' && <Circle className="size-3 mr-1" />}
                            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{project.duration}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{project.resolution}</Badge>
                        </TableCell>
                        <TableCell className="w-40">
                          <div className="space-y-1">
                            <Progress value={project.progress} className="h-2" />
                            <span className="text-[10px] text-slate-500">{project.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{project.createdAt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Subtitle Generator ──────────────────────────────────── */}
        <TabsContent value="subtitle">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Upload & Controls */}
            <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E293B] text-lg">Generate Subtitles</CardTitle>
                <CardDescription>Upload a video to auto-generate subtitles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-[#003ABC]/50 transition-colors cursor-pointer">
                  <Upload className="size-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Drop video file here or click to upload</p>
                  <p className="text-xs text-slate-400 mt-1">MP4, AVI, MOV up to 2GB</p>
                </div>
                <Select value={subtitleLang} onValueChange={setSubtitleLang}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <Languages className="size-3.5 mr-1.5" />
                    <SelectValue placeholder="Output Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="spanish">Spanish</SelectItem>
                    <SelectItem value="french">French</SelectItem>
                    <SelectItem value="german">German</SelectItem>
                    <SelectItem value="japanese">Japanese</SelectItem>
                    <SelectItem value="chinese">Chinese</SelectItem>
                    <SelectItem value="arabic">Arabic</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white gap-2 h-9">
                  <Sparkles className="size-4" />
                  Auto-Generate Subtitles
                </Button>
              </CardContent>
            </Card>

            {/* Subtitle List */}
            <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-[#1E293B] text-lg">Subtitle Track</CardTitle>
                    <CardDescription>{data.subtitles.length} entries</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">SRT Format</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {data.subtitles.map((sub) => (
                    <div key={sub.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                      <div className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded shrink-0 whitespace-nowrap mt-0.5">
                        {sub.startTime}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#1E293B]">{sub.text}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{sub.endTime}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Globe className="size-2.5 mr-0.5" /> {sub.language}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 5: Voice Sync ──────────────────────────────────────────── */}
        <TabsContent value="voice">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-[#1E293B] text-lg">Voice Sync Library</CardTitle>
              <CardDescription>Manage voice engines and synchronization status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.voiceProfiles.map((voice) => (
                  <Card key={voice.id} className="rounded-xl border-slate-100 hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
                          voice.engine === 'Whisper'
                            ? 'bg-blue-100 text-blue-600'
                            : voice.engine === 'Kokoro'
                            ? 'bg-orange-100 text-orange-600'
                            : 'bg-green-100 text-green-600'
                        }`}>
                          <Mic className="size-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[#1E293B] text-sm truncate">{voice.name}</h3>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1">{voice.engine}</Badge>
                        </div>
                        <Badge className={`text-[10px] px-2 py-0.5 border-0 shrink-0 ${
                          voice.status === 'ready'
                            ? 'bg-green-100 text-green-700'
                            : voice.status === 'syncing'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {voice.status === 'ready' && <CheckCircle2 className="size-3 mr-0.5" />}
                          {voice.status === 'syncing' && <Loader2 className="size-3 mr-0.5 animate-spin" />}
                          {voice.status.charAt(0).toUpperCase() + voice.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Language</span>
                          <span className="text-[#1E293B] font-medium">{voice.language}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1.5">
                          <span className="text-slate-500">Synced Videos</span>
                          <span className="text-[#1E293B] font-medium">{voice.syncedVideos}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 text-xs h-8 border-[#003ABC] text-[#003ABC] hover:bg-[#003ABC] hover:text-white"
                      >
                        {voice.status === 'syncing' ? (
                          <>
                            <Pause className="size-3 mr-1.5" />
                            Pause Sync
                          </>
                        ) : (
                          <>
                            <Volume2 className="size-3 mr-1.5" />
                            Sync Videos
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}