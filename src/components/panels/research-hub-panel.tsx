'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen,
  Search,
  Filter,
  Sparkles,
  FileText,
  Building2,
  FolderKanban,
  Users,
  Calendar,
  MapPin,
  Globe,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Target,
  BrainCircuit,
  Library,
  PenTool,
  ScrollText,
  BarChart3,
  Quote,
  Lightbulb,
  CheckCircle2,
  Clock,
  CircleDot,
  Loader2,
  ArrowUpRight,
  Star,
  Bookmark,
  Share2,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface Paper {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  source: 'arXiv' | 'OpenAlex' | 'Crossref' | 'Semantic Scholar' | 'PubMed'
  abstract: string
  citations: number
  doi?: string
  field: string
}

interface ResearchGap {
  id: string
  domain: string
  description: string
  severity: 'high' | 'medium' | 'low'
  relatedPapers: number
  suggestedTopic?: string
}

interface ProposalSection {
  key: string
  title: string
  content: string
  aiAssisted: boolean
}

interface ThesisChapter {
  id: string
  title: string
  status: 'not_started' | 'in_progress' | 'completed' | 'review'
  wordCount: number
  targetWords: number
}

interface Citation {
  id: string
  authors: string
  title: string
  year: number
  journal: string
  citationKey: string
}

interface Journal {
  id: string
  name: string
  publisher: string
  field: string
  impactFactor: number
  acceptanceRate: number
  deadline: string
  isOpenAccess: boolean
}

interface Conference {
  id: string
  name: string
  abbreviation: string
  date: string
  location: string
  field: string
  cfpStatus: 'open' | 'closed' | 'upcoming'
  deadline: string
  acceptanceRate: number
}

interface ResearchProject {
  id: string
  title: string
  pi: string
  status: 'planning' | 'active' | 'paused' | 'completed'
  progress: number
  field: string
  startDate: string
  endDate?: string
  collaborators: number
  publications: number
}

