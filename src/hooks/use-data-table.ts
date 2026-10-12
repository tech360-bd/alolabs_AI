'use client'

import { useState, useEffect } from 'react'
import { fetchApi, buildQueryString } from '@/lib/api'

interface UseDataTableOptions<T> {
  endpoint: string
  defaultParams?: Record<string, string | number | undefined>
}

interface UseDataTableReturn<T> {
  data: T[]
  total: number
  loading: boolean
  error: string
  page: number
  pageSize: number
  search: string
  filters: Record<string, string>
  setPage: (p: number) => void
  setPageSize: (s: number) => void
  setSearch: (s: string) => void
  setFilter: (key: string, val: string) => void
  refresh: () => void
  setFilters: (f: Record<string, string>) => void
}

export function useDataTable<T = any>(opts: UseDataTableOptions<T>): UseDataTableReturn<T> {
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = () => setRefreshCounter((c) => c + 1)

  const params: Record<string, string | number | undefined> = {
    ...opts.defaultParams,
    page,
    limit: pageSize,
    search: search || undefined,
    ...filters,
  }

  useEffect(() => {
    let cancelled = false
    const qs = buildQueryString(params)
    setLoading(true)
    setError('')
    fetchApi<{ data: T[]; total: number }>(`${opts.endpoint}${qs}`)
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? (Array.isArray(res) ? res : []))
        setTotal(res.total ?? (Array.isArray(res) ? res.length : 0))
      })
      .catch((e: any) => {
        if (cancelled) return
        setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [opts.endpoint, JSON.stringify(params), refreshCounter])

  return {
    data, total, loading, error, page, pageSize, search, filters,
    setPage, setPageSize, setSearch, setFilter: (k, v) => setFilters((f) => ({ ...f, [k]: v })),
    refresh, setFilters,
  }
}