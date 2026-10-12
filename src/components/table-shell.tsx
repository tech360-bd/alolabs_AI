'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { ReactNode } from 'react'

interface TableShellProps {
  loading: boolean
  error: string
  totalCount: number
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  searchValue: string
  onSearchChange: (s: string) => void
  searchPlaceholder?: string
  children: ReactNode
  headerRight?: ReactNode
  noDataMessage?: string
}

export default function TableShell({
  loading, error, totalCount, page, pageSize,
  onPageChange, onPageSizeChange, searchValue, onSearchChange,
  searchPlaceholder = 'Search...', children, headerRight, noDataMessage = 'No data found.',
}: TableShellProps) {
  const totalPages = Math.ceil(totalCount / pageSize) || 1
  const showing = loading ? '...' : `${Math.min((page - 1) * pageSize + 1, totalCount)}-${Math.min(page * pageSize, totalCount)}`
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24 ml-auto" />
        </div>
        <div className="rounded-lg border">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-full border-b last:border-0" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 sm:max-w-xs"
        />
        {headerRight}
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {children}

      {!error && totalCount === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">{noDataMessage}</p>
      )}

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Showing {showing} of {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-accent"
            >
              Prev
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-accent"
            >
              Next
            </button>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded border text-xs bg-background px-1"
            >
              {[10, 20, 50].map((s) => (
                <option key={s} value={s}>{s}/page</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}