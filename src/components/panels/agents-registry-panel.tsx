'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Agent {
  id: string
  agentId: string
  name: string
  departmentName: string
  role: string
  status: string
  version: string
}

interface Department {
  id: string
  name: string
  slug: string
}

export default function AgentsRegistryPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const limit = 50

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((res) => setDepartments(res.data || []))
      .catch(() => {})
  }, [])

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // Fetch agents
  useEffect(() => {
    let cancelled = false
     
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (deptFilter) params.set('department', deptFilter)
    if (statusFilter) params.set('status', statusFilter)

    fetch(`/api/agents?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          setAgents(res.data || [])
          setTotal(res.total || 0)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [page, search, deptFilter, statusFilter])

  const totalPages = Math.ceil(total / limit)
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-600/10 text-emerald-600'
      case 'locked': return 'bg-amber-600/10 text-amber-600'
      case 'disabled': return 'bg-red-600/10 text-red-600'
      default: return 'bg-gray-100 text-[#64748B]'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-[#1E293B]">Agent Registry</h2>
        <span className="text-sm text-[#64748B]">
          Showing {total > 0 ? `${from}-${to}` : '0'} of {total} agents
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search agents..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
          />
        </div>
        <Select value={deptFilter || '__all__'} onValueChange={(v) => { setDeptFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[200px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
            <SelectItem value="__all__" className="text-[#1E293B]">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.slug} value={d.slug} className="text-[#1E293B]">{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[140px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="active" className="text-[#1E293B]">Active</SelectItem>
            <SelectItem value="locked" className="text-[#1E293B]">Locked</SelectItem>
            <SelectItem value="disabled" className="text-[#1E293B]">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Agent ID</TableHead>
                  <TableHead className="text-[#64748B]">Name</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Department</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Role</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[#64748B] py-12">No agents found</TableCell>
                  </TableRow>
                ) : (
                  agents.map((agent) => (
                    <TableRow key={agent.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="font-mono text-xs text-[#FF6A00]">{agent.agentId}</TableCell>
                      <TableCell className="text-[#1E293B] font-medium">{agent.name}</TableCell>
                      <TableCell className="text-[#64748B] hidden md:table-cell">{agent.departmentName}</TableCell>
                      <TableCell className="text-[#64748B] hidden lg:table-cell capitalize">{agent.role}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] py-0 ${statusColor(agent.status)}`}>
                          {agent.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#64748B] font-mono text-xs hidden sm:table-cell">{agent.version || '1.0.0'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#64748B]">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}