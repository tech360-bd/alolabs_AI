'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  Download,
  Eye,
  Search,
  FileSpreadsheet,
  FileImage,
  Film,
  Music,
  File,
  FileType2,
  Presentation,
  LayoutTemplate,
  RefreshCw,
  MoreVertical,
  HardDrive,
  ArrowUpFromLine,
  CircleDot,
  X,
  FileCheck,
  FileWarning,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Types ───────────────────────────────────────────────────────────────────

interface Document {
  id: string
  name: string
  type: 'PDF' | 'DOCX' | 'PPTX' | 'XLSX' | 'CSV' | 'Image' | 'Audio' | 'Video'
  size: string
  sizeBytes: number
  uploadedAt: string
  status: 'completed' | 'processing' | 'failed' | 'queued'
  pages?: number
}

interface ProcessingJob {
  id: string
  name: string
  type: string
  status: 'processing' | 'queued' | 'completed' | 'failed'
  progress: number
  startedAt: string
  eta?: string
  step: string
}

interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  usageCount: number
  lastUsed: string
}

// ── Component ───────────────────────────────────────────────────────────────

const SUPPORTED_FORMATS = [
  { name: 'PDF', color: 'bg-red-50 text-red-600 border-red-200' },
  { name: 'DOCX', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { name: 'PPTX', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  { name: 'XLSX', color: 'bg-green-50 text-green-600 border-green-200' },
  { name: 'CSV', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { name: 'Images', color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { name: 'Audio', color: 'bg-pink-50 text-pink-600 border-pink-200' },
  { name: 'Video', color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  switch (type) {
    case 'PDF': return FileText
    case 'DOCX': return FileType2
    case 'PPTX': return Presentation
    case 'XLSX': return FileSpreadsheet
    case 'CSV': return FileSpreadsheet
    case 'Image': return FileImage
    case 'Audio': return Music
    case 'Video': return Film
    default: return File
  }
}

function getFileColor(type: string) {
  switch (type) {
    case 'PDF': return 'bg-red-50 text-red-600'
    case 'DOCX': return 'bg-blue-50 text-blue-600'
    case 'PPTX': return 'bg-orange-50 text-orange-600'
    case 'XLSX': return 'bg-green-50 text-green-600'
    case 'CSV': return 'bg-emerald-50 text-emerald-600'
    case 'Image': return 'bg-purple-50 text-purple-600'
    case 'Audio': return 'bg-pink-50 text-pink-600'
    case 'Video': return 'bg-cyan-50 text-cyan-600'
    default: return 'bg-slate-100 text-slate-500'
  }
}

function getTypeBadgeColor(type: string) {
  switch (type) {
    case 'PDF': return 'bg-red-50 text-red-700 border-red-200'
    case 'DOCX': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'PPTX': return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'XLSX': return 'bg-green-50 text-green-700 border-green-200'
    case 'CSV': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Image': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'Audio': return 'bg-pink-50 text-pink-700 border-pink-200'
    case 'Video': return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    default: return 'bg-slate-100 text-slate-500 border-slate-200'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-3.5 h-3.5 text-green-500" />
    case 'processing': return <Loader2 className="w-3.5 h-3.5 text-[#003ABC] animate-spin" />
    case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    case 'queued': return <Clock className="w-3.5 h-3.5 text-amber-500" />
    default: return null
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed': return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>
    case 'processing': return <Badge className="bg-blue-50 text-[#003ABC] border-blue-200 text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>
    case 'failed': return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>
    case 'queued': return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs"><Clock className="w-3 h-3 mr-1" />Queued</Badge>
    default: return null
  }
}

function getTemplateIcon(icon: string) {
  switch (icon) {
    case 'report': return FileText
    case 'proposal': return LayoutTemplate
    case 'invoice': return FileSpreadsheet
    case 'contract': return FileCheck
    case 'letter': return FileType2
    case 'resume': return FileText
    default: return FileText
  }
}

function getTemplateIconColor(category: string) {
  switch (category) {
    case 'Reports': return 'bg-[#003ABC]/10 text-[#003ABC]'
    case 'Proposals': return 'bg-violet-50 text-violet-600'
    case 'Finance': return 'bg-green-50 text-green-600'
    case 'Legal': return 'bg-amber-50 text-amber-600'
    case 'Correspondence': return 'bg-blue-50 text-blue-600'
    case 'HR': return 'bg-pink-50 text-pink-600'
    default: return 'bg-slate-100 text-slate-500'
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DocumentSystemPanel() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [processing, setProcessing] = useState<ProcessingJob[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then((data) => {
        if (data.documents) setDocuments(data.documents)
        if (data.processing) setProcessing(data.processing)
        if (data.templates) setTemplates(data.templates)
      })
      .catch(() => {
        setDocuments([])
        setProcessing([])
        setTemplates([])
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredDocuments = documents.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleUpload = () => {
    setIsUploading(true)
    setUploadProgress(0)
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsUploading(false)
          return 100
        }
        return prev + Math.random() * 15 + 5
      })
    }, 200)
  }

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
            <FileText className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Document System</h2>
            <p className="text-sm text-[#64748B]">Manage, upload, and process documents across all formats</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
            <HardDrive className="w-3 h-3 mr-1" />
            {documents.length} Documents
          </Badge>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
            <Loader2 className="w-3 h-3 mr-1" />
            {processing.filter((p) => p.status === 'processing').length} Processing
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="bg-white border border-[#E2E8F0] rounded-xl p-1 h-auto">
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <FileText className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="upload" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Upload className="w-4 h-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="processing" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <Loader2 className="w-4 h-4" />
            Processing
          </TabsTrigger>
          <TabsTrigger value="templates" className="rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white gap-2 px-4 py-2 text-sm">
            <LayoutTemplate className="w-4 h-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        {/* ─── Documents Tab ──────────────────────────────────────── */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by name..."
              className="pl-9 border-[#E2E8F0] bg-white text-sm"
            />
          </div>

          {/* Documents Table */}
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0]">
                    <TableHead className="text-xs text-[#64748B] font-medium">Name</TableHead>
                    <TableHead className="text-xs text-[#64748B] font-medium">Type</TableHead>
                    <TableHead className="text-xs text-[#64748B] font-medium">Size</TableHead>
                    <TableHead className="text-xs text-[#64748B] font-medium">Uploaded</TableHead>
                    <TableHead className="text-xs text-[#64748B] font-medium">Status</TableHead>
                    <TableHead className="text-xs text-[#64748B] font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-[#64748B]">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No documents found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const FileIcon = getFileIcon(doc.type)
                      return (
                        <TableRow key={doc.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getFileColor(doc.type)}`}>
                                <FileIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-sm text-[#1E293B] font-medium">{doc.name}</p>
                                {doc.pages && (
                                  <p className="text-[10px] text-[#64748B]">{doc.pages} pages</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getTypeBadgeColor(doc.type)}`}>
                              {doc.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-[#64748B]">{doc.size}</TableCell>
                          <TableCell className="text-sm text-[#64748B]">
                            {new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {getStatusIcon(doc.status)}
                              <span className="text-xs text-[#64748B] capitalize">{doc.status}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#64748B] hover:text-[#003ABC] hover:bg-[#003ABC]/10">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#64748B] hover:text-[#003ABC] hover:bg-[#003ABC]/10">
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#64748B] hover:text-red-500 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Upload Tab ─────────────────────────────────────────── */}
        <TabsContent value="upload" className="mt-4 space-y-6">
          {/* Supported Formats */}
          <div>
            <h3 className="text-sm font-medium text-[#1E293B] mb-3">Supported Formats</h3>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_FORMATS.map((fmt) => (
                <Badge key={fmt.name} variant="outline" className={`text-xs px-3 py-1 ${fmt.color}`}>
                  {fmt.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Upload Area */}
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-6">
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                  isDragOver
                    ? 'border-[#003ABC] bg-[#003ABC]/5'
                    : isUploading
                      ? 'border-[#003ABC]/50 bg-[#003ABC]/5'
                      : 'border-[#E2E8F0] hover:border-[#003ABC]/50 hover:bg-[#F8FAFC]'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleUpload() }}
              >
                {isUploading ? (
                  <div className="space-y-4 max-w-md mx-auto">
                    <Loader2 className="w-12 h-12 mx-auto text-[#003ABC] animate-spin" />
                    <p className="text-sm text-[#1E293B] font-medium">Uploading file...</p>
                    <div className="space-y-2">
                      <Progress value={Math.min(uploadProgress, 100)} className="h-2" />
                      <p className="text-xs text-[#64748B]">{Math.min(Math.round(uploadProgress), 100)}% complete</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-[#003ABC]/10 flex items-center justify-center mx-auto mb-4">
                      <ArrowUpFromLine className="w-8 h-8 text-[#003ABC]" />
                    </div>
                    <p className="text-sm text-[#1E293B] font-medium">
                      Drag and drop files here, or{' '}
                      <span className="text-[#003ABC] cursor-pointer hover:underline">browse files</span>
                    </p>
                    <p className="text-xs text-[#64748B] mt-2">
                      Maximum file size: 500MB per file
                    </p>
                    <Button
                      onClick={handleUpload}
                      className="mt-4 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Select Files
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Processing Tab ─────────────────────────────────────── */}
        <TabsContent value="processing" className="mt-4 space-y-4">
          {/* Processing stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Processing', count: processing.filter((p) => p.status === 'processing').length, color: 'bg-blue-50 text-[#003ABC]', icon: Loader2 },
              { label: 'Queued', count: processing.filter((p) => p.status === 'queued').length, color: 'bg-amber-50 text-amber-700', icon: Clock },
              { label: 'Completed', count: processing.filter((p) => p.status === 'completed').length, color: 'bg-green-50 text-green-700', icon: CheckCircle },
              { label: 'Failed', count: processing.filter((p) => p.status === 'failed').length, color: 'bg-red-50 text-red-700', icon: AlertCircle },
            ].map((stat) => (
              <Card key={stat.label} className="border-[#E2E8F0]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#64748B]">{stat.label}</p>
                      <p className="text-2xl font-bold text-[#1E293B]">{stat.count}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Processing Queue */}
          <div className="space-y-3">
            {processing.length === 0 ? (
              <Card className="border-[#E2E8F0]">
                <CardContent className="p-8 text-center">
                  <Loader2 className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
                  <p className="text-sm text-[#64748B]">No processing jobs</p>
                </CardContent>
              </Card>
            ) : processing.map((job) => (
              <Card key={job.id} className="border-[#E2E8F0]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${job.status === 'processing' ? 'bg-blue-50' : job.status === 'completed' ? 'bg-green-50' : job.status === 'failed' ? 'bg-red-50' : 'bg-amber-50'}`}>
                        {job.status === 'processing' && <Loader2 className="w-4 h-4 text-[#003ABC] animate-spin" />}
                        {job.status === 'completed' && <FileCheck className="w-4 h-4 text-green-600" />}
                        {job.status === 'failed' && <FileWarning className="w-4 h-4 text-red-600" />}
                        {job.status === 'queued' && <Clock className="w-4 h-4 text-amber-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">{job.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-[#64748B] border-slate-200">
                            {job.type}
                          </Badge>
                          <span className="text-[10px] text-[#64748B]">
                            Started {new Date(job.startedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.eta && job.status === 'processing' && (
                        <span className="text-xs text-[#64748B]">ETA: {job.eta}</span>
                      )}
                      {getStatusBadge(job.status)}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[#64748B]">{job.step}</p>
                      <span className="text-xs font-medium text-[#1E293B]">{Math.round(job.progress)}%</span>
                    </div>
                    <Progress
                      value={job.progress}
                      className={`h-1.5 ${
                        job.status === 'failed'
                          ? '[&>div]:bg-red-500'
                          : job.status === 'completed'
                            ? '[&>div]:bg-green-500'
                            : job.status === 'processing'
                              ? '[&>div]:bg-[#003ABC]'
                              : '[&>div]:bg-amber-500'
                      }`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Templates Tab ──────────────────────────────────────── */}
        <TabsContent value="templates" className="mt-4">
          {templates.length === 0 ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-8 text-center">
                <LayoutTemplate className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
                <p className="text-sm text-[#64748B]">No templates available</p>
              </CardContent>
            </Card>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => {
              const TemplateIcon = getTemplateIcon(tmpl.icon)
              return (
                <Card key={tmpl.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${getTemplateIconColor(tmpl.category)} flex items-center justify-center`}>
                          <TemplateIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm text-[#1E293B]">{tmpl.name}</CardTitle>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 bg-slate-50 text-[#64748B] border-slate-200">
                            {tmpl.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-[#64748B] leading-relaxed">{tmpl.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                      <span>Used {tmpl.usageCount.toLocaleString()} times</span>
                      <span>Last used {tmpl.lastUsed}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8 border-[#E2E8F0] text-[#003ABC] hover:bg-[#003ABC]/10 group-hover:border-[#003ABC]/30"
                    >
                      <LayoutTemplate className="w-3 h-3 mr-1.5" />
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}