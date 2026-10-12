'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Database,
  FileText,
  Search,
  MessageCircle,
  Upload,
  Plus,
  Lock,
  Loader2,
  Send,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface Collection {
  id: string
  companyId: string | null
  name: string
  description: string | null
  documentCount: number
  status: string
  createdAt: string
  updatedAt: string
  _count?: { documents: number }
}

interface Document {
  id: string
  collectionId: string
  companyId: string | null
  name: string
  source: string | null
  classification: string
  checksum: string | null
  version: number
  status: string
  chunkCount: number
  createdAt: string
  indexedAt: string | null
}

interface QueryLog {
  id: string
  companyId: string | null
  userId: string | null
  query: string
  collectionId: string | null
  resultCount: number
  status: string
  durationMs: number | null
  createdAt: string
  _count?: { answers: number; feedback: number }
}

function getClassificationBadge(classification: string) {
  const map: Record<string, string> = {
    public: 'bg-emerald-100 text-emerald-700',
    internal: 'bg-blue-100 text-blue-700',
    confidential: 'bg-red-100 text-red-700',
    restricted: 'bg-orange-100 text-orange-700',
    highly_restricted: 'bg-red-200 text-red-800',
  }
  return map[classification] || 'bg-gray-100 text-gray-700'
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600',
    processing: 'bg-amber-500/10 text-amber-600',
    inactive: 'bg-red-500/10 text-red-500',
    indexed: 'bg-green-500/10 text-green-600',
    pending: 'bg-amber-500/10 text-amber-600',
    failed: 'bg-red-500/10 text-red-500',
    success: 'bg-green-500/10 text-green-600',
    no_results: 'bg-gray-100 text-gray-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

export default function RagPanel() {
  const [loading, setLoading] = useState(true)
  const [collections, setCollections] = useState<Collection[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [queryLogs, setQueryLogs] = useState<QueryLog[]>([])
  const [activeTab, setActiveTab] = useState('collections')

  // Create collection dialog
  const [createColOpen, setCreateColOpen] = useState(false)
  const [colName, setColName] = useState('')
  const [colDesc, setColDesc] = useState('')
  const [colSubmitting, setColSubmitting] = useState(false)

  // Upload document dialog
  const [uploadDocOpen, setUploadDocOpen] = useState(false)
  const [docName, setDocName] = useState('')
  const [docCollectionId, setDocCollectionId] = useState('')
  const [docSource, setDocSource] = useState('')
  const [docClassification, setDocClassification] = useState('internal')
  const [docSubmitting, setDocSubmitting] = useState(false)

  // Query interface
  const [queryText, setQueryText] = useState('')
  const [queryCollectionId, setQueryCollectionId] = useState('')
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryResult, setQueryResult] = useState<{
    query: QueryLog
    answer: { content: string; confidence: number }
    chunks: { id: string; content: string; metadata: string; position: number }[]
  } | null>(null)

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/rag/collections').then((r) => r.json()),
      fetch('/api/rag/documents').then((r) => r.json()),
      fetch('/api/rag/logs').then((r) => r.json()),
    ])
      .then(([cols, docs, logs]) => {
        setCollections(Array.isArray(cols) ? cols : [])
        setDocuments(Array.isArray(docs) ? docs : [])
        setQueryLogs(Array.isArray(logs) ? logs : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCreateCollection = async () => {
    if (!colName.trim()) return
    setColSubmitting(true)
    try {
      const res = await fetch('/api/rag/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: colName.trim(), description: colDesc || undefined }),
      })
      if (!res.ok) throw new Error('Failed to create collection')
      toast.success('Collection created')
      setColName('')
      setColDesc('')
      setCreateColOpen(false)
      fetchAll()
    } catch {
      toast.error('Failed to create collection')
    } finally {
      setColSubmitting(false)
    }
  }

  const handleUploadDocument = async () => {
    if (!docName.trim() || !docCollectionId) return
    setDocSubmitting(true)
    try {
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: docCollectionId,
          name: docName.trim(),
          source: docSource || undefined,
          classification: docClassification,
        }),
      })
      if (!res.ok) throw new Error('Failed to upload document')
      toast.success('Document uploaded')
      setDocName('')
      setDocCollectionId('')
      setDocSource('')
      setDocClassification('internal')
      setUploadDocOpen(false)
      fetchAll()
    } catch {
      toast.error('Failed to upload document')
    } finally {
      setDocSubmitting(false)
    }
  }

  const handleQuery = async () => {
    if (!queryText.trim()) return
    setQueryLoading(true)
    setQueryResult(null)
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText.trim(),
          collectionId: queryCollectionId || undefined,
        }),
      })
      if (!res.ok) throw new Error('Query failed')
      const data = await res.json()
      setQueryResult(data)
      // Refresh logs
      fetch('/api/rag/logs')
        .then((r) => r.json())
        .then((logs) => setQueryLogs(Array.isArray(logs) ? logs : []))
        .catch(() => {})
    } catch {
      toast.error('Query failed')
    } finally {
      setQueryLoading(false)
    }
  }

  // Stats
  const totalCollections = collections.length
  const totalDocuments = documents.length
  const totalQueries = queryLogs.length
  const totalResults = queryLogs.reduce((sum, q) => sum + (q.resultCount || 0), 0)

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString() } catch { return dateStr }
  }
  const formatDateTime = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleString() } catch { return dateStr }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-[#1E293B]">RAG Knowledge Center</h2>
        <div className="flex items-center gap-2">
          <Dialog open={createColOpen} onOpenChange={setCreateColOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-[#003ABC] border-[#003ABC]/30 hover:bg-[#003ABC]/5 rounded-lg">
                <Plus className="w-4 h-4 mr-2" />
                New Collection
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#1E293B]">Create Collection</DialogTitle>
                <DialogDescription className="text-[#64748B]">Create a new document collection for RAG.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Collection Name</Label>
                  <Input
                    placeholder="e.g., Product Docs"
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Description</Label>
                  <Textarea
                    placeholder="Optional description..."
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg min-h-[60px]"
                    value={colDesc}
                    onChange={(e) => setColDesc(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                  onClick={handleCreateCollection}
                  disabled={!colName.trim() || colSubmitting}
                >
                  {colSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Collection
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={uploadDocOpen} onOpenChange={setUploadDocOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg">
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#1E293B]">Upload Document</DialogTitle>
                <DialogDescription className="text-[#64748B]">Add a document to a RAG collection.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Collection</Label>
                  <Select value={docCollectionId} onValueChange={setDocCollectionId}>
                    <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                      <SelectValue placeholder="Select collection" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                      {collections.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-[#1E293B]">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Document Name</Label>
                  <Input
                    placeholder="e.g., Q4 Report.pdf"
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Source</Label>
                  <Input
                    placeholder="e.g., upload, url, sync"
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                    value={docSource}
                    onChange={(e) => setDocSource(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Classification</Label>
                  <Select value={docClassification} onValueChange={setDocClassification}>
                    <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                      <SelectItem value="public" className="text-[#1E293B]">Public</SelectItem>
                      <SelectItem value="internal" className="text-[#1E293B]">Internal</SelectItem>
                      <SelectItem value="confidential" className="text-[#1E293B]">Confidential</SelectItem>
                      <SelectItem value="restricted" className="text-[#1E293B]">Restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                  onClick={handleUploadDocument}
                  disabled={!docName.trim() || !docCollectionId || docSubmitting}
                >
                  {docSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Upload
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Database, label: 'Collections', value: totalCollections, color: 'text-[#003ABC]' },
          { icon: FileText, label: 'Documents', value: totalDocuments, color: 'text-[#FF6A00]' },
          { icon: Search, label: 'Queries', value: totalQueries, color: 'text-emerald-600' },
          { icon: MessageCircle, label: 'Results', value: totalResults, color: 'text-purple-600' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#94A3B8]" />
                <span className="text-xs text-[#64748B]">{stat.label}</span>
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* Isolation Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-[#003ABC] mt-0.5 flex-shrink-0" />
        <p className="text-sm text-[#1E293B]">
          Company data is isolated. Cross-company RAG queries are <span className="font-semibold text-red-500">blocked</span>.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-[#E2E8F0] rounded-lg h-10 p-1">
          <TabsTrigger value="collections" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <Database className="w-3.5 h-3.5 mr-1.5" />
            Collections
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="query" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Query
          </TabsTrigger>
        </TabsList>

        {/* Collections Tab */}
        <TabsContent value="collections" className="mt-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                    <TableHead className="text-[#64748B] text-xs font-medium">Name</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium text-center">Documents</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium hidden lg:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[#94A3B8] py-12 text-sm">No collections found</TableCell>
                    </TableRow>
                  ) : (
                    collections.map((col) => (
                      <TableRow key={col.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <TableCell className="text-[#1E293B] font-medium text-sm">{col.name}</TableCell>
                        <TableCell className="text-[#64748B] text-sm hidden md:table-cell max-w-xs truncate">{col.description || '—'}</TableCell>
                        <TableCell className="text-center text-[#1E293B] text-sm font-medium">
                          {col._count?.documents ?? col.documentCount ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] py-0 border-0 ${getStatusBadge(col.status)}`}>
                            {col.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#94A3B8] text-xs hidden lg:table-cell">{formatDate(col.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                    <TableHead className="text-[#64748B] text-xs font-medium">Name</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium">Classification</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium hidden sm:table-cell">Source</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium text-center">Chunks</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[#94A3B8] py-12 text-sm">No documents found</TableCell>
                    </TableRow>
                  ) : (
                    documents.map((doc) => (
                      <TableRow key={doc.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <TableCell className="text-[#1E293B] font-medium text-sm">{doc.name}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] py-0 border-0 ${getClassificationBadge(doc.classification)}`}>
                            {doc.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-sm hidden sm:table-cell">{doc.source || '—'}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] py-0 border-0 ${getStatusBadge(doc.status)}`}>
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-[#1E293B] text-sm">{doc.chunkCount}</TableCell>
                        <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">{formatDate(doc.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Query Tab */}
        <TabsContent value="query" className="mt-4 space-y-4">
          {/* Query Input */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Query Knowledge Base</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Ask a question about your documents..."
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleQuery()
                    }
                  }}
                />
              </div>
              <Select value={queryCollectionId} onValueChange={setQueryCollectionId}>
                <SelectTrigger className="w-[200px] bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs flex-shrink-0">
                  <SelectValue placeholder="All Collections" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                  <SelectItem value="" className="text-[#1E293B]">All Collections</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-[#1E293B]">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg flex-shrink-0"
                onClick={handleQuery}
                disabled={!queryText.trim() || queryLoading}
              >
                {queryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Query Result */}
          {queryResult && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {queryResult.query.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <h3 className="text-sm font-semibold text-[#1E293B]">Result</h3>
                  <Badge className={`text-[10px] py-0 border-0 ${getStatusBadge(queryResult.query.status)}`}>
                    {queryResult.query.status === 'success' ? 'Found' : 'No Results'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                  <span>{queryResult.chunks.length} chunks</span>
                  <span>{queryResult.query.durationMs}ms</span>
                  <span>{Math.round(queryResult.answer.confidence * 100)}% confidence</span>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-[#1E293B] whitespace-pre-wrap leading-relaxed">{queryResult.answer.content}</p>
              </div>
              {queryResult.chunks.length > 0 && (
                <div className="px-4 pb-4">
                  <h4 className="text-xs font-semibold text-[#64748B] mb-2">Source Chunks</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {queryResult.chunks.map((chunk, idx) => (
                      <div key={chunk.id} className="bg-[#F8FAFC] rounded-lg p-3 border border-[#E2E8F0]">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="text-[9px] py-0 border-0 bg-[#003ABC]/10 text-[#003ABC]">Chunk {idx + 1}</Badge>
                          <span className="text-[10px] text-[#94A3B8]">Position {chunk.position}</span>
                        </div>
                        <p className="text-xs text-[#64748B] line-clamp-3">{chunk.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Query History */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="p-4 pb-0">
              <h3 className="text-sm font-semibold text-[#1E293B]">Query History</h3>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                    <TableHead className="text-[#64748B] text-xs font-medium">Query</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium text-center">Results</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium">Duration</TableHead>
                    <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queryLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[#94A3B8] py-12 text-sm">No queries yet</TableCell>
                    </TableRow>
                  ) : (
                    queryLogs.map((q) => (
                      <TableRow key={q.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                        <TableCell className="text-[#1E293B] text-sm max-w-xs truncate">{q.query}</TableCell>
                        <TableCell className="text-center text-[#1E293B] text-sm font-medium">{q.resultCount}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] py-0 border-0 ${getStatusBadge(q.status)}`}>
                            {q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-sm">{q.durationMs ? `${q.durationMs}ms` : '—'}</TableCell>
                        <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">{formatDateTime(q.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}