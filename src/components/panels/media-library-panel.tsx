'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Image,
  ImageIcon as ImageIconLucide,
  Video,
  File,
  Upload,
  FolderOpen,
  Search,
  Grid,
  List,
  Trash2,
  Download,
  Copy,
  MoreVertical,
  X,
  Check,
  Plus,
  RefreshCw,
  Loader2,
  Folder,
  ImagePlus,
  Sparkles,
  FolderPlus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MediaFile {
  id: string
  name: string
  url: string
  size: number
  type: 'image' | 'video' | 'document' | 'other'
  mimeType: string
  folder: string
  tags: string[]
  thumbnailUrl?: string | null
  createdAt: string
  updatedAt: string
}

interface MediaFolder {
  id: string
  name: string
  type: 'image' | 'video' | 'document' | 'custom'
  count: number
  createdAt: string
}

interface UploadProgress {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  id: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getFileType(mimeType: string, name: string): 'image' | 'video' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv']
  const ext = '.' + name.split('.').pop()?.toLowerCase()
  if (docExts.includes(ext)) return 'document'
  return 'other'
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'image': return Image
    case 'video': return Video
    case 'document': return File
    default: return File
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'image': return { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' }
    case 'video': return { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' }
    case 'document': return { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' }
  }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function MediaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#E2E8F0] overflow-hidden">
            <Skeleton className="h-32 w-full bg-gray-100" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-3.5 w-3/4 bg-gray-100" />
              <Skeleton className="h-3 w-1/2 bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Folder Tree Item ────────────────────────────────────────────────────────

function FolderItem({
  folder,
  active,
  count,
  onClick,
}: {
  folder: { id: string; name: string; type: string; icon: React.ElementType; color: string }
  active: boolean
  count: number
  onClick: () => void
}) {
  const Icon = folder.icon
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
        active
          ? 'bg-[#003ABC]/8 text-[#003ABC] font-medium'
          : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9]'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#003ABC]' : folder.color}`} />
      <span className="truncate text-[13px]">{folder.name}</span>
      {count > 0 && (
        <span className="ml-auto text-[10px] text-[#94A3B8] tabular-nums">{count}</span>
      )}
    </button>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function MediaLibraryPanel() {

  // State
  const [files, setFiles] = useState<MediaFile[]>([])
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState<string>('all')
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 24

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dialogs
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [aiTagging, setAiTagging] = useState<string | null>(null)

  // ─── Fetch files ──────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      })
      if (searchQuery) params.set('search', searchQuery)
      if (activeFolder !== 'all') params.set('folder', activeFolder)
      if (activeTypeFilter !== 'all') params.set('type', activeTypeFilter)

      const res = await fetch(`/api/media?${params}`)
      if (res.ok) {
        const json = await res.json()
        setFiles(json.data || [])
        setTotalPages(json.totalPages || 1)
      }
    } catch {
      toast.error('Error', { description: 'Failed to load media files' })
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, activeFolder, activeTypeFilter, toast])

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/media/folders')
      if (res.ok) {
        const json = await res.json()
        setFolders(json.data || [])
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchFiles()
  }, [fetchFiles])

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  // Reset to page 1 on filter changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery, activeFolder, activeTypeFilter])

  // ─── Folder counts ────────────────────────────────────────────────────────

  const folderCounts = folders.reduce<Record<string, number>>((acc, f) => {
    acc[f.id] = f.count
    return acc
  }, {})

  const builtInFolders = [
    { id: 'all', name: 'All Files', type: 'all', icon: FolderOpen, color: 'text-[#64748B]' },
    { id: 'image', name: 'Images', type: 'image', icon: Image, color: 'text-emerald-500' },
    { id: 'video', name: 'Videos', type: 'video', icon: Video, color: 'text-purple-500' },
    { id: 'document', name: 'Documents', type: 'document', icon: File, color: 'text-amber-500' },
  ]

  const customFolders = folders
    .filter((f) => f.type === 'custom')
    .map((f) => ({ id: f.name, name: f.name, type: 'custom', icon: Folder, color: 'text-[#003ABC]' }))

  const allFolders = [...builtInFolders, ...customFolders]

  // ─── Upload handlers ──────────────────────────────────────────────────────

  const uploadFiles = async (filesList: FileList | File[]) => {
    const newProgress: UploadProgress[] = Array.from(filesList).map((file) => ({
      file,
      progress: 0,
      status: 'pending' as const,
      id: crypto.randomUUID(),
    }))
    setUploadProgress((prev) => [...prev, ...newProgress])

    for (const item of newProgress) {
      setUploadProgress((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', progress: 10 } : p))
      )

      try {
        const formData = new FormData()
        formData.append('file', item.file)
        if (activeFolder !== 'all' && !['image', 'video', 'document'].includes(activeFolder)) {
          formData.append('folder', activeFolder)
        }

        // Set indeterminate progress (-1) while uploading
        setUploadProgress((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', progress: -1 } : p))
        )

        const res = await fetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        })

        if (res.ok) {
          setUploadProgress((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: 'success', progress: 100 } : p))
          )
        } else {
          setUploadProgress((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: 'error', progress: 0 } : p))
          )
        }
      } catch {
        setUploadProgress((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'error', progress: 0 } : p))
        )
      }
    }

    // Refresh files after all uploads complete
    fetchFiles()
    fetchFolders()

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploadProgress((prev) => prev.filter((p) => p.status === 'uploading'))
    }, 3000)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  // ─── File actions ─────────────────────────────────────────────────────────

  const handleDelete = async (ids: string[]) => {
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => !ids.includes(f.id)))
        setSelectedFiles((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        toast.success('Deleted', { description: `${ids.length} file${ids.length > 1 ? 's' : ''} deleted` })
        fetchFolders()
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete files' })
    }
  }

  const handleCopyLink = (file: MediaFile) => {
    navigator.clipboard.writeText(file.url || window.location.origin + '/api/media/' + file.id)
    toast.success('Copied', { description: 'Link copied to clipboard'  })
  }

  const handleMoveToFolder = async (folderName: string) => {
    if (selectedFiles.size === 0) return
    try {
      const res = await fetch('/api/media', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedFiles),
          folder: folderName,
        }),
      })
      if (res.ok) {
        toast.success('Moved', { description: `Files moved to ${folderName}` })
        setSelectedFiles(new Set())
        setMoveDialogOpen(false)
        fetchFiles()
        fetchFolders()
      }
    } catch {
      toast.error('Error', { description: 'Failed to move files' })
    }
  }

  const handleAiTag = async (file: MediaFile) => {
    setAiTagging(file.id)
    try {
      const res = await fetch('/api/media/ai-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, url: file.url }),
      })
      if (res.ok) {
        const json = await res.json()
        const tags = json.data?.tags || []
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, tags: [...new Set([...f.tags, ...tags])] } : f))
        )
        toast.success('Tags Added', { description: `${tags.length} AI-generated tags added` })
      }
    } catch {
      toast.error('Error', { description: 'AI tagging failed' })
    } finally {
      setAiTagging(null)
    }
  }

  // ─── Create folder ────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      })
      if (res.ok) {
        toast.success('Created', { description: `Folder "${newFolderName.trim()}" created` })
        setNewFolderName('')
        setCreateFolderOpen(false)
        fetchFolders()
      }
    } catch {
      toast.error('Error', { description: 'Failed to create folder' })
    }
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(files.map((f) => f.id)))
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)
  const imageCount = files.filter((f) => f.type === 'image').length
  const videoCount = files.filter((f) => f.type === 'video').length
  const docCount = files.filter((f) => f.type === 'document').length

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <ImageIconLucide className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Media Library</h2>
            <p className="text-xs text-[#94A3B8]">
              {files.length} files · {formatFileSize(totalSize)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setLoading(true); fetchFiles(); fetchFolders() }}
            className="gap-1.5 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#1E293B]">Create New Folder</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="border-[#E2E8F0] focus:border-[#003ABC]"
              />
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(false)} className="border-[#E2E8F0] text-[#64748B]">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateFolder} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Images', value: imageCount, icon: Image, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Videos', value: videoCount, icon: Video, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Documents', value: docCount, icon: File, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Size', value: formatFileSize(totalSize), icon: FolderOpen, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-[10px] text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload progress */}
      {uploadProgress.length > 0 && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Uploading ({uploadProgress.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {uploadProgress.map((up) => (
              <div key={up.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#1E293B] truncate max-w-[200px]">{up.file.name}</p>
                    <span className="text-[10px] text-[#94A3B8] ml-2">
                      {up.progress < 0 ? 'Uploading…' : `${up.progress}%`}
                    </span>
                  </div>
                  <Progress value={up.progress < 0 ? undefined : up.progress} className={`h-1.5 ${up.progress < 0 ? 'animate-pulse' : ''}`} />
                </div>
                {up.status === 'success' && <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                {up.status === 'error' && <X className="h-4 w-4 text-red-500 flex-shrink-0" />}
                {up.status === 'uploading' && <Loader2 className="h-4 w-4 text-[#003ABC] animate-spin flex-shrink-0" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar: Folder tree */}
        <Card className="border-[#E2E8F0] lg:w-56 flex-shrink-0">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] px-3 pb-2">Folders</p>
            <ScrollArea className="max-h-80">
              <div className="space-y-0.5">
                {allFolders.map((folder) => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    active={activeFolder === folder.id}
                    count={folderCounts[folder.id] || 0}
                    onClick={() => setActiveFolder(folder.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main content area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Search + filters bar */}
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                  <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs border-[#E2E8F0] focus:border-[#003ABC]"
                  />
                </div>
                <Tabs value={activeTypeFilter} onValueChange={setActiveTypeFilter}>
                  <TabsList className="bg-[#F1F5F9] h-8">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'image', label: 'Images' },
                      { value: 'video', label: 'Videos' },
                      { value: 'document', label: 'Docs' },
                    ].map((tab) => (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="text-[11px] px-3 data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm"
                      >
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="flex items-center border border-[#E2E8F0] rounded-md">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-r-none ${viewMode === 'grid' ? 'bg-[#003ABC]/10 text-[#003ABC]' : 'text-[#94A3B8]'}`}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-l-none ${viewMode === 'list' ? 'bg-[#003ABC]/10 text-[#003ABC]' : 'text-[#94A3B8]'}`}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk actions bar */}
          {selectedFiles.size > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#003ABC]/5 border border-[#003ABC]/20">
              <span className="text-xs font-medium text-[#003ABC]">{selectedFiles.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1 border-[#E2E8F0] text-[#64748B] hover:text-red-600 hover:border-red-200"
                onClick={() => handleDelete(Array.from(selectedFiles))}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
              <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1 border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
                  >
                    <FolderPlus className="h-3 w-3" />
                    Move
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white border-[#E2E8F0] sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-[#1E293B]">Move to Folder</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {customFolders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleMoveToFolder(f.name)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#1E293B] hover:bg-[#F1F5F9] transition-colors"
                      >
                        {f.name}
                      </button>
                    ))}
                    {customFolders.length === 0 && (
                      <p className="text-xs text-[#94A3B8] px-3 py-4 text-center">No custom folders. Create one first.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-[#94A3B8] hover:text-[#1E293B]"
                onClick={() => setSelectedFiles(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Drop zone + content */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`rounded-xl transition-all duration-200 ${
              isDragOver ? 'ring-2 ring-dashed ring-[#003ABC] bg-[#003ABC]/5' : ''
            }`}
          >
            {loading ? (
              <MediaSkeleton />
            ) : files.length === 0 && !isDragOver ? (
              /* Empty state */
              <Card className="border-[#E2E8F0]">
                <CardContent className="py-16 flex flex-col items-center justify-center text-center">
                  <div className="h-16 w-16 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
                    <ImagePlus className="h-8 w-8 text-[#CBD5E1]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#1E293B] mb-1">No files yet</h3>
                  <p className="text-xs text-[#94A3B8] mb-4 max-w-[240px]">
                    Drag and drop files here, or click Upload to add your first media files.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Files
                  </Button>
                </CardContent>
              </Card>
            ) : isDragOver ? (
              /* Drag over state */
              <Card className="border-dashed border-2 border-[#003ABC] bg-[#003ABC]/5">
                <CardContent className="py-16 flex flex-col items-center justify-center">
                  <Upload className="h-10 w-10 text-[#003ABC] mb-3 animate-bounce" />
                  <p className="text-sm font-semibold text-[#003ABC]">Drop files to upload</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Supports images, videos, and documents</p>
                </CardContent>
              </Card>
            ) : viewMode === 'grid' ? (
              /* Grid view */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {files.map((file) => {
                  const typeColor = getTypeColor(file.type)
                  const TypeIcon = getTypeIcon(file.type)
                  return (
                    <Card
                      key={file.id}
                      className={`border-[#E2E8F0] overflow-hidden group hover:shadow-md transition-shadow ${
                        selectedFiles.has(file.id) ? 'ring-2 ring-[#003ABC] border-[#003ABC]' : ''
                      }`}
                    >
                      {/* Thumbnail / preview area */}
                      <div className="relative aspect-square bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
                        {file.type === 'image' && file.thumbnailUrl ? (
                          <img
                            src={file.thumbnailUrl}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <TypeIcon className={`h-10 w-10 ${typeColor.text} opacity-40`} />
                        )}
                        {/* Checkbox overlay */}
                        <div className="absolute top-2 left-2">
                          <div
                            className={`h-5 w-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                              selectedFiles.has(file.id)
                                ? 'bg-[#003ABC] border-[#003ABC]'
                                : 'bg-white/80 border-[#CBD5E1] opacity-0 group-hover:opacity-100'
                            }`}
                            onClick={() => toggleSelect(file.id)}
                          >
                            {selectedFiles.has(file.id) && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                        {/* Actions overlay */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 bg-white/90 shadow-sm hover:bg-white rounded-md"
                              >
                                <MoreVertical className="h-3.5 w-3.5 text-[#1E293B]" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-white border-[#E2E8F0]">
                              {file.url && (
                                <DropdownMenuItem
                                  className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                                  onClick={() => window.open(file.url, '_blank')}
                                >
                                  <Download className="h-3.5 w-3.5 mr-2" />
                                  Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                                onClick={() => handleCopyLink(file)}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" />
                                Copy Link
                              </DropdownMenuItem>
                              {file.type === 'image' && (
                                <DropdownMenuItem
                                  className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                                  onClick={() => handleAiTag(file)}
                                  disabled={aiTagging === file.id}
                                >
                                  {aiTagging === file.id ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                                  )}
                                  AI Tag
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator className="bg-[#E2E8F0]" />
                              <DropdownMenuItem
                                className="text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                                onClick={() => handleDelete([file.id])}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <p className="text-xs font-medium text-[#1E293B] truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-[#94A3B8]">{formatFileSize(file.size)}</span>
                          <span className="text-[10px] text-[#CBD5E1]">·</span>
                          <span className="text-[10px] text-[#94A3B8]">{timeAgo(file.createdAt)}</span>
                        </div>
                        {file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {file.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 font-normal border-[#E2E8F0] text-[#64748B]"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {file.tags.length > 3 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 font-normal border-[#E2E8F0] text-[#94A3B8]"
                              >
                                +{file.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            ) : (
              /* List view */
              <Card className="border-[#E2E8F0] overflow-hidden">
                <div className="divide-y divide-[#E2E8F0]">
                  {/* List header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[#F8FAFC]">
                    <div className="w-5 flex items-center justify-center">
                      <Checkbox
                        checked={selectedFiles.size === files.length && files.length > 0}
                        onCheckedChange={toggleSelectAll}
                        className="h-4 w-4"
                      />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] flex-1">Name</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] w-20 text-right hidden md:block">Size</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] w-20 text-right hidden md:block">Type</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] w-24 text-right hidden lg:block">Date</span>
                    <span className="w-8" />
                  </div>
                  {files.map((file) => {
                    const TypeIcon = getTypeIcon(file.type)
                    const typeColor = getTypeColor(file.type)
                    return (
                      <div
                        key={file.id}
                        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer ${
                          selectedFiles.has(file.id) ? 'bg-[#003ABC]/5' : ''
                        }`}
                        onClick={() => toggleSelect(file.id)}
                      >
                        <div className="w-5 flex items-center justify-center">
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            className="h-4 w-4"
                          />
                        </div>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`h-8 w-8 rounded-lg ${typeColor.bg} flex items-center justify-center flex-shrink-0`}>
                            <TypeIcon className={`h-4 w-4 ${typeColor.text}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#1E293B] truncate">{file.name}</p>
                            {file.tags.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {file.tags.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-[8px] px-1 py-0 h-3.5 font-normal border-[#E2E8F0] text-[#94A3B8]"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] text-[#94A3B8] w-20 text-right hidden md:block tabular-nums">
                          {formatFileSize(file.size)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-5 font-normal w-20 justify-center hidden md:block border-[#E2E8F0] text-[#64748B]"
                        >
                          {file.type}
                        </Badge>
                        <span className="text-[11px] text-[#94A3B8] w-24 text-right hidden lg:block">
                          {timeAgo(file.createdAt)}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[#94A3B8] hover:text-[#1E293B]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 bg-white border-[#E2E8F0]">
                            {file.url && (
                              <DropdownMenuItem
                                className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                                onClick={(e) => { e.stopPropagation(); window.open(file.url, '_blank') }}
                              >
                                <Download className="h-3.5 w-3.5 mr-2" />
                                Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                              onClick={(e) => { e.stopPropagation(); handleCopyLink(file) }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                            {file.type === 'image' && (
                              <DropdownMenuItem
                                className="text-xs text-[#1E293B] focus:bg-[#F1F5F9] focus:text-[#003ABC]"
                                onClick={(e) => { e.stopPropagation(); handleAiTag(file) }}
                                disabled={aiTagging === file.id}
                              >
                                {aiTagging === file.id ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                                )}
                                AI Tag
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="bg-[#E2E8F0]" />
                            <DropdownMenuItem
                              className="text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                              onClick={(e) => { e.stopPropagation(); handleDelete([file.id]) }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Pagination */}
          {!loading && files.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#94A3B8]">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC] disabled:opacity-40"
                >
                  Previous
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum = page <= 3 ? i + 1 : i + page - 2
                  if (pageNum > totalPages) return null
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={page === pageNum ? 'default' : 'outline'}
                      onClick={() => setPage(pageNum)}
                      className={`h-7 w-7 text-xs p-0 ${
                        page === pageNum
                          ? 'bg-[#003ABC] text-white hover:bg-[#003ABC]/90'
                          : 'border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]'
                      }`}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC] disabled:opacity-40"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}