// ── UI Config ──────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  arXiv: 'bg-red-50 text-red-700 border-red-200',
  OpenAlex: 'bg-sky-50 text-sky-700 border-sky-200',
  Crossref: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Semantic Scholar': 'bg-violet-50 text-violet-700 border-violet-200',
  PubMed: 'bg-teal-50 text-teal-700 border-teal-200',
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  high: { color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  medium: { color: 'bg-amber-100 text-amber-700', icon: TrendingUp },
  low: { color: 'bg-slate-100 text-slate-600', icon: CircleDot },
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  planning: { color: 'bg-slate-100 text-slate-600', icon: Clock },
  active: { color: 'bg-emerald-100 text-emerald-700', icon: CircleDot },
  paused: { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  completed: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  not_started: { color: 'bg-slate-100 text-slate-600', icon: Clock },
  in_progress: { color: 'bg-amber-100 text-amber-700', icon: Loader2 },
  review: { color: 'bg-violet-100 text-violet-700', icon: Eye },
}

const CFP_CONFIG: Record<string, { color: string; label: string }> = {
  open: { color: 'bg-emerald-100 text-emerald-700', label: 'Open' },
  closed: { color: 'bg-slate-100 text-slate-500', label: 'Closed' },
  upcoming: { color: 'bg-amber-100 text-amber-700', label: 'Upcoming' },
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ResearchHubPanel() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Literature Review state
  const [paperSearch, setPaperSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [fieldFilter, setFieldFilter] = useState<string>('all')

  // Data state
  const [papers, setPapers] = useState<Paper[]>([])
  const [journals, setJournals] = useState<Journal[]>([])
  const [conferences, setConferences] = useState<Conference[]>([])
  const [projects, setProjects] = useState<ResearchProject[]>([])

  // Research Gaps state
  const [gaps, setGaps] = useState<ResearchGap[]>([])
  const [analyzingGaps, setAnalyzingGaps] = useState(false)
  const [gapSeverityFilter, setGapSeverityFilter] = useState<string>('all')

  // Proposal Writing state
  const [proposalSections, setProposalSections] = useState<ProposalSection[]>([
    { key: 'title', title: 'Title', content: '', aiAssisted: false },
    { key: 'abstract', title: 'Abstract', content: '', aiAssisted: false },
    { key: 'introduction', title: 'Introduction', content: '', aiAssisted: false },
    { key: 'methodology', title: 'Methodology', content: '', aiAssisted: false },
    { key: 'expected_outcomes', title: 'Expected Outcomes', content: '', aiAssisted: false },
  ])
  const [activeProposalSection, setActiveProposalSection] = useState('title')
  const [aiAssisting, setAiAssisting] = useState<string | null>(null)

  // Thesis Assistance state
  const [chapters, setChapters] = useState<ThesisChapter[]>([
    { id: 'ch1', title: 'Chapter 1: Introduction', status: 'completed', wordCount: 3200, targetWords: 3000 },
    { id: 'ch2', title: 'Chapter 2: Literature Review', status: 'in_progress', wordCount: 8500, targetWords: 12000 },
    { id: 'ch3', title: 'Chapter 3: Methodology', status: 'in_progress', wordCount: 4200, targetWords: 8000 },
    { id: 'ch4', title: 'Chapter 4: Experiments & Results', status: 'not_started', wordCount: 0, targetWords: 10000 },
    { id: 'ch5', title: 'Chapter 5: Discussion', status: 'not_started', wordCount: 0, targetWords: 5000 },
    { id: 'ch6', title: 'Chapter 6: Conclusion & Future Work', status: 'not_started', wordCount: 0, targetWords: 3000 },
  ])
  const [citations, setCitations] = useState<Citation[]>([
    { id: 'cit1', authors: 'Vaswani et al.', title: 'Attention Is All You Need', year: 2017, journal: 'NeurIPS', citationKey: 'vaswani2017attention' },
    { id: 'cit2', authors: 'Devlin et al.', title: 'BERT: Pre-training of Deep Bidirectional Transformers', year: 2019, journal: 'NAACL', citationKey: 'REDACTED_EXAMPLE_CREDENTIAL' },
    { id: 'cit3', authors: 'He et al.', title: 'Deep Residual Learning for Image Recognition', year: 2016, journal: 'CVPR', citationKey: 'he2016deep' },
    { id: 'cit4', authors: 'Brown et al.', title: 'Language Models are Few-Shot Learners', year: 2020, journal: 'NeurIPS', citationKey: 'brown2020language' },
  ])
  const [showAddCitation, setShowAddCitation] = useState(false)
  const [newCitation, setNewCitation] = useState({ authors: '', title: '', year: '', journal: '', citationKey: '' })

  // Journal & Conference state
  const [journalFieldFilter, setJournalFieldFilter] = useState<string>('all')
  const [conferenceFieldFilter, setConferenceFieldFilter] = useState<string>('all')

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/research-hub')
        if (res.ok) {
          const json = await res.json()
          setData(json)
          if (json.papers) setPapers(json.papers)
          if (json.gaps) setGaps(json.gaps)
          if (json.journals) setJournals(json.journals)
          if (json.conferences) setConferences(json.conferences)
          if (json.projects) setProjects(json.projects)
        }
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── Filtered papers ──
  const filteredPapers = papers.filter(p => {
    const matchesSearch = !paperSearch || p.title.toLowerCase().includes(paperSearch.toLowerCase()) || p.authors.some(a => a.toLowerCase().includes(paperSearch.toLowerCase())) || p.abstract.toLowerCase().includes(paperSearch.toLowerCase())
    const matchesSource = sourceFilter === 'all' || p.source === sourceFilter
    const matchesYear = yearFilter === 'all' || p.year.toString() === yearFilter
    const matchesField = fieldFilter === 'all' || p.field === fieldFilter
    return matchesSearch && matchesSource && matchesYear && matchesField
  })

  const filteredGaps = gaps.filter(g => gapSeverityFilter === 'all' || g.severity === gapSeverityFilter)
  const filteredJournals = journals.filter(j => journalFieldFilter === 'all' || j.field === journalFieldFilter)
  const filteredConferences = conferences.filter(c => conferenceFieldFilter === 'all' || c.field === conferenceFieldFilter)

  // ── Handlers ──
  const handleAnalyzeGaps = useCallback(() => {
    setAnalyzingGaps(true)
    setTimeout(() => {
      setAnalyzingGaps(false)
    }, 2500)
  }, [])

  const handleAiAssist = useCallback(async (sectionKey: string) => {
    setAiAssisting(sectionKey)
    const titleContent = proposalSections.find(s => s.key === 'title')?.content || 'Untitled Research'
    try {
      const res = await fetch('/api/research-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', topic: titleContent, type: 'proposal', section: sectionKey }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || `Request failed with status ${res.status}`)
      }
      const json = await res.json()
      const content = json.content || json.data?.content || ''
      setProposalSections(prev => prev.map(s =>
        s.key === sectionKey ? { ...s, content, aiAssisted: true } : s
      ))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate content')
    } finally {
      setAiAssisting(null)
    }
  }, [proposalSections])

  const handleUpdateProposal = useCallback((key: string, content: string) => {
    setProposalSections(prev => prev.map(s => s.key === key ? { ...s, content } : s))
  }, [])

  const handleAddCitation = useCallback(() => {
    if (!newCitation.authors || !newCitation.title) return
    const cit: Citation = {
      id: `cit${Date.now()}`,
      authors: newCitation.authors,
      title: newCitation.title,
      year: parseInt(newCitation.year) || new Date().getFullYear(),
      journal: newCitation.journal || 'Unknown',
      citationKey: newCitation.citationKey || `key${Date.now()}`,
    }
    setCitations(prev => [...prev, cit])
    setNewCitation({ authors: '', title: '', year: '', journal: '', citationKey: '' })
    setShowAddCitation(false)
  }, [newCitation])

  const handleDeleteCitation = useCallback((id: string) => {
    setCitations(prev => prev.filter(c => c.id !== id))
  }, [])

  const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
  const totalTargetWords = chapters.reduce((sum, ch) => sum + ch.targetWords, 0)
  const overallProgress = totalTargetWords > 0 ? Math.round((totalWordCount / totalTargetWords) * 100) : 0

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">AI Research Hub</h2>
            <p className="text-sm text-slate-500">Literature, analysis, proposals &amp; thesis tools</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1 text-[#FF6A00]" />
            AI-Powered
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Library className="h-3 w-3 mr-1" />
            {filteredPapers.length} Papers
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="literature" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-white border">
          <TabsTrigger value="literature" className="text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 mr-1" />
            Literature Review
          </TabsTrigger>
          <TabsTrigger value="gaps" className="text-xs sm:text-sm">
            <Target className="h-3.5 w-3.5 mr-1" />
            Gap Analysis
          </TabsTrigger>
          <TabsTrigger value="proposal" className="text-xs sm:text-sm">
            <PenTool className="h-3.5 w-3.5 mr-1" />
            Proposal
          </TabsTrigger>
          <TabsTrigger value="thesis" className="text-xs sm:text-sm">
            <ScrollText className="h-3.5 w-3.5 mr-1" />
            Thesis
          </TabsTrigger>
          <TabsTrigger value="journals" className="text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 mr-1" />
            Journals
          </TabsTrigger>
          <TabsTrigger value="management" className="text-xs sm:text-sm">
            <FolderKanban className="h-3.5 w-3.5 mr-1" />
            Management
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Literature Review                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="literature" className="mt-4 space-y-4">
          {/* Search & Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search papers by title, author, or keyword..."
                    value={paperSearch}
                    onChange={e => setPaperSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <Filter className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="arXiv">arXiv</SelectItem>
                      <SelectItem value="OpenAlex">OpenAlex</SelectItem>
                      <SelectItem value="Crossref">Crossref</SelectItem>
                      <SelectItem value="Semantic Scholar">Semantic Scholar</SelectItem>
                      <SelectItem value="PubMed">PubMed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2023">2023</SelectItem>
                      <SelectItem value="2022">2022</SelectItem>
                      <SelectItem value="2021">2021</SelectItem>
                      <SelectItem value="2020">2020</SelectItem>
                      <SelectItem value="2019">2019</SelectItem>
                      <SelectItem value="2017">2017</SelectItem>
                      <SelectItem value="2016">2016</SelectItem>
                      <SelectItem value="2014">2014</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={fieldFilter} onValueChange={setFieldFilter}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <Globe className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Fields</SelectItem>
                      <SelectItem value="Machine Learning">Machine Learning</SelectItem>
                      <SelectItem value="NLP">NLP</SelectItem>
                      <SelectItem value="Computer Vision">Computer Vision</SelectItem>
                      <SelectItem value="AI Survey">AI Survey</SelectItem>
                      <SelectItem value="Biomedical">Biomedical</SelectItem>
                      <SelectItem value="Healthcare AI">Healthcare AI</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                    <FileText className="h-3 w-3" />
                    {filteredPapers.length} papers found
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Paper Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPapers.map(paper => (
              <Card key={paper.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-[#1E293B] leading-snug line-clamp-2">
                      {paper.title}
                    </CardTitle>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${SOURCE_COLORS[paper.source] || 'bg-slate-50 text-slate-600'}`}>
                      {paper.source}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {paper.authors.join(', ')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-slate-600 line-clamp-3 mb-3">{paper.abstract}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-normal">{paper.journal}</Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{paper.field}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Quote className="h-3 w-3" />
                      {paper.citations.toLocaleString()} citations
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400">{paper.year}</span>
                    {paper.doi && (
                      <span className="text-[10px] text-[#003ABC] flex items-center gap-0.5 cursor-pointer hover:underline">
                        DOI <ExternalLink className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Bookmark className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Share2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredPapers.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Search className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No papers found matching your criteria</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setPaperSearch(''); setSourceFilter('all'); setYearFilter('all'); setFieldFilter('all') }}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: Research Gap Analysis                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="gaps" className="mt-4 space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={gapSeverityFilter} onValueChange={setGapSeverityFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-xs">{filteredGaps.length} gaps identified</Badge>
            </div>
            <Button
              size="sm"
              onClick={handleAnalyzeGaps}
              disabled={analyzingGaps}
              className="bg-[#003ABC] hover:bg-[#002a99] text-white"
            >
              {analyzingGaps ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing...</>
              ) : (
                <><BrainCircuit className="h-3.5 w-3.5 mr-1.5" /> Analyze Gaps</>
              )}
            </Button>
          </div>

          {/* Gap Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{gaps.filter(g => g.severity === 'high').length}</div>
                <div className="text-xs text-slate-500">High Severity</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{gaps.filter(g => g.severity === 'medium').length}</div>
                <div className="text-xs text-slate-500">Medium Severity</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-slate-500">{gaps.filter(g => g.severity === 'low').length}</div>
                <div className="text-xs text-slate-500">Low Severity</div>
              </CardContent>
            </Card>
          </div>

          {/* Gaps List */}
          <div className="space-y-3">
            {filteredGaps.map(gap => {
              const sevConfig = SEVERITY_CONFIG[gap.severity]
              const SevIcon = sevConfig.icon
              return (
                <Card key={gap.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-[10px] font-medium bg-slate-50">{gap.domain}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${sevConfig.color}`}>
                            <SevIcon className="h-2.5 w-2.5 mr-0.5" />
                            {gap.severity}
                          </Badge>
                          <span className="text-[10px] text-slate-400">{gap.relatedPapers} related papers</span>
                        </div>
                        <p className="text-sm text-[#1E293B] mb-2">{gap.description}</p>
                        {gap.suggestedTopic && (
                          <div className="flex items-start gap-1.5 p-2 rounded-md bg-[#FF6A00]/5 border border-[#FF6A00]/20">
                            <Lightbulb className="h-3.5 w-3.5 text-[#FF6A00] mt-0.5 shrink-0" />
                            <div>
                              <div className="text-[10px] font-medium text-[#FF6A00]">Suggested Research Topic</div>
                              <div className="text-xs text-slate-700">{gap.suggestedTopic}</div>
                            </div>
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Proposal Writing                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="proposal" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Section Navigator */}
            <Card className="border-0 shadow-sm lg:col-span-1">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Proposal Sections</CardTitle>
                <CardDescription className="text-xs">Click to edit, use AI to assist</CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <div className="space-y-0.5">
                  {proposalSections.map((section) => (
                    <button
                      key={section.key}
                      onClick={() => setActiveProposalSection(section.key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                        activeProposalSection === section.key
                          ? 'bg-[#003ABC]/10 text-[#003ABC] font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {section.aiAssisted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 shrink-0" />
                      )}
                      <span className="truncate">{section.title}</span>
                    </button>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="px-3 text-[10px] text-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Sections completed</span>
                    <span>{proposalSections.filter(s => s.content.length > 0).length}/{proposalSections.length}</span>
                  </div>
                  <Progress
                    value={(proposalSections.filter(s => s.content.length > 0).length / proposalSections.length) * 100}
                    className="h-1.5"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section Editor */}
            <Card className="border-0 shadow-sm lg:col-span-3">
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-[#1E293B]">
                      {proposalSections.find(s => s.key === activeProposalSection)?.title}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Write your content or let AI assist you
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAiAssist(activeProposalSection)}
                    disabled={aiAssisting === activeProposalSection}
                    className="text-xs border-[#FF6A00] text-[#FF6A00] hover:bg-[#FF6A00]/10"
                  >
                    {aiAssisting === activeProposalSection ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" /> AI Assist</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Textarea
                  placeholder={`Write your ${proposalSections.find(s => s.key === activeProposalSection)?.title.toLowerCase()} here...`}
                  value={proposalSections.find(s => s.key === activeProposalSection)?.content || ''}
                  onChange={e => handleUpdateProposal(activeProposalSection, e.target.value)}
                  className="min-h-[320px] text-sm resize-y"
                />
                {proposalSections.find(s => s.key === activeProposalSection)?.aiAssisted && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-600">
                    <Sparkles className="h-3 w-3" />
                    AI-assisted content — review and edit as needed
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: Thesis Assistance                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="thesis" className="mt-4 space-y-4">
          {/* Thesis Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ScrollText className="h-4 w-4 text-[#003ABC]" />
                  <span className="text-sm font-medium text-[#1E293B]">Word Count</span>
                </div>
                <div className="text-2xl font-bold text-[#1E293B]">{totalWordCount.toLocaleString()}</div>
                <div className="text-xs text-slate-500">of {totalTargetWords.toLocaleString()} target</div>
                <Progress value={overallProgress} className="mt-2 h-2" />
                <div className="text-[10px] text-slate-400 mt-1">{overallProgress}% complete</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-[#1E293B]">Chapters Done</span>
                </div>
                <div className="text-2xl font-bold text-[#1E293B]">{chapters.filter(c => c.status === 'completed').length}/{chapters.length}</div>
                <div className="text-xs text-slate-500">chapters completed</div>
                <div className="flex gap-1 mt-2">
                  {chapters.map(ch => (
                    <div
                      key={ch.id}
                      className={`h-1.5 flex-1 rounded-full ${
                        ch.status === 'completed' ? 'bg-emerald-500' :
                        ch.status === 'in_progress' ? 'bg-amber-400' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Quote className="h-4 w-4 text-[#FF6A00]" />
                  <span className="text-sm font-medium text-[#1E293B]">Citations</span>
                </div>
                <div className="text-2xl font-bold text-[#1E293B]">{citations.length}</div>
                <div className="text-xs text-slate-500">references added</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {['PDF', 'DOCX', 'PPTX', 'XLSX', 'CSV', 'LaTeX'].map(fmt => (
                    <Badge key={fmt} variant="outline" className="text-[9px] px-1.5 py-0">
                      {fmt}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chapters & Citations */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Chapter Management */}
            <Card className="border-0 shadow-sm lg:col-span-3">
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-[#1E293B]">Thesis Outline</CardTitle>
                    <CardDescription className="text-xs">Chapter management &amp; progress tracking</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <Plus className="h-3 w-3 mr-1" /> Add Chapter
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {chapters.map(chapter => {
                    const statusCfg = STATUS_CONFIG[chapter.status]
                    const StatusIcon = statusCfg.icon
                    const pct = chapter.targetWords > 0 ? Math.round((chapter.wordCount / chapter.targetWords) * 100) : 0
                    return (
                      <div key={chapter.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${statusCfg.color}`}>
                          <StatusIcon className={`h-4 w-4 ${chapter.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-[#1E293B] truncate">{chapter.title}</span>
                            <Badge variant="outline" className={`text-[9px] shrink-0 ${statusCfg.color}`}>
                              {chapter.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{chapter.wordCount.toLocaleString()}/{chapter.targetWords.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Edit3 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Citation Management */}
            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-[#1E293B]">Citations</CardTitle>
                    <CardDescription className="text-xs">{citations.length} references</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowAddCitation(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <ScrollArea className="max-h-96">
                  <div className="space-y-1.5">
                    {citations.map(cit => (
                      <div key={cit.id} className="p-2.5 rounded-md border border-slate-100 hover:border-slate-200 transition-colors group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-mono text-[#003ABC] mb-0.5">{cit.citationKey}</div>
                            <div className="text-xs font-medium text-[#1E293B] line-clamp-1">{cit.title}</div>
                            <div className="text-[10px] text-slate-500">{cit.authors} ({cit.year}) — {cit.journal}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => handleDeleteCitation(cit.id)}
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Add Citation Form */}
                {showAddCitation && (
                  <div className="mt-3 p-3 rounded-md border border-[#003ABC]/30 bg-[#003ABC]/5 space-y-2">
                    <div className="text-xs font-medium text-[#003ABC]">Add Citation</div>
                    <Input placeholder="Authors (e.g., Smith et al.)" value={newCitation.authors} onChange={e => setNewCitation(p => ({ ...p, authors: e.target.value }))} className="h-7 text-xs" />
                    <Input placeholder="Title" value={newCitation.title} onChange={e => setNewCitation(p => ({ ...p, title: e.target.value }))} className="h-7 text-xs" />
                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder="Year" value={newCitation.year} onChange={e => setNewCitation(p => ({ ...p, year: e.target.value }))} className="h-7 text-xs" />
                      <Input placeholder="Journal" value={newCitation.journal} onChange={e => setNewCitation(p => ({ ...p, journal: e.target.value }))} className="h-7 text-xs" />
                      <Input placeholder="Citation Key" value={newCitation.citationKey} onChange={e => setNewCitation(p => ({ ...p, citationKey: e.target.value }))} className="h-7 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs bg-[#003ABC] hover:bg-[#002a99] text-white flex-1" onClick={handleAddCitation}>Add Citation</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddCitation(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: Journal & Conference Finder                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="journals" className="mt-4 space-y-4">
          <Tabs defaultValue="journals_list">
            <TabsList className="bg-white border">
              <TabsTrigger value="journals_list" className="text-xs">
                <BookOpen className="h-3 w-3 mr-1" /> Journals
              </TabsTrigger>
              <TabsTrigger value="conferences_list" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" /> Conferences
              </TabsTrigger>
            </TabsList>

            {/* Journals */}
            <TabsContent value="journals_list" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Select value={journalFieldFilter} onValueChange={setJournalFieldFilter}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="AI">AI</SelectItem>
                    <SelectItem value="Machine Learning">Machine Learning</SelectItem>
                    <SelectItem value="Computer Vision">Computer Vision</SelectItem>
                    <SelectItem value="NLP">NLP</SelectItem>
                    <SelectItem value="Interdisciplinary">Interdisciplinary</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-xs">{filteredJournals.length} journals</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredJournals.map(journal => (
                  <Card key={journal.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#1E293B] truncate">{journal.name}</div>
                          <div className="text-xs text-slate-500">{journal.publisher}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {journal.isOpenAccess && (
                            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              Open Access
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="text-center p-2 rounded-md bg-slate-50">
                          <div className="text-lg font-bold text-[#003ABC]">{journal.impactFactor}</div>
                          <div className="text-[9px] text-slate-500">Impact Factor</div>
                        </div>
                        <div className="text-center p-2 rounded-md bg-slate-50">
                          <div className="text-lg font-bold text-[#FF6A00]">{journal.acceptanceRate}%</div>
                          <div className="text-[9px] text-slate-500">Acceptance</div>
                        </div>
                        <div className="text-center p-2 rounded-md bg-slate-50">
                          <div className="text-xs font-medium text-[#1E293B] mt-1">{journal.deadline === 'Rolling' ? 'Rolling' : new Date(journal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                          <div className="text-[9px] text-slate-500">Deadline</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">{journal.field}</Badge>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#003ABC] hover:text-[#002a99] gap-1">
                          Submit <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Conferences */}
            <TabsContent value="conferences_list" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Select value={conferenceFieldFilter} onValueChange={setConferenceFieldFilter}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="AI">AI</SelectItem>
                    <SelectItem value="Machine Learning">Machine Learning</SelectItem>
                    <SelectItem value="Computer Vision">Computer Vision</SelectItem>
                    <SelectItem value="NLP">NLP</SelectItem>
                    <SelectItem value="Deep Learning">Deep Learning</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-xs">{filteredConferences.length} conferences</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredConferences.map(conf => {
                  const cfpCfg = CFP_CONFIG[conf.cfpStatus]
                  return (
                    <Card key={conf.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-[#1E293B]">{conf.name}</div>
                            <div className="text-xs font-medium text-[#003ABC]">{conf.abbreviation}</div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${cfpCfg.color}`}>
                            {cfpCfg.label}
                          </Badge>
                        </div>
                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {new Date(conf.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {conf.location}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400" />
                            Deadline: {new Date(conf.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{conf.field}</Badge>
                            <span className="text-[10px] text-slate-400">{conf.acceptanceRate}% acceptance</span>
                          </div>
                          {conf.cfpStatus === 'open' && (
                            <Button size="sm" className="h-6 text-[10px] bg-[#003ABC] hover:bg-[#002a99] text-white">
                              Submit Paper
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 6: Research Management                                      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="management" className="mt-4 space-y-4">
          {/* Projects Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Projects', value: projects.filter(p => p.status === 'active').length, color: 'text-emerald-600', icon: CircleDot },
              { label: 'Total Collaborators', value: projects.reduce((s, p) => s + p.collaborators, 0), color: 'text-[#003ABC]', icon: Users },
              { label: 'Publications', value: projects.reduce((s, p) => s + p.publications, 0), color: 'text-[#FF6A00]', icon: BarChart3 },
              { label: 'Avg Progress', value: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) + '%' : '0%', color: 'text-violet-600', icon: TrendingUp },
            ].map(stat => (
              <Card key={stat.label} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    <span className="text-xs text-slate-500">{stat.label}</span>
                  </div>
                  <div className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Projects List */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-[#1E293B]">Research Projects</CardTitle>
                  <CardDescription className="text-xs">{projects.length} projects tracked</CardDescription>
                </div>
                <Button size="sm" className="text-xs bg-[#003ABC] hover:bg-[#002a99] text-white h-7">
                  <Plus className="h-3 w-3 mr-1" /> New Project
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-3">
                {projects.map(project => {
                  const statusCfg = STATUS_CONFIG[project.status]
                  const StatusIcon = statusCfg.icon
                  return (
                    <div key={project.id} className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-[#1E293B] truncate">{project.title}</span>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${statusCfg.color}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                              {project.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" /> {project.pi}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" /> {project.collaborators} collaborators
                            </span>
                            <span className="flex items-center gap-1">
                              <BarChart3 className="h-3 w-3" /> {project.publications} pubs
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {new Date(project.startDate).getFullYear()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={project.progress} className="flex-1 h-2" />
                        <span className="text-xs font-medium text-[#1E293B] w-10 text-right">{project.progress}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Collaborators & Publications Tracker */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Collaborators */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Recent Collaborators</CardTitle>
                <CardDescription className="text-xs">Active research team members</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {[
                    { name: 'Dr. Sarah Chen', role: 'Principal Investigator', dept: 'Computer Science', papers: 28 },
                    { name: 'Prof. James Rodriguez', role: 'Co-PI', dept: 'Data Science', papers: 45 },
                    { name: 'Dr. Aisha Patel', role: 'Postdoc Researcher', dept: 'Health Informatics', papers: 12 },
                    { name: 'Dr. Emily Watson', role: 'PhD Candidate', dept: 'Machine Learning', papers: 8 },
                    { name: 'Prof. Michael Kim', role: 'Faculty Advisor', dept: 'Computer Engineering', papers: 67 },
                  ].map(collab => (
                    <div key={collab.name} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-[#003ABC]/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-[#003ABC]">{collab.name.split(' ').map(n => n[0]).join('')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#1E293B] truncate">{collab.name}</div>
                        <div className="text-[10px] text-slate-500">{collab.role} — {collab.dept}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-[#1E293B]">{collab.papers}</div>
                        <div className="text-[9px] text-slate-400">papers</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Publication Tracker */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Publication Tracker</CardTitle>
                <CardDescription className="text-xs">Recent submissions &amp; publications</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ScrollArea className="max-h-72">
                  <div className="space-y-2">
                    {[
                      { title: 'Adaptive Multi-Modal Fusion for Clinical Decision Support', venue: 'Nature Machine Intelligence', status: 'Under Review', date: '2025-01-15' },
                      { title: 'Federated Graph Learning for Privacy-Preserving Recommendations', venue: 'IEEE TPAMI', status: 'Accepted', date: '2024-12-20' },
                      { title: 'A Benchmark for Evaluating Hallucination in Medical AI', venue: 'ACL 2025', status: 'Submitted', date: '2025-02-01' },
                      { title: 'Neural Architecture Search on the Edge: A Comprehensive Survey', venue: 'JMLR', status: 'Published', date: '2024-11-10' },
                      { title: 'Causal Inference in Observational Health Data Using Deep Learning', venue: 'ICML 2025', status: 'In Preparation', date: '2025-03-01' },
                    ].map(pub => (
                      <div key={pub.title} className="p-2.5 rounded-md border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-xs font-medium text-[#1E293B] line-clamp-1 flex-1">{pub.title}</div>
                          <Badge
                            variant="outline"
                            className={`text-[9px] shrink-0 ${
                              pub.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              pub.status === 'Accepted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              pub.status === 'Under Review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              pub.status === 'Submitted' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                              'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {pub.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>{pub.venue}</span>
                          <span>•</span>
                          <span>{new Date(pub.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